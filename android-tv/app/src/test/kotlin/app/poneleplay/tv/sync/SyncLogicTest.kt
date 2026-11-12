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
        // Blended only 20% and keeps lowest RTT
        assertEquals(20L, est2.rttMs)
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
    fun driftGuard_usesTighterThresholdInEarlyWindow() {
        assertTrue(
            SyncClockEstimator.shouldCorrectDrift(
                currentVideoSec = 1.2,
                expectedSec = 1.85,
                isPaused = false,
                isEarlyWindow = true
            )
        )
        assertFalse(
            SyncClockEstimator.shouldCorrectDrift(
                currentVideoSec = 45.0,
                expectedSec = 45.65,
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
    }
}

