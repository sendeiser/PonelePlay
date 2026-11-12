package app.poneleplay.tv.sync

import java.net.URLEncoder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToLong

enum class SyncTransportMode {
    LAN,
    CLOUD,
    CONNECTING,
    OFFLINE
}

data class SyncStatusState(
    val transport: SyncTransportMode = SyncTransportMode.OFFLINE,
    val connected: Boolean = false,
    val rttMs: Long? = null,
    val offsetMs: Long = 0L,
    val activeHostLabel: String = "",
    val discoveredLanHost: String? = null
)

data class SyncTrackData(
    val itemId: String,
    val youtubeVideoId: String?,
    val title: String,
    val artist: String
)

data class SyncAnchorData(
    val seq: Long,
    val seekSeq: Long,
    val track: SyncTrackData?,
    val isPaused: Boolean,
    val anchorPositionSec: Double,
    val anchorServerMs: Long,
    val volume: Int,
    val cabinaMuted: Boolean,
    val tvMuted: Boolean,
    val karaokeMode: Boolean,
    val lastCommand: String?,
    val displayConfigJson: String?
)

data class SyncPreloadData(
    val barrierId: String,
    val track: SyncTrackData,
    val startPositionSec: Double,
    val deadlineServerMs: Long
)

data class SyncGoData(
    val barrierId: String,
    val track: SyncTrackData,
    val startPositionSec: Double,
    val startAtServerMs: Long,
    val anchor: SyncAnchorData
)

data class ClockSyncSample(
    val offsetMs: Long,
    val rttMs: Long
)

data class ClockSyncEstimate(
    val offsetMs: Long = 0L,
    val rttMs: Long = Long.MAX_VALUE,
    val sampleCount: Int = 0
)

data class SyncWsCandidate(
    val url: String,
    val healthUrl: String?,
    val transport: SyncTransportMode,
    val hostLabel: String
)

/**
 * Pure NTP-lite clock offset estimation and WebSocket priority candidate helpers.
 * Shared across runtime networking and JVM unit tests.
 */
object SyncClockEstimator {
    fun computeSample(clientSentMs: Long, serverNowMs: Long, clientReceivedMs: Long): ClockSyncSample {
        val rttMs = max(0L, clientReceivedMs - clientSentMs)
        val midpointClientMs = clientSentMs + (rttMs / 2L)
        return ClockSyncSample(
            offsetMs = serverNowMs - midpointClientMs,
            rttMs = rttMs
        )
    }

    fun merge(current: ClockSyncEstimate?, sample: ClockSyncSample): ClockSyncEstimate {
        if (current == null || current.sampleCount == 0 || sample.rttMs <= (current.rttMs * 1.15).roundToLong()) {
            return ClockSyncEstimate(
                offsetMs = sample.offsetMs,
                rttMs = sample.rttMs,
                sampleCount = (current?.sampleCount ?: 0) + 1
            )
        }
        val blendedOffset = (current.offsetMs * 0.8 + sample.offsetMs * 0.2).roundToLong()
        return ClockSyncEstimate(
            offsetMs = blendedOffset,
            rttMs = current.rttMs,
            sampleCount = current.sampleCount + 1
        )
    }

    fun estimatedServerMs(localNowMs: Long, estimate: ClockSyncEstimate?): Long {
        return localNowMs + (estimate?.offsetMs ?: 0L)
    }

    fun msUntilServerTime(targetServerMs: Long, localNowMs: Long, estimate: ClockSyncEstimate?): Long {
        return max(0L, targetServerMs - estimatedServerMs(localNowMs, estimate))
    }

    fun computeExpectedPositionSec(anchor: SyncAnchorData, estimatedServerMs: Long): Double {
        if (anchor.isPaused) return max(0.0, anchor.anchorPositionSec)
        val elapsedSec = max(0.0, (estimatedServerMs - anchor.anchorServerMs) / 1000.0)
        return max(0.0, anchor.anchorPositionSec + elapsedSec)
    }

