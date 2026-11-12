package app.poneleplay.tv.sync

import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

interface TvSyncListener {
    fun onStatusChanged(status: SyncStatusState) {}
    fun onTvFeedJson(tvFeedJson: String) {}
    fun onAnchor(anchor: SyncAnchorData, forceSeek: Boolean) {}
    fun onPreload(preload: SyncPreloadData) {}
    fun onGo(go: SyncGoData) {}
    fun onDisplayConfig(configJson: String) {}
    fun onPartyEvent(payloadJson: String) {}
}

/**
 * Native OkHttp WebSocket client for Android TV with LAN-first priority, Cloudflare DO failover,
 * periodic LAN upgrade probing while on Cloud, NTP-lite clock offset estimation, and Ready-Barrier ack.
 */
class TvSyncSocketClient(
    private val listener: TvSyncListener
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val clientId = "tv-" + UUID.randomUUID().toString().take(8)
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(2500, TimeUnit.MILLISECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build()
    private val probeClient = OkHttpClient.Builder()
        .connectTimeout(900, TimeUnit.MILLISECONDS)
        .readTimeout(900, TimeUnit.MILLISECONDS)
        .build()

    private val isActive = AtomicBoolean(false)
    private val attemptCounter = AtomicInteger(0)
    private val socketGen = AtomicInteger(0)

    @Volatile private var slug: String = ""
    @Volatile private var deviceId: String = ""
    @Volatile private var manualLanHost: String? = null
    @Volatile private var discoveredLanHost: String? = null
    @Volatile private var discoveredLanPort: Int = 4321
    @Volatile private var defaultLanPort: Int = 4321
    @Volatile private var cloudWsBaseUrl: String? = null

    @Volatile private var currentWs: WebSocket? = null
    @Volatile private var activeCandidate: SyncWsCandidate? = null
    @Volatile private var clockEstimate: ClockSyncEstimate? = null
    @Volatile private var status = SyncStatusState()

    private var pingRunnable: Runnable? = null
    private var reconnectRunnable: Runnable? = null
    private var lanProbeRunnable: Runnable? = null

    companion object {
        private const val TAG = "PonelePlaySyncWS"
    }

    fun configure(
        slug: String,
        deviceId: String,
        manualLanHost: String?,
        discoveredLanHost: String?,
        discoveredLanPort: Int,
        defaultLanPort: Int,
        cloudWsBaseUrl: String?
    ) {
        val cleanSlug = slug.trim()
        val oldTargetKey = targetKey()

        this.slug = cleanSlug
        this.deviceId = deviceId.trim()
        this.manualLanHost = manualLanHost?.trim()
        this.discoveredLanHost = discoveredLanHost?.trim()
        this.discoveredLanPort = discoveredLanPort.takeIf { it > 0 } ?: 4321
        this.defaultLanPort = defaultLanPort.takeIf { it > 0 } ?: 4321
        this.cloudWsBaseUrl = cloudWsBaseUrl?.trim()

        val newTargetKey = targetKey()
        if (cleanSlug.isEmpty()) {
            stop()
            return
        }

        val candidates = currentCandidates()
        if (candidates.isEmpty()) {
            stop()
            return
        }

        if (!isActive.get()) {
            start()
        } else if (oldTargetKey != newTargetKey) {
            val currentlyOnLan = status.connected && status.transport == SyncTransportMode.LAN
            val hasNewLan = candidates.any { it.transport == SyncTransportMode.LAN }
            if (!currentlyOnLan || hasNewLan) {
                reconnectNow(resetAttempts = true)
            }
        }
    }

    fun start() {
        if (slug.isBlank()) return
        if (!isActive.compareAndSet(false, true)) return
        attemptCounter.set(0)
        connectNextCandidate()
    }

    fun stop() {
        isActive.set(false)
        clearTimers()
        closeCurrentSocket()
        updateStatus(
            status.copy(
                transport = SyncTransportMode.OFFLINE,
                connected = false,
                activeHostLabel = "",
                discoveredLanHost = discoveredLanHost ?: manualLanHost
            )
        )
    }

    fun forceReconnect() {
        if (slug.isBlank()) return
        if (!isActive.get()) {
            start()
        } else {
            reconnectNow(resetAttempts = true)
        }
    }

    fun estimatedServerMs(): Long {
        return SyncClockEstimator.estimatedServerMs(System.currentTimeMillis(), clockEstimate)
    }

    fun msUntilServerTime(targetServerMs: Long): Long {
        return SyncClockEstimator.msUntilServerTime(
            targetServerMs = targetServerMs,
            localNowMs = System.currentTimeMillis(),
            estimate = clockEstimate
        )
    }

    fun sendReady(barrierId: String) {
        val obj = JSONObject().apply {
            put("type", "sync:ready")
            put("barrierId", barrierId)
            put("clientId", clientId)
            put("role", "tv")
        }
        sendJson(obj)
    }

    fun requestStateRefresh() {
        val obj = JSONObject().apply {
            put("type", "state:refresh_request")
        }
        sendJson(obj)
    }

    private fun targetKey(): String {
        return listOf(
            slug,
            manualLanHost.orEmpty(),
            discoveredLanHost.orEmpty(),
            discoveredLanPort.toString(),
            defaultLanPort.toString(),
            cloudWsBaseUrl.orEmpty()
        ).joinToString("|")
    }

    private fun currentCandidates(): List<SyncWsCandidate> {
        return SyncClockEstimator.buildCandidates(
            slug = slug,
            clientId = clientId,
            deviceId = deviceId,
            manualLanHost = manualLanHost,
            discoveredLanHost = discoveredLanHost,
            discoveredLanPort = discoveredLanPort,
            defaultLanPort = defaultLanPort,
            cloudWsBaseUrl = cloudWsBaseUrl
        )
    }

    private fun sendJson(obj: JSONObject) {
        try {
            currentWs?.send(obj.toString())
        } catch (err: Exception) {
            Log.w(TAG, "WS send error: ${err.message}")
        }
    }

    private fun reconnectNow(resetAttempts: Boolean) {
        if (!isActive.get()) return
        if (resetAttempts) attemptCounter.set(0)
        clearTimers()
        closeCurrentSocket()
        connectNextCandidate()
    }

    private fun connectNextCandidate() {
        if (!isActive.get()) return
        val candidates = currentCandidates()
        if (candidates.isEmpty()) {
            updateStatus(
                status.copy(
                    transport = SyncTransportMode.OFFLINE,
                    connected = false,
                    activeHostLabel = "",
                    discoveredLanHost = discoveredLanHost
                )
            )
            return
        }

        val attempt = attemptCounter.getAndIncrement()
        val candidate = candidates[attempt % candidates.size]
        activeCandidate = candidate

        updateStatus(
            status.copy(
                transport = SyncTransportMode.CONNECTING,
                connected = false,
                activeHostLabel = candidate.hostLabel,
                discoveredLanHost = discoveredLanHost
            )
        )

        closeCurrentSocket()
        val gen = socketGen.incrementAndGet()
        val request = Request.Builder().url(candidate.url).build()
        var opened = false

        val ws = httpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (!isActive.get() || gen != socketGen.get()) {
                    webSocket.close(1000, "stale")
                    return
                }
                currentWs = webSocket
                opened = true
                attemptCounter.set(0)
                Log.i(TAG, "Connected (${candidate.transport}) to ${candidate.hostLabel}")
                updateStatus(
                    status.copy(
                        transport = candidate.transport,
                        connected = true,
                        activeHostLabel = candidate.hostLabel,
                        discoveredLanHost = discoveredLanHost
                    )
                )
                startClockSync()
                if (candidate.transport == SyncTransportMode.CLOUD) {
                    startLanProbeLoop()
                } else {
                    stopLanProbeLoop()
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (!isActive.get() || gen != socketGen.get()) return
                handleInboundMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (gen != socketGen.get()) return
                handleDisconnect(opened)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (gen != socketGen.get()) return
                Log.w(TAG, "WS failure (${candidate.transport} ${candidate.hostLabel}): ${t.message}")
                handleDisconnect(opened)
            }
        })
        if (gen == socketGen.get()) {
            currentWs = ws
        } else {
            ws.close(1000, "superseded")
        }
    }

    private fun handleDisconnect(wasOpened: Boolean) {
        stopClockSync()
        stopLanProbeLoop()
        currentWs = null
        updateStatus(
            status.copy(
                transport = if (isActive.get()) SyncTransportMode.CONNECTING else SyncTransportMode.OFFLINE,
                connected = false,
                discoveredLanHost = discoveredLanHost
            )
        )
        if (!isActive.get()) return

        val candidates = currentCandidates()
        val delayMs = if (!wasOpened && candidates.size > 1 && attemptCounter.get() < candidates.size) {
            150L
        } else {
            val cycle = (attemptCounter.get() / candidates.size.coerceAtLeast(1)).coerceAtMost(4)
            (1000L shl cycle).coerceAtMost(15_000L)
        }

        val r = Runnable { connectNextCandidate() }
        reconnectRunnable = r
        mainHandler.postDelayed(r, delayMs)
    }

    private fun handleInboundMessage(rawText: String) {
        if (rawText == "pong") return
        val msg = try {
            JSONObject(rawText)
        } catch (_: Exception) {
            return
        }

        when (msg.optString("type")) {
            "clock:pong" -> {
                val clientSentMs = msg.optLong("clientSentMs", 0L)
                val serverNowMs = msg.optLong("serverNowMs", 0L)
                if (clientSentMs > 0L && serverNowMs > 0L) {
                    val sample = SyncClockEstimator.computeSample(
                        clientSentMs = clientSentMs,
                        serverNowMs = serverNowMs,
                        clientReceivedMs = System.currentTimeMillis()
                    )
                    val merged = SyncClockEstimator.merge(clockEstimate, sample)
                    clockEstimate = merged
                    updateStatus(
                        status.copy(
                            rttMs = merged.rttMs,
                            offsetMs = merged.offsetMs
                        )
                    )
                }
            }

            "room:snapshot" -> {
                val snap = msg.optJSONObject("snapshot") ?: return
                val tvFeedObj = snap.optJSONObject("tvFeed")
                if (tvFeedObj != null) {
                    val feedStr = tvFeedObj.toString()
                    mainHandler.post { listener.onTvFeedJson(feedStr) }
                }
                val anchorObj = snap.optJSONObject("anchor")
                if (anchorObj != null) {
                    val anchor = parseAnchor(anchorObj)
                    mainHandler.post {
                        anchor.displayConfigJson?.let { listener.onDisplayConfig(it) }
                        listener.onAnchor(anchor, false)
                    }
                }
            }

            "sync:anchor" -> {
                val anchorObj = msg.optJSONObject("anchor") ?: return
                val forceSeek = msg.optBoolean("forceSeek", false)
                val anchor = parseAnchor(anchorObj)
                mainHandler.post {
                    anchor.displayConfigJson?.let { listener.onDisplayConfig(it) }
                    listener.onAnchor(anchor, forceSeek)
                }
            }

            "sync:preload" -> {
                val trackObj = msg.optJSONObject("track") ?: return
                val preload = SyncPreloadData(
                    barrierId = msg.optString("barrierId", ""),
                    track = parseTrack(trackObj),
                    startPositionSec = msg.optDouble("startPositionSec", 0.0),
                    deadlineServerMs = msg.optLong("deadlineServerMs", 0L)
                )
                if (preload.barrierId.isNotEmpty()) {
                    mainHandler.post { listener.onPreload(preload) }
                }
            }

            "sync:go" -> {
                val trackObj = msg.optJSONObject("track") ?: return
                val anchorObj = msg.optJSONObject("anchor") ?: return
                val go = SyncGoData(
                    barrierId = msg.optString("barrierId", ""),
                    track = parseTrack(trackObj),
                    startPositionSec = msg.optDouble("startPositionSec", 0.0),
                    startAtServerMs = msg.optLong("startAtServerMs", 0L),
                    anchor = parseAnchor(anchorObj)
                )
                mainHandler.post {
                    go.anchor.displayConfigJson?.let { listener.onDisplayConfig(it) }
                    listener.onGo(go)
                }
            }

            "party:event" -> {
                val payload = msg.optJSONObject("payload") ?: return
                val evType = payload.optString("type", "")
                if (evType == "tv_display_config") {
                    val target = payload.optString("targetDeviceId", "all")
                    if (target == "all" || target.isEmpty() || deviceId.isEmpty() || target == deviceId) {
                        val cfg = payload.optJSONObject("config")
                        if (cfg != null) {
                            mainHandler.post { listener.onDisplayConfig(cfg.toString()) }
                        }
                    }
                }
                val payloadStr = payload.toString()
                mainHandler.post { listener.onPartyEvent(payloadStr) }
            }
        }
    }

    private fun parseTrack(obj: JSONObject): SyncTrackData {
        val rawYt = if (obj.isNull("youtubeVideoId")) null else obj.optString("youtubeVideoId", "").trim()
        return SyncTrackData(
            itemId = obj.optString("itemId", ""),
            youtubeVideoId = rawYt?.takeIf { it.isNotEmpty() && it != "null" },
            title = obj.optString("title", ""),
            artist = obj.optString("artist", "")
        )
    }

    private fun parseAnchor(obj: JSONObject): SyncAnchorData {
        val trackObj = obj.optJSONObject("track")
        val displayObj = obj.optJSONObject("displayConfig")
        val lastCmd = if (obj.isNull("lastCommand")) null else obj.optString("lastCommand", "").takeIf { it.isNotBlank() }
        return SyncAnchorData(
            seq = obj.optLong("seq", 0L),
            seekSeq = obj.optLong("seekSeq", 0L),
            track = trackObj?.let { parseTrack(it) },
            isPaused = obj.optBoolean("isPaused", false),
            anchorPositionSec = obj.optDouble("anchorPositionSec", 0.0),
            anchorServerMs = obj.optLong("anchorServerMs", 0L),
            volume = obj.optInt("volume", 85),
            cabinaMuted = obj.optBoolean("cabinaMuted", false),
            tvMuted = obj.optBoolean("tvMuted", false),
            karaokeMode = obj.optBoolean("karaokeMode", false),
            lastCommand = lastCmd,
            displayConfigJson = displayObj?.toString()
        )
    }

    private fun sendClockPing() {
        val ping = JSONObject().apply {
            put("type", "clock:ping")
            put("clientSentMs", System.currentTimeMillis())
        }
        sendJson(ping)
    }

    private fun startClockSync() {
        stopClockSync()
        sendClockPing()
        mainHandler.postDelayed({ if (currentWs != null) sendClockPing() }, 150L)
        mainHandler.postDelayed({ if (currentWs != null) sendClockPing() }, 350L)

        val periodic = object : Runnable {
            override fun run() {
                if (!isActive.get() || currentWs == null) return
                sendClockPing()
                mainHandler.postDelayed(this, 25_000L)
            }
        }
        pingRunnable = periodic
        mainHandler.postDelayed(periodic, 25_000L)
    }

    private fun stopClockSync() {
        pingRunnable?.let { mainHandler.removeCallbacks(it) }
        pingRunnable = null
    }

    private fun startLanProbeLoop() {
        stopLanProbeLoop()
        val loop = object : Runnable {
            override fun run() {
                if (!isActive.get() || status.transport == SyncTransportMode.LAN) return
                val lanCandidates = currentCandidates().filter { it.transport == SyncTransportMode.LAN }
                if (lanCandidates.isNotEmpty()) {
                    Thread {
                        for (lan in lanCandidates) {
                            val healthUrl = lan.healthUrl ?: continue
                            try {
                                val req = Request.Builder().url(healthUrl).get().build()
                                probeClient.newCall(req).execute().use { resp ->
                                    if (resp.isSuccessful && isActive.get() && status.transport != SyncTransportMode.LAN) {
                                        mainHandler.post { reconnectNow(resetAttempts = true) }
                                        return@Thread
                                    }
                                }
                            } catch (_: Exception) {
                                // LAN Hub unreachable
                            }
                        }
                    }.start()
                }
                mainHandler.postDelayed(this, 15_000L)
            }
        }
        lanProbeRunnable = loop
        mainHandler.postDelayed(loop, 15_000L)
    }

    private fun stopLanProbeLoop() {
        lanProbeRunnable?.let { mainHandler.removeCallbacks(it) }
        lanProbeRunnable = null
    }

    private fun clearTimers() {
        stopClockSync()
        stopLanProbeLoop()
        reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        reconnectRunnable = null
    }

    private fun closeCurrentSocket() {
        socketGen.incrementAndGet()
        val ws = currentWs
        currentWs = null
        try {
            ws?.close(1000, "closing")
        } catch (_: Exception) {}
    }

    private fun updateStatus(next: SyncStatusState) {
        status = next
        mainHandler.post { listener.onStatusChanged(next) }
    }
}
