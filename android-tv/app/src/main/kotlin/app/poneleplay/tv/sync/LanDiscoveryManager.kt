package app.poneleplay.tv.sync

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

data class DiscoveredLanHub(
    val host: String,
    val port: Int,
    val serviceName: String,
    val discoveredAtMs: Long = System.currentTimeMillis()
)

/**
 * Discovers PonelePlay LAN Hub instances advertising `_poneleplay._tcp.` on local Wi-Fi/Ethernet.
 * Serializes resolveService calls so Android NsdManager never errors with FAILURE_ALREADY_ACTIVE.
 */
class LanDiscoveryManager(context: Context) {
    private val appContext = context.applicationContext
    private val nsdManager = appContext.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private val wifiManager = appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    private val _discoveredHub = MutableStateFlow<DiscoveredLanHub?>(null)
    val discoveredHub: StateFlow<DiscoveredLanHub?> = _discoveredHub.asStateFlow()

    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private val pendingResolve = ConcurrentLinkedQueue<NsdServiceInfo>()
    private val isResolving = AtomicBoolean(false)
    private val isRunning = AtomicBoolean(false)

    companion object {
        private const val TAG = "PonelePlayLAN"
        private const val SERVICE_TYPE = "_poneleplay._tcp."
    }

    fun start() {
        val manager = nsdManager ?: return
        if (!isRunning.compareAndSet(false, true)) return

        try {
            multicastLock = wifiManager?.createMulticastLock("poneleplay-tv-nsd")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (err: Exception) {
            Log.w(TAG, "MulticastLock unavailable: ${err.message}")
        }

        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {
                Log.d(TAG, "mDNS discovery started for $regType")
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                val svcType = serviceInfo.serviceType
                val svcName = serviceInfo.serviceName ?: ""
                if (svcType.contains("_poneleplay") || svcName.contains("PonelePlay", ignoreCase = true)) {
                    pendingResolve.add(serviceInfo)
                    drainResolveQueue()
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                val current = _discoveredHub.value
                if (current != null && current.serviceName == serviceInfo.serviceName) {
                    _discoveredHub.value = null
                }
            }

            override fun onDiscoveryStopped(serviceType: String) {
                Log.d(TAG, "mDNS discovery stopped for $serviceType")
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "mDNS discovery start failed ($errorCode)")
                isRunning.set(false)
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "mDNS discovery stop failed ($errorCode)")
            }
        }

        discoveryListener = listener
        try {
            manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (err: Exception) {
            Log.w(TAG, "Failed starting NSD discovery: ${err.message}")
            isRunning.set(false)
        }
    }