    fun shouldCorrectDrift(
        currentVideoSec: Double,
        expectedSec: Double,
        isPaused: Boolean,
        isEarlyWindow: Boolean
    ): Boolean {
        if (isPaused || currentVideoSec < 0.0 || expectedSec < 0.0) return false
        val threshold = if (isEarlyWindow) 0.50 else 0.95
        return abs(currentVideoSec - expectedSec) > threshold
    }

    fun normalizeCloudBaseUrl(rawUrl: String?): String {
        val trimmed = rawUrl?.trim()?.trimEnd('/') ?: return ""
        if (trimmed.isEmpty()) return ""
        return when {
            trimmed.startsWith("wss://", ignoreCase = true) -> trimmed
            trimmed.startsWith("ws://", ignoreCase = true) -> trimmed
            trimmed.startsWith("https://", ignoreCase = true) -> "wss://${trimmed.removePrefix("https://")}"
            trimmed.startsWith("http://", ignoreCase = true) -> "ws://${trimmed.removePrefix("http://")}"
            else -> "wss://$trimmed"
        }
    }

    fun normalizeLanHostAndPort(rawHost: String?, defaultPort: Int = 4321): Pair<String, Int>? {
        val cleaned = rawHost
            ?.trim()
            ?.removePrefix("http://")
            ?.removePrefix("https://")
            ?.removePrefix("ws://")
            ?.removePrefix("wss://")
            ?.trimEnd('/')
            ?: return null
        if (cleaned.isEmpty()) return null
        val parts = cleaned.split(':')
        val host = parts[0].trim()
        if (host.isEmpty()) return null
        val port = parts.getOrNull(1)?.toIntOrNull()?.takeIf { it in 1..65535 } ?: defaultPort
        return host to port
    }

    fun buildCandidates(
        slug: String,
        clientId: String,
        deviceId: String,
        manualLanHost: String?,
        discoveredLanHost: String?,
        discoveredLanPort: Int,
        defaultLanPort: Int,
        cloudWsBaseUrl: String?
    ): List<SyncWsCandidate> {
        val cleanSlug = slug.trim()
        if (cleanSlug.isEmpty()) return emptyList()

        val encodedSlug = URLEncoder.encode(cleanSlug, "UTF-8")
        val encodedClient = URLEncoder.encode(clientId, "UTF-8")
        val encodedDevice = URLEncoder.encode(deviceId, "UTF-8")
        val query = "role=tv&clientId=$encodedClient" +
            if (encodedDevice.isNotEmpty()) "&deviceId=$encodedDevice" else ""

        val candidates = mutableListOf<SyncWsCandidate>()
        val seen = mutableSetOf<String>()

        fun addLan(rawHost: String?, fallbackPort: Int) {
            val parsed = normalizeLanHostAndPort(rawHost, fallbackPort) ?: return
            val (host, port) = parsed
            val wsUrl = "ws://$host:$port/ws/$encodedSlug?$query"
            if (seen.add(wsUrl)) {
                candidates.add(
                    SyncWsCandidate(
                        url = wsUrl,
                        healthUrl = "http://$host:$port/health",
                        transport = SyncTransportMode.LAN,
                        hostLabel = "$host:$port"
                    )
                )
            }
        }

        addLan(manualLanHost, defaultLanPort)
        addLan(discoveredLanHost, discoveredLanPort)

        val normalizedCloud = normalizeCloudBaseUrl(cloudWsBaseUrl)
        if (normalizedCloud.isNotEmpty()) {
            val cloudWsUrl = "$normalizedCloud/ws/$encodedSlug?$query"
            if (seen.add(cloudWsUrl)) {
                candidates.add(
                    SyncWsCandidate(
                        url = cloudWsUrl,
                        healthUrl = null,
                        transport = SyncTransportMode.CLOUD,
                        hostLabel = normalizedCloud
                            .removePrefix("wss://")
                            .removePrefix("ws://")
                            .substringBefore('/')
                    )
                )
            }
        }

        return candidates
    }
}

