package app.poneleplay.tv.sync

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.Inet4Address
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

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
}

