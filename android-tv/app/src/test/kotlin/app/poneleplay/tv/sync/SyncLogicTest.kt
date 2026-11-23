package app.poneleplay.tv.sync

import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import org.junit.Test

class SyncLogicTest {
    @Test
    fun clockOffsetEstimator_accountsForHalfRttAndLowestRttWins() {
        val fastSample = SyncClockEstimator.computeSample(
            clientSentMs = 1_000L,
            serverNowMs = 6_010L,
            clientReceivedMs = 1_020L // rtt = 20ms, midpoint = 1010ms => offset = +5000ms
        )
        assertEquals(20L, fastSample.rttMs)
        assertEquals(5_000L, fastSample.offsetMs)

        val est1 = SyncClockEstimator.merge(null, fastSample)
        assertEquals(5_000L, est1.offsetMs)
        assertEquals(1_500L, SyncClockEstimator.msUntilServerTime(7_500L, 1_000L, est1))

        val noisySample = SyncClockEstimator.computeSample(
            clientSentMs = 2_000L,
            serverNowMs = 7_500L,
            clientReceivedMs = 2_600L // rtt = 600ms, noisy
        )
        val est2 = SyncClockEstimator.merge(est1, noisySample)
        // Keeps offset locked (ignores noisy 600ms outlier) and gently decays best RTT by 1ms
        assertEquals(21L, est2.rttMs)
        assertTrue(est2.offsetMs < 5_100L)
    }

    @Test
    fun buildCandidates_prioritizesManualLanThenDiscoveredLanThenCloud() {
        val candidates = SyncClockEstimator.buildCandidates(
            slug = "mi-boliche",
            clientId = "tv-123",
            deviceId = "dev-1",
            manualLanHost = "192.168.1.99",
            discoveredLanHost = "192.168.1.50",
            discoveredLanPort = 4321,
            defaultLanPort = 4321,
            cloudWsBaseUrl = "https://poneleplay-sync.workers.dev/"
        )

        assertEquals(3, candidates.size)
        assertEquals(SyncTransportMode.LAN, candidates[0].transport)
        assertEquals("ws://192.168.1.99:4321/ws/mi-boliche?role=tv&clientId=tv-123&deviceId=dev-1", candidates[0].url)
        assertEquals(SyncTransportMode.LAN, candidates[1].transport)
        assertEquals("ws://192.168.1.50:4321/ws/mi-boliche?role=tv&clientId=tv-123&deviceId=dev-1", candidates[1].url)
        assertEquals(SyncTransportMode.CLOUD, candidates[2].transport)
        assertEquals("wss://poneleplay-sync.workers.dev/ws/mi-boliche?role=tv&clientId=tv-123&deviceId=dev-1", candidates[2].url)
    }

    @Test
    fun buildCandidates_includesCloudDiscoveredAndSavedAutoLanHostsBeforeCloud() {
        val candidates = SyncClockEstimator.buildCandidates(
            slug = "mi-boliche",
            clientId = "tv-123",
            deviceId = "dev-1",
            manualLanHost = null,
            discoveredLanHost = null,
            discoveredLanPort = 4321,
            defaultLanPort = 4321,
            cloudWsBaseUrl = "wss://poneleplay-sync.workers.dev",
            cloudDiscoveredLanHosts = listOf("ws://192.168.0.15:4321", "192.168.0.15"),
            savedAutoLanHost = "192.168.0.22:4321"
        )

        assertEquals(3, candidates.size)
        assertEquals("192.168.0.15:4321", candidates[0].hostLabel)
        assertEquals("192.168.0.22:4321", candidates[1].hostLabel)
        assertEquals(SyncTransportMode.CLOUD, candidates[2].transport)
    }