    fun stop() {
        if (!isRunning.compareAndSet(true, false)) return
        pendingResolve.clear()
        isResolving.set(false)

        val listener = discoveryListener
        discoveryListener = null
        if (listener != null) {
            try {
                nsdManager?.stopServiceDiscovery(listener)
            } catch (_: Exception) {}
        }

        try {
            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
            }
        } catch (_: Exception) {}
        multicastLock = null
    }

    @Suppress("DEPRECATION")
    private fun drainResolveQueue() {
        if (!isRunning.get()) return
        if (!isResolving.compareAndSet(false, true)) return

        val nextInfo = pendingResolve.poll()
        if (nextInfo == null) {
            isResolving.set(false)
            return
        }

        val manager = nsdManager
        if (manager == null) {
            isResolving.set(false)
            return
        }

        try {
            manager.resolveService(nextInfo, object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    Log.w(TAG, "NSD resolve failed for ${serviceInfo.serviceName}: $errorCode")
                    isResolving.set(false)
                    if (pendingResolve.isNotEmpty()) drainResolveQueue()
                }

                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    val ipv4 = serviceInfo.host
                        ?.takeIf { it is Inet4Address && !it.isLoopbackAddress }
                        ?.hostAddress
                        ?: serviceInfo.host?.hostAddress?.takeIf { !it.contains(':') }

                    val port = serviceInfo.port.takeIf { it > 0 } ?: 4321
                    if (!ipv4.isNullOrBlank()) {
                        Log.i(TAG, "Discovered LAN Hub at $ipv4:$port (${serviceInfo.serviceName})")
                        _discoveredHub.value = DiscoveredLanHub(
                            host = ipv4,
                            port = port,
                            serviceName = serviceInfo.serviceName ?: "PonelePlay LAN"
                        )
                    }
                    isResolving.set(false)
                    if (pendingResolve.isNotEmpty()) drainResolveQueue()
                }
            })
        } catch (err: Exception) {
            Log.w(TAG, "NSD resolveService exception: ${err.message}")
            isResolving.set(false)
        }
    }

    /**
     * Probes a single LAN host HTTP /health endpoint to verify it is a live PonelePlay LAN Hub.
     */
    fun probeLanHost(hostOrUrl: String, defaultPort: Int = 4321, timeoutMs: Int = 450): DiscoveredLanHub? {
        val (host, port) = SyncClockEstimator.normalizeLanHostAndPort(hostOrUrl, defaultPort) ?: return null
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("http://$host:$port/health")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)
                val service = json.optString("service", "")
                val ok = json.optBoolean("ok", false)
                if (ok && (service == "poneleplay-lan-hub" || service.isEmpty())) {
                    DiscoveredLanHub(
                        host = host,
                        port = port,
                        serviceName = "Cabina LAN ($host)"
                    )
                } else {
                    null
                }
            } else {
                null
            }
        } catch (_: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Fast zero-config discovery fallback when mDNS multicast is blocked on a router:
     * 1) Checks priority known hosts (cloud-advertised IPs or previously saved IPs) in parallel.
     * 2) Scans the local /24 IPv4 subnet concurrently using 36 workers with a 420ms per-host budget.
     */
    suspend fun scanLocalSubnetForLanHub(
        priorityHosts: List<String> = emptyList(),
        port: Int = 4321
    ): DiscoveredLanHub? = withContext(Dispatchers.IO) {
        val cleanPriority = priorityHosts.mapNotNull {
            SyncClockEstimator.normalizeLanHostAndPort(it, port)?.let { (h, p) -> "$h:$p" }
        }.distinct()

        if (cleanPriority.isNotEmpty()) {
            val winner = AtomicReference<DiscoveredLanHub?>(null)
            coroutineScope {
                cleanPriority.map { hostPort ->
                    async {
                        if (winner.get() != null) return@async null
                        val parsed = SyncClockEstimator.normalizeLanHostAndPort(hostPort, port) ?: return@async null
                        probeLanHost(parsed.first, parsed.second, 550)?.also { found ->
                            winner.compareAndSet(null, found)
                        }
                    }
                }.awaitAll()
            }
            winner.get()?.let { found ->
                _discoveredHub.value = found
                return@withContext found
            }
        }

        val localIp = findLocalIpv4Address() ?: return@withContext null
        val octets = localIp.split('.')
        if (octets.size != 4) return@withContext null
        val prefix = "${octets[0]}.${octets[1]}.${octets[2]}"
        val selfLast = octets[3].toIntOrNull()

        val semaphore = Semaphore(36)
        val winner = AtomicReference<DiscoveredLanHub?>(null)
        coroutineScope {
            (1..254).map { lastOctet ->
                async {
                    if (lastOctet == selfLast || winner.get() != null) return@async null
                    semaphore.withPermit {
                        if (winner.get() != null) return@async null
                        val candidateIp = "$prefix.$lastOctet"
                        probeLanHost(candidateIp, port, 420)?.also { found ->
                            winner.compareAndSet(null, found)
                        }
                    }
                }
            }.awaitAll()
        }

        winner.get()?.also { found ->
            Log.i(TAG, "Subnet scan discovered LAN Hub at ${found.host}:${found.port}")
            _discoveredHub.value = found
        }
    }

    fun reportDiscoveredHub(host: String, port: Int = 4321, label: String = "Cabina LAN") {
        val parsed = SyncClockEstimator.normalizeLanHostAndPort(host, port) ?: return
        _discoveredHub.value = DiscoveredLanHub(
            host = parsed.first,
            port = parsed.second,
            serviceName = label
        )
    }

    @Suppress("DEPRECATION")
    private fun findLocalIpv4Address(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces != null && interfaces.hasMoreElements()) {
                val nif = interfaces.nextElement()
                if (!nif.isUp || nif.isLoopback) continue
                val addrs = nif.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (addr is Inet4Address && !addr.isLoopbackAddress && addr.isSiteLocalAddress) {
                        val ip = addr.hostAddress
                        if (!ip.isNullOrBlank()) return ip
                    }
                }
            }
        } catch (err: Exception) {
            Log.w(TAG, "NetworkInterface enumeration failed: ${err.message}")
        }

        return try {
            val ipInt = wifiManager?.connectionInfo?.ipAddress ?: 0
            if (ipInt != 0) {
                "${ipInt and 0xff}.${ipInt shr 8 and 0xff}.${ipInt shr 16 and 0xff}.${ipInt shr 24 and 0xff}"
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }
}