    @Test
    fun driftGuard_usesTighterThresholdInEarlyWindow() {
        assertFalse(
            SyncClockEstimator.shouldCorrectDrift(
                currentVideoSec = 1.2,
                expectedSec = 1.28,
                isPaused = false,
                isEarlyWindow = true
            )
        )
        assertTrue(
            SyncClockEstimator.shouldCorrectDrift(
                currentVideoSec = 1.2,
                expectedSec = 1.35,
                isPaused = false,
                isEarlyWindow = true
            )
        )
        assertFalse(
            SyncClockEstimator.shouldCorrectDrift(
                currentVideoSec = 45.0,
                expectedSec = 45.12,
                isPaused = false,
                isEarlyWindow = false
            )
        )
        assertTrue(
            SyncClockEstimator.shouldCorrectDrift(
                currentVideoSec = 45.0,
                expectedSec = 45.22,
                isPaused = false,
                isEarlyWindow = false
            )
        )
        assertFalse(
            SyncClockEstimator.shouldCorrectDrift(
                currentVideoSec = 1.0,
                expectedSec = 5.0,
                isPaused = true,
                isEarlyWindow = true
            )
        )

        assertEquals(
            12.64,
            SyncClockEstimator.interpolatePositionSec(12.50, 1000L, 1140L, true),
            0.001
        )
        assertEquals(
            12.50,
            SyncClockEstimator.interpolatePositionSec(12.50, 1000L, 1140L, false),
            0.001
        )
        assertEquals(0.236, SyncClockEstimator.updateAdaptiveSeekLeadSec(0.20, 0.08), 0.001)
        assertEquals(0.173, SyncClockEstimator.updateAdaptiveSeekLeadSec(0.20, -0.06), 0.001)
        assertEquals(0.20, SyncClockEstimator.updateAdaptiveSeekLeadSec(0.20, 2.5), 0.001)
    }

    @Test
    fun audioOnlyHelpers_resolveUploadUrlElasticRateAndScreenModes() {
        assertEquals(
            "https://poneleplay.netlify.app/api/audio?path=venue-1%2Fsong.mp3",
            SyncClockEstimator.resolveUploadAudioUrl(
                serverUrl = "https://poneleplay.netlify.app/",
                storagePath = "venue-1/song.mp3",
                youtubeVideoId = null
            )
        )
        assertEquals(
            "https://cdn.example.com/live.mp3",
            SyncClockEstimator.resolveUploadAudioUrl(
                serverUrl = "https://poneleplay.netlify.app",
                storagePath = null,
                youtubeVideoId = "https://cdn.example.com/live.mp3"
            )
        )

        // Deadzone returns 1.0
        assertEquals(1.0, SyncClockEstimator.computeUploadElasticRate(0.03, false)!!, 0.001)
        // Lagging behind anchor speeds up gently (1.01..1.05)
        val catchUp = SyncClockEstimator.computeUploadElasticRate(-0.30, false)!!
        assertTrue(catchUp > 1.0 && catchUp <= 1.05)
        // Ahead of anchor slows down gently (0.95..0.99)
        val slowDown = SyncClockEstimator.computeUploadElasticRate(0.30, false)!!
        assertTrue(slowDown < 1.0 && slowDown >= 0.95)
        // Large desync returns null (hard seek)
        assertEquals(null, SyncClockEstimator.computeUploadElasticRate(1.5, false))
        assertEquals(null, SyncClockEstimator.computeUploadElasticRate(-0.9, true))

        // Screen mode migration
        assertEquals("SALON", SyncClockEstimator.normalizeScreenModeName("VIDEO"))
        assertEquals("SALON", SyncClockEstimator.normalizeScreenModeName("PLAYLIST"))
        assertEquals("SALON", SyncClockEstimator.normalizeScreenModeName("SALON"))
        assertEquals("PORTADA", SyncClockEstimator.normalizeScreenModeName("CLEAN"))
        assertEquals("PORTADA", SyncClockEstimator.normalizeScreenModeName("PORTADA"))
    }

    @Test
    fun remoteCommandAndAutoSkipGuards_preventInfiniteSkipLoops() {
        // Server "skip" telemetry must never map to a TV side-effect
        assertEquals(null, SyncClockEstimator.resolveRemoteCommandAction("skip"))
        assertEquals(null, SyncClockEstimator.resolveRemoteCommandAction("progress"))
        assertEquals(null, SyncClockEstimator.resolveRemoteCommandAction(null))
        assertEquals("play_now", SyncClockEstimator.resolveRemoteCommandAction("play_now"))
        assertEquals("pause", SyncClockEstimator.resolveRemoteCommandAction("pause"))

        // Auto-skip cooldown + same-track deduplication
        assertTrue(SyncClockEstimator.shouldAllowAutoSkip(10_000L, 0L, "vid1", ""))
        assertFalse(SyncClockEstimator.shouldAllowAutoSkip(12_000L, 10_000L, "vid2", "vid1"))
        assertFalse(SyncClockEstimator.shouldAllowAutoSkip(16_000L, 10_000L, "vid1", "vid1"))
        assertTrue(SyncClockEstimator.shouldAllowAutoSkip(16_000L, 10_000L, "vid2", "vid1"))
        assertTrue(SyncClockEstimator.shouldAllowAutoSkip(23_000L, 10_000L, "vid1", "vid1"))
    }
}

