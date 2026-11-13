package app.poneleplay.tv.ui

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.poneleplay.tv.data.TvDuel
import app.poneleplay.tv.data.TvFeed
import app.poneleplay.tv.data.TvProposal
import app.poneleplay.tv.data.TvRoulette
import app.poneleplay.tv.data.TvSkipVote
import app.poneleplay.tv.data.TvTrack
import app.poneleplay.tv.sync.SyncAnchorData
import app.poneleplay.tv.sync.SyncClockEstimator
import app.poneleplay.tv.sync.SyncStatusState
import app.poneleplay.tv.sync.SyncTransportMode
import app.poneleplay.tv.util.QrGenerator
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.abs
import java.text.SimpleDateFormat
import java.util.*

enum class TvScreenMode {
    VIDEO,
    PLAYLIST,
    CLEAN
}

data class TvDesignTheme(
    val primaryColor: Color,
    val secondaryColor: Color,
    val accentColor: Color,
    val badgeColor: Color = Color(0xFFA5B4FC),
    val cardBackground: Color = Color(0xFF101524),
    val cardBorder: Color = Color(0xFF262F4A),
    val qrCardBorder: Color = Color(0xFF6366F1),
    val itemRowBackground: Color = Color(0xFF161C2E),
    val itemRowBorder: Color = Color(0xFF262F4A),
    val badgeBackground: Color = Color(0x334F46E5),
    val badgeText: Color = Color(0xFFA5B4FC)
)

fun getTvDesignTheme(themeName: String): TvDesignTheme {
    return when (themeName.lowercase()) {
        "minimal" -> TvDesignTheme(
            primaryColor = Color(0xFFF8FAFC),
            secondaryColor = Color(0xFF94A3B8),
            accentColor = Color(0xFFCBD5E1),
            badgeColor = Color(0xFFF8FAFC),
            cardBackground = Color(0xFF11141C),
            cardBorder = Color(0xFF2B3242),
            qrCardBorder = Color(0xFF64748B),
            itemRowBackground = Color(0xFF181C26),
            itemRowBorder = Color(0xFF2C3446),
            badgeBackground = Color(0x33F8FAFC),
            badgeText = Color(0xFFF8FAFC)
        )
        "gold" -> TvDesignTheme(
            primaryColor = Color(0xFFFBBF24),
            secondaryColor = Color(0xFFF59E0B),
            accentColor = Color(0xFFFDE68A),
            badgeColor = Color(0xFFFBBF24),
            cardBackground = Color(0xFF181308),
            cardBorder = Color(0xFF4A3716),
            qrCardBorder = Color(0xFFF59E0B),
            itemRowBackground = Color(0xFF241C0C),
            itemRowBorder = Color(0xFF4D3B16),
            badgeBackground = Color(0x33FBBF24),
            badgeText = Color(0xFFFBBF24)
        )
        "emerald" -> TvDesignTheme(
            primaryColor = Color(0xFF34D399),
            secondaryColor = Color(0xFF10B981),
            accentColor = Color(0xFF6EE7B7),
            badgeColor = Color(0xFF34D399),
            cardBackground = Color(0xFF081812),
            cardBorder = Color(0xFF14442F),
            qrCardBorder = Color(0xFF10B981),
            itemRowBackground = Color(0xFF0E271D),
            itemRowBorder = Color(0xFF1C573F),
            badgeBackground = Color(0x3334D399),
            badgeText = Color(0xFF34D399)
        )
        else -> TvDesignTheme( // "neon"
            primaryColor = Color(0xFF00F0FF),
            secondaryColor = Color(0xFF818CF8),
            accentColor = Color(0xFFA855F7),
            badgeColor = Color(0xFF00F0FF),
            cardBackground = Color(0xFF0D1222),
            cardBorder = Color(0xFF233054),
            qrCardBorder = Color(0xFF6366F1),
            itemRowBackground = Color(0xFF141A30),
            itemRowBorder = Color(0xFF233054),
            badgeBackground = Color(0x3300F0FF),
            badgeText = Color(0xFF00F0FF)
        )
    }
}

fun getTvScaleFactor(scaleName: String): Float {
    return when (scaleName.lowercase()) {
        "compact" -> 0.85f
        "large" -> 1.25f
        "xlarge" -> 1.50f
        else -> 1.0f
    }
}

@Composable
fun TvScreen(
    feed: TvFeed,
    mode: TvScreenMode,
    deviceId: String = "",
    showQueue: Boolean = true,
    showProposals: Boolean = true,
    themeName: String = "neon",
    scaleName: String = "normal",
    localIsMuted: Boolean = false,
    useLegacySupabaseWs: Boolean = true,
    syncStatus: SyncStatusState? = null,
    liveAnchor: SyncAnchorData? = null,
    estimatedServerMs: (() -> Long)? = null,
    videoController: VideoPlayerController,
    onVideoEnded: () -> Unit,
    onDisplayConfig: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val qrBitmap = remember(feed.clientUrl) {
        QrGenerator.generate(feed.clientUrl, 320)
    }

    val theme = remember(themeName) { getTvDesignTheme(themeName) }
    val scaleFactor = remember(scaleName) { getTvScaleFactor(scaleName) }

    var currentTimeString by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        while (true) {
            currentTimeString = sdf.format(Date())
            kotlinx.coroutines.delay(1000)
        }
    }

    // Effective mute and volume state: TV local mute or Cabina tvMuted takes precedence
    // (cabinaMuted only mutes the DJ booth, never the TV)
    val effectiveMuted = localIsMuted || feed.playback.tvMuted
    val effectiveVolume = if (effectiveMuted) 0 else feed.playback.volume

    // Reactive Control: React to master control commands & seekSeq from DJ booth (Cabina)
    var lastExecutedSeq by remember { mutableStateOf(feed.playback.commandSeq) }
    var lastExecutedSeekSeq by remember { mutableStateOf(feed.playback.seekSeq) }
    LaunchedEffect(feed.playback.commandSeq, feed.playback.seekSeq) {
        if (feed.playback.seekSeq > 0L && feed.playback.seekSeq != lastExecutedSeekSeq) {
            lastExecutedSeekSeq = feed.playback.seekSeq
            lastExecutedSeq = feed.playback.commandSeq
            videoController.seekTo(feed.playback.positionSeconds.coerceAtLeast(0f))
            return@LaunchedEffect
        }
        if (feed.playback.commandSeq > lastExecutedSeq) {
            lastExecutedSeq = feed.playback.commandSeq
            when (feed.playback.lastCommand) {
                "pause" -> videoController.pause()
                "resume" -> videoController.play()
                "toggle_pause" -> videoController.togglePlayPause()
                "seek" -> {
                    videoController.seekTo(feed.playback.positionSeconds.coerceAtLeast(0f))
                }
                "set_volume" -> {
                    if (!localIsMuted && !feed.playback.tvMuted) {
                        videoController.setVolume(feed.playback.volume)
                        videoController.unMute()
                    }
                }
                "set_tv_mute" -> {
                    if (localIsMuted || feed.playback.tvMuted) {
                        videoController.mute()
                    } else {
                        videoController.unMute()
                    }
                }
                "mute" -> {
                    if (feed.playback.tvMuted) videoController.mute()
                }
                "unmute" -> {
                    if (!localIsMuted && !feed.playback.tvMuted) videoController.unMute()
                }
                "skip" -> onVideoEnded()
                "play_now" -> videoController.play()
            }
        }
    }

    LaunchedEffect(effectiveMuted, effectiveVolume) {
        if (effectiveMuted) {
            videoController.mute()
        } else {
            videoController.unMute()
            videoController.setVolume(effectiveVolume)
        }
    }

    val currentVideoId = feed.nowPlaying?.youtubeVideoId ?: "oMpaVIio3UQ"

    // Compute live initial position when joining a playing room mid-track using synced clock offset
    val computedInitialSec = remember(currentVideoId, liveAnchor?.seq, feed.playback.positionSeconds) {
        val anchor = liveAnchor
        if (anchor != null && estimatedServerMs != null && anchor.track?.youtubeVideoId == currentVideoId) {
            SyncClockEstimator.computeExpectedPositionSec(anchor, estimatedServerMs()).toFloat()
        } else {
            feed.playback.positionSeconds.coerceAtLeast(0f)
        }
    }

    // Continuous clock-locked drift guard when connected to LAN or Cloud WS.
    // liveAnchor/feed/estimatedServerMs are captured via rememberUpdatedState so frequent progress updates
    // do NOT cancel the polling loop (previous bug canceled delay on every anchor tick!).
    val latestAnchor by rememberUpdatedState(liveAnchor)
    val latestFeed by rememberUpdatedState(feed)
    val latestEstimatedServerMs by rememberUpdatedState(estimatedServerMs)
    var lastDriftCorrectionAt by remember { mutableStateOf(0L) }
    var lastDriftTrackStartAt by remember(currentVideoId) { mutableStateOf(System.currentTimeMillis()) }
    var firstFrameTick by remember(currentVideoId) { mutableStateOf(0) }

    DisposableEffect(videoController, currentVideoId) {
        val cb: (String, Float) -> Unit = { playingVideoId, _ ->
            if (playingVideoId == currentVideoId) {
                firstFrameTick += 1
            }
        }
        videoController.onFirstFramePlayingCallback = cb
        onDispose {
            if (videoController.onFirstFramePlayingCallback == cb) {
                videoController.onFirstFramePlayingCallback = null
            }
        }
    }

    LaunchedEffect(currentVideoId, feed.playback.isPaused, syncStatus?.connected, firstFrameTick) {
        if (syncStatus?.connected != true) return@LaunchedEffect

        // Run an immediate drift check right after first-frame decode, then tight periodic ticks
        var skipInitialDelay = firstFrameTick > 0
        while (isActive) {
            val anchor = latestAnchor
            val estClock = latestEstimatedServerMs
            val nowLocal = System.currentTimeMillis()
            val expectedQuick = if (anchor != null && estClock != null) {
                SyncClockEstimator.computeExpectedPositionSec(anchor, estClock())
            } else {
                0.0
            }
            val earlyTick = expectedQuick < 8.0 || (nowLocal - lastDriftTrackStartAt < 8000L)
            if (skipInitialDelay) {
                skipInitialDelay = false
            } else {
                delay(if (earlyTick) 400L else 900L)
            }

            val curAnchor = latestAnchor ?: continue
            val curEstClock = latestEstimatedServerMs ?: continue
            val curFeed = latestFeed
            if (videoController.activeBarrierVideoId == currentVideoId) continue
            if (curAnchor.isPaused || curFeed.playback.isPaused) continue
            if (curAnchor.track?.youtubeVideoId != currentVideoId) continue
            if (videoController.currentPlayerState != 1) continue

            val checkNowLocal = System.currentTimeMillis()
            val expectedSec = SyncClockEstimator.computeExpectedPositionSec(curAnchor, curEstClock())
            val durationLimit = (curFeed.nowPlaying?.durationSeconds ?: 0).takeIf { it > 0 }?.toDouble()
            if (durationLimit != null && expectedSec > durationLimit - 1.5) continue

            val currentPos = videoController.currentPositionSec.toDouble()
            val isEarlyWindow = expectedSec < 8.0 || (checkNowLocal - lastDriftTrackStartAt < 8000L)
            val cooldownMs = if (isEarlyWindow) 1100L else 2200L
            if (checkNowLocal - lastDriftCorrectionAt < cooldownMs) continue

            if (
                SyncClockEstimator.shouldCorrectDrift(
                    currentVideoSec = currentPos,
                    expectedSec = expectedSec,
                    isPaused = false,
                    isEarlyWindow = isEarlyWindow
                ) && abs(currentPos - expectedSec) < 25.0
            ) {
                lastDriftCorrectionAt = checkNowLocal
                // Compensate ~200ms YouTube IFrame seek latency when snapping forward
                val seekLeadSec = if (expectedSec > 0.25) 0.20 else 0.0
                videoController.seekTo((expectedSec + seekLeadSec).toFloat())
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF070A13))
    ) {
        // 1. Persistent Fullscreen Video Player (Hidden visually in PLAYLIST mode so video never bleeds behind)
        NativeVideoPlayer(
            videoId = currentVideoId,
            venueSlug = feed.venue.slug,
            deviceId = deviceId,
            isPaused = feed.playback.isPaused,
            volume = effectiveVolume,
            isMuted = effectiveMuted,
            initialPositionSeconds = computedInitialSec,
            useLegacySupabaseWs = useLegacySupabaseWs,
            controller = videoController,
            onEnded = onVideoEnded,
            onDisplayConfig = onDisplayConfig,
            modifier = if (mode == TvScreenMode.PLAYLIST) {
                Modifier.size(1.dp).alpha(0f)
            } else {
                Modifier.fillMaxSize()
            }
        )

        // 2. Overlays depending on mode
        when (mode) {
            TvScreenMode.VIDEO -> {
                TvModeVideoOverlays(
                    feed = feed,
                    qrBitmap = qrBitmap,
                    currentTimeString = currentTimeString,
                    showQueue = showQueue,
                    showProposals = showProposals,
                    theme = theme,
                    scaleFactor = scaleFactor,
                    syncStatus = syncStatus
                )
            }
            TvScreenMode.CLEAN -> {
                TvModeVideoOverlays(
                    feed = feed,
                    qrBitmap = qrBitmap,
                    currentTimeString = currentTimeString,
                    showQueue = false,
                    showProposals = false,
                    theme = theme,
                    scaleFactor = scaleFactor,
                    syncStatus = syncStatus
                )
            }
            TvScreenMode.PLAYLIST -> {
                TvModePlaylistOverlays(
                    feed = feed,
                    qrBitmap = qrBitmap,
                    currentTimeString = currentTimeString,
                    theme = theme,
                    scaleFactor = scaleFactor
                )
            }
        }

        // 3. Horizontal Marquee across the middle of the screen (Left to Right) for Dedications
        val liveDed = feed.liveDedication
        val dedicationText = liveDed?.message ?: feed.nowPlaying?.dedication
        val dedicationGuest = liveDed?.guestName ?: feed.nowPlaying?.guestName
        val dedicationStyle = liveDed?.style ?: "neon"
        val dedicationRepeats = liveDed?.repeats ?: 2
        val dedicationKey = "${liveDed?.timestamp ?: feed.nowPlaying?.id ?: "ded"}-$dedicationText"

        if (!dedicationText.isNullOrBlank()) {
            key(dedicationKey) {
                DedicationHorizontalMarquee(
                    dedication = dedicationText,
                    guestName = dedicationGuest,
                    style = dedicationStyle,
                    repeats = dedicationRepeats,
                    modifier = Modifier.align(Alignment.Center)
                )
            }
        }

        // 4. Vote-to-Skip Live Indicator Badge
        val skipVote = feed.activeSkipVote
        if (skipVote != null && skipVote.votes > 0) {
            TvSkipVoteBadge(
                skipVote = skipVote,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 18.dp)
            )
        }

        // 5. Live 1vs1 Duel Overlay
        val activeDuel = feed.activeDuel
        if (activeDuel != null) {
            TvDuelOverlay(
                duel = activeDuel,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 36.dp, vertical = 28.dp)
            )
        }

        // 6. Live Roulette Overlay
        val activeRoulette = feed.activeRoulette
        if (activeRoulette != null) {
            TvRouletteOverlay(
                roulette = activeRoulette,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

/**
 * MODE 1: Fullscreen Video Player Overlays (Left Transparent Queue + Right Transparent Proposals + Bottom HUD).
 */
@Composable
private fun TvModeVideoOverlays(
    feed: TvFeed,
    qrBitmap: Bitmap?,
    currentTimeString: String,
    showQueue: Boolean = true,
    showProposals: Boolean = true,
    theme: TvDesignTheme = getTvDesignTheme("neon"),
    scaleFactor: Float = 1.0f,
    syncStatus: SyncStatusState? = null
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val maxFloatingItems = ((maxHeight.value - 205f) / (38f * scaleFactor)).toInt().coerceAtLeast(4)

        // 2. Left Floating Queue (100% Invisible Transparent, no box/border, text only)
        if (showQueue && feed.queue.isNotEmpty()) {
            val textShadow = Shadow(
                color = Color(0xF2000000),
                offset = Offset(2f, 2f),
                blurRadius = 6f
            )

            Column(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(top = (28 * scaleFactor).dp, start = (32 * scaleFactor).dp)
                    .width((310 * scaleFactor).dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "📋 COLA EN VIVO",
                        color = theme.primaryColor,
                        fontSize = (11.5f * scaleFactor).sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = FontFamily.Monospace,
                        style = TextStyle(shadow = textShadow)
                    )
                    Text(
                        text = "${feed.queue.size} temas",
                        color = theme.secondaryColor,
                        fontSize = (10f * scaleFactor).sp,
                        fontFamily = FontFamily.Monospace,
                        style = TextStyle(shadow = textShadow)
                    )
                }

                Spacer(modifier = Modifier.height((8 * scaleFactor).dp))

                feed.queue.take(maxFloatingItems).forEachIndexed { idx, item ->
                    if (idx > 0) Spacer(modifier = Modifier.height((7 * scaleFactor).dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "#${idx + 1}",
                            color = theme.primaryColor,
                            fontSize = (12f * scaleFactor).sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            style = TextStyle(shadow = textShadow),
                            modifier = Modifier.width((26 * scaleFactor).dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (item.isKaraoke) "🎤 ${item.title}" else item.title,
                                color = Color.White,
                                fontSize = (12f * scaleFactor).sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = TextStyle(shadow = textShadow)
                            )
                            val subText = if (!item.guestName.isNullOrBlank()) {
                                "${item.artist} • 🎉 ${item.guestName}"
                            } else {
                                item.artist
                            }
                            Text(
                                text = subText,
                                color = if (!item.guestName.isNullOrBlank()) Color(0xFFF472B6) else Color(0xFFCBD5E1),
                                fontSize = (10.5f * scaleFactor).sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = TextStyle(shadow = textShadow)
                            )
                        }
                        Spacer(modifier = Modifier.width((6 * scaleFactor).dp))
                        val isBar = (item.voteCount >= 9999 || item.voteCount <= 0) && item.guestName.isNullOrBlank()
                        Text(
                            text = if (isBar) (if (feed.venue.venueType == "party") "⭐ DJ" else "⭐ BAR") else "${item.voteCount}v",
                            color = if (isBar) theme.badgeColor else Color(0xFF6EE7B7),
                            fontSize = (10f * scaleFactor).sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            style = TextStyle(shadow = textShadow)
                        )
                    }
                }
            }
        }

        // 3. Right Floating Proposals (100% Invisible Transparent, no box/border, text only)
        if (showProposals && feed.proposals.isNotEmpty()) {
            val textShadow = Shadow(
                color = Color(0xF2000000),
                offset = Offset(2f, 2f),
                blurRadius = 6f
            )

            Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = (28 * scaleFactor).dp, end = (32 * scaleFactor).dp)
                    .width((310 * scaleFactor).dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "🔥 EN VOTACIÓN",
                        color = theme.accentColor,
                        fontSize = (11.5f * scaleFactor).sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = FontFamily.Monospace,
                        style = TextStyle(shadow = textShadow)
                    )
                    Text(
                        text = "Pedí con QR",
                        color = theme.secondaryColor,
                        fontSize = (10f * scaleFactor).sp,
                        fontWeight = FontWeight.Bold,
                        style = TextStyle(shadow = textShadow)
                    )
                }

                Spacer(modifier = Modifier.height((8 * scaleFactor).dp))

                feed.proposals.take(maxFloatingItems).forEachIndexed { idx, prop ->
                    if (idx > 0) Spacer(modifier = Modifier.height((7 * scaleFactor).dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (prop.isKaraoke) "🎤 ${prop.title}" else prop.title,
                                color = Color.White,
                                fontSize = (12f * scaleFactor).sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = TextStyle(shadow = textShadow)
                            )
                            if (!prop.guestName.isNullOrBlank()) {
                                Text(
                                    text = "🎉 Pedido por ${prop.guestName}",
                                    color = Color(0xFFF472B6),
                                    fontSize = (10f * scaleFactor).sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = TextStyle(shadow = textShadow)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width((8 * scaleFactor).dp))
                        Text(
                            text = "${prop.voteCount}/${prop.neededVotes}v",
                            color = theme.accentColor,
                            fontSize = (11f * scaleFactor).sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            style = TextStyle(shadow = textShadow)
                        )
                    }
                }
            }
        }

        // 4. Subtle Dark Gradient at Bottom for HUD Readability
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height((170 * scaleFactor).dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color(0xCC070A13), Color(0xF2070A13))
                    )
                )
        )

        // 5. Bottom HUD Overlay (Responsive Balanced Typography)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .padding(horizontal = (32 * scaleFactor).dp, vertical = (18 * scaleFactor).dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left: Now Playing Info
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                // Live Pulse Dot
                Box(
                    modifier = Modifier
                        .size((10 * scaleFactor).dp)
                        .background(theme.secondaryColor, CircleShape)
                )
                Spacer(modifier = Modifier.width((10 * scaleFactor).dp))

                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = if (feed.venue.venueType == "party") "🎉 EN AIRE • FIESTA" else "EN AIRE",
                            color = theme.secondaryColor,
                            fontSize = (10f * scaleFactor).sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                        if (feed.nowPlaying?.isKaraoke == true || feed.playback.karaokeMode) {
                            Spacer(modifier = Modifier.width((8 * scaleFactor).dp))
                            Text(
                                text = "🎤 KARAOKE",
                                color = Color(0xFFF43F5E),
                                fontSize = (10f * scaleFactor).sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        if (!feed.nowPlaying?.guestName.isNullOrBlank()) {
                            Spacer(modifier = Modifier.width((8 * scaleFactor).dp))
                            Text(
                                text = "🎉 Pedido por ${feed.nowPlaying?.guestName}",
                                color = Color(0xFFF472B6),
                                fontSize = (10.5f * scaleFactor).sp,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                    Text(
                        text = feed.nowPlaying?.title ?: "Esperando temas...",
                        color = Color.White,
                        fontSize = (18f * scaleFactor).sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = feed.nowPlaying?.artist ?: feed.venue.name,
                        color = Color(0xFF94A3B8),
                        fontSize = (12.5f * scaleFactor).sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1
                    )
                    val bottomDedication = feed.liveDedication?.message ?: feed.nowPlaying?.dedication
                    if (!bottomDedication.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height((4 * scaleFactor).dp))
                        Box(
                            modifier = Modifier
                                .background(Color(0xD93B0764), RoundedCornerShape(8.dp))
                                .border(1.dp, Color(0xFFEC4899), RoundedCornerShape(8.dp))
                                .padding(horizontal = (10 * scaleFactor).dp, vertical = (4 * scaleFactor).dp)
                        ) {
                            Text(
                                text = "💬 \"$bottomDedication\"",
                                color = Color(0xFFFDF2F8),
                                fontSize = (11.5f * scaleFactor).sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            // Right: Table QR Code + Clock
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (qrBitmap != null) {
                    Image(
                        bitmap = qrBitmap.asImageBitmap(),
                        contentDescription = "QR Mesas",
                        modifier = Modifier
                            .size((64 * scaleFactor).dp)
                            .clip(RoundedCornerShape(8.dp))
                    )
                    Spacer(modifier = Modifier.width((10 * scaleFactor).dp))
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = currentTimeString,
                        color = Color.White,
                        fontSize = (16f * scaleFactor).sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "Pedí tu música",
                        color = theme.secondaryColor,
                        fontSize = (10.5f * scaleFactor).sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    if (syncStatus?.connected == true) {
                        val rttText = syncStatus.rttMs?.let { " ${it}ms" } ?: ""
                        val syncLabel = if (syncStatus.transport == SyncTransportMode.LAN) {
                            "⚡ LAN$rttText"
                        } else {
                            "☁ Sync$rttText"
                        }
                        val syncColor = if (syncStatus.transport == SyncTransportMode.LAN) {
                            Color(0xFF22D3EE)
                        } else {
                            Color(0xFF818CF8)
                        }
                        Text(
                            text = syncLabel,
                            color = syncColor,
                            fontSize = (9f * scaleFactor).sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }
    }
}

/**
 * MODE 2: Party & Queue Emphasis Overlays (Split screen: Hero card + Queue + Proposals + Big QR).
 */
@Composable
private fun TvModePlaylistOverlays(
    feed: TvFeed,
    qrBitmap: Bitmap?,
    currentTimeString: String,
    theme: TvDesignTheme = getTvDesignTheme("neon"),
    scaleFactor: Float = 1.0f
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF070A13))
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp, vertical = 18.dp)
        ) {
            // ================= TOP HEADER BAR =================
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "PONELEPLAY",
                        color = Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "• ${feed.venue.name.uppercase()}",
                        color = theme.secondaryColor,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Live Session Pill
                    Box(
                        modifier = Modifier
                            .background(theme.badgeBackground, RoundedCornerShape(20.dp))
                            .border(1.dp, theme.primaryColor.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
                            .padding(horizontal = 10.dp, vertical = 3.5.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .background(theme.primaryColor, CircleShape)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (feed.isOpen) {
                                    if (feed.venue.venueType == "party") "🎉 FIESTA EN VIVO" else "NOCHE ABIERTA"
                                } else {
                                    "CERRADO"
                                },
                                color = theme.primaryColor,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    Text(
                        text = currentTimeString,
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // ================= 3-COLUMN CENTRAL AREA =================
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // ----- COLUMN 1: NOW PLAYING HERO CARD (36%) -----
                Box(
                    modifier = Modifier
                        .weight(0.36f)
                        .fillMaxHeight()
                        .background(theme.cardBackground, RoundedCornerShape(16.dp))
                        .border(1.5.dp, theme.cardBorder, RoundedCornerShape(16.dp))
                        .padding(16.dp)
                ) {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            // Badge
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "EN AIRE • AHORA SUENA",
                                    color = theme.primaryColor,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = FontFamily.Monospace
                                )

                                if (feed.nowPlaying?.isKaraoke == true) {
                                    Text(
                                        text = "🎤 KARAOKE",
                                        color = Color(0xFFF43F5E),
                                        fontSize = 9.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        fontFamily = FontFamily.Monospace
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            // Live Audio / Video Indicator Card
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(180.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0xFF0F1424))
                                    .border(1.dp, theme.cardBorder, RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                                        verticalAlignment = Alignment.Bottom,
                                        modifier = Modifier.height(42.dp)
                                    ) {
                                        val bars = listOf(28.dp, 16.dp, 36.dp, 22.dp, 40.dp, 18.dp, 32.dp, 14.dp)
                                        bars.forEach { h ->
                                            Box(
                                                modifier = Modifier
                                                    .width(5.dp)
                                                    .height(h)
                                                    .background(theme.primaryColor, RoundedCornerShape(2.dp))
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Text(
                                        text = "EN VIVO • VIDEO ACTIVO",
                                        color = theme.primaryColor,
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        fontFamily = FontFamily.Monospace,
                                        letterSpacing = 1.sp
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            Text(
                                text = feed.nowPlaying?.title ?: "Esperando temas...",
                                color = Color.White,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                lineHeight = 22.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = feed.nowPlaying?.artist ?: "PonelePlay",
                                color = Color(0xFF94A3B8),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )

                            val playlistDedication = feed.liveDedication?.message ?: feed.nowPlaying?.dedication
                            val playlistGuest = feed.liveDedication?.guestName ?: feed.nowPlaying?.guestName

                            if (!playlistGuest.isNullOrBlank() || !playlistDedication.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(10.dp))
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color(0x55831843), RoundedCornerShape(10.dp))
                                        .border(1.dp, Color(0xFFEC4899), RoundedCornerShape(10.dp))
                                        .padding(horizontal = 10.dp, vertical = 8.dp)
                                ) {
                                    if (!playlistGuest.isNullOrBlank()) {
                                        Text(
                                            text = "🎉 Pedido por $playlistGuest",
                                            color = Color(0xFFF472B6),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            fontFamily = FontFamily.Monospace
                                        )
                                    }
                                    if (!playlistDedication.isNullOrBlank()) {
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(
                                            text = "💬 \"$playlistDedication\"",
                                            color = Color(0xFFFDF2F8),
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }

                    // Bottom: Live Votes for Now Playing
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(theme.itemRowBackground, RoundedCornerShape(10.dp))
                            .border(1.dp, theme.itemRowBorder, RoundedCornerShape(10.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val votes = feed.nowPlaying?.voteCount ?: 0
                        val isBarSelection = votes >= 9999 || votes <= 0
                        Text(
                            text = if (isBarSelection) "Selección del bar" else "Votado por el salón",
                            color = Color(0xFF94A3B8),
                            fontSize = 11.sp
                        )
                        Text(
                            text = if (isBarSelection) "⭐ BAR" else "$votes ${if (votes == 1) "voto" else "votos"}",
                            color = theme.primaryColor,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }

            // ----- COLUMN 2: LIVE QUEUE (34%) -----
            Box(
                modifier = Modifier
                    .weight(0.34f)
                    .fillMaxHeight()
                    .background(theme.cardBackground, RoundedCornerShape(16.dp))
                    .border(1.5.dp, theme.cardBorder, RoundedCornerShape(16.dp))
                    .padding(16.dp)
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "COLA EN VIVO",
                            color = theme.primaryColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "${feed.queue.size} en espera",
                            color = theme.secondaryColor,
                            fontSize = 10.5.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    if (feed.queue.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "No hay canciones en cola.\n¡Escaneá el QR y proponé la tuya!",
                                color = Color(0xFF64748B),
                                fontSize = 12.sp,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    } else {
                        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                            val maxQueueFit = (maxHeight.value / 50f).toInt().coerceAtLeast(5)
                            LazyColumn(
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxSize()
                            ) {
                                itemsIndexed(feed.queue.take(maxQueueFit)) { index, item ->
                                    QueueItemRow(item = item, index = index + 1, theme = theme)
                                }
                            }
                        }
                    }
                }
            }

            // ----- COLUMN 3: PROPOSALS & QR CODE (30%) -----
            Column(
                modifier = Modifier
                    .weight(0.30f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Table QR Call to Action Card
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(0.55f)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(theme.cardBackground, Color(0xFF070A13))
                            ),
                            RoundedCornerShape(16.dp)
                        )
                        .border(1.5.dp, theme.qrCardBorder, RoundedCornerShape(16.dp))
                        .padding(14.dp)
                ) {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        if (qrBitmap != null) {
                            Image(
                                bitmap = qrBitmap.asImageBitmap(),
                                contentDescription = "QR para Mesas",
                                modifier = Modifier
                                    .size(112.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color.White)
                                    .padding(4.dp)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                        Text(
                            text = "¡PEDÍ TU MÚSICA!",
                            color = theme.primaryColor,
                            fontSize = 13.5.sp,
                            fontWeight = FontWeight.Black,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "Escaneá el código desde tu mesa",
                            color = Color(0xFFCBD5E1),
                            fontSize = 10.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }

                // Live Proposals Box
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(0.45f)
                        .background(theme.cardBackground, RoundedCornerShape(16.dp))
                        .border(1.5.dp, theme.cardBorder, RoundedCornerShape(16.dp))
                        .padding(13.dp)
                ) {
                    Column(modifier = Modifier.fillMaxSize()) {
                        Text(
                            text = "PROPUESTAS EN VOTACIÓN",
                            color = theme.primaryColor,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace
                        )
                        Spacer(modifier = Modifier.height(7.dp))

                        if (feed.proposals.isEmpty()) {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Sin propuestas activas",
                                    color = Color(0xFF64748B),
                                    fontSize = 10.5.sp
                                )
                            }
                        } else {
                            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                                val maxPropFit = (maxHeight.value / 54f).toInt().coerceAtLeast(4)
                                LazyColumn(
                                    verticalArrangement = Arrangement.spacedBy(7.dp),
                                    modifier = Modifier.fillMaxSize()
                                ) {
                                    itemsIndexed(feed.proposals.take(maxPropFit)) { _, prop ->
                                        ProposalItemRow(proposal = prop, theme = theme)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
}

@Composable
private fun QueueItemRow(item: TvTrack, index: Int, theme: TvDesignTheme = getTvDesignTheme("neon")) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(theme.itemRowBackground, RoundedCornerShape(10.dp))
            .border(1.dp, theme.itemRowBorder, RoundedCornerShape(10.dp))
            .padding(horizontal = 10.dp, vertical = 7.5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Position Number
        Text(
            text = "#$index",
            color = theme.primaryColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.width(26.dp)
        )

        // Title and Artist: Takes up maximum width without badge obstruction
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (item.isKaraoke) "🎤 ${item.title}" else item.title,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(1.5.dp))
            val subText = if (!item.guestName.isNullOrBlank()) {
                "${item.artist} • 🎉 ${item.guestName}"
            } else {
                item.artist
            }
            Text(
                text = subText,
                color = if (!item.guestName.isNullOrBlank()) Color(0xFFF472B6) else Color(0xFF94A3B8),
                fontSize = 10.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(modifier = Modifier.width(6.dp))

        // Votes Badge: Sleek & Compact so it NEVER covers or truncates the song title
        val isBar = (item.voteCount >= 9999 || item.voteCount <= 0) && item.guestName.isNullOrBlank()
        Box(
            modifier = Modifier
                .background(
                    theme.badgeBackground,
                    RoundedCornerShape(6.dp)
                )
                .border(
                    1.dp,
                    theme.primaryColor.copy(alpha = 0.4f),
                    RoundedCornerShape(6.dp)
                )
                .padding(horizontal = 6.dp, vertical = 2.5.dp)
        ) {
            Text(
                text = if (isBar) "⭐ DJ" else "${item.voteCount} ${if (item.voteCount == 1) "voto" else "votos"}",
                color = theme.badgeText,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
private fun ProposalItemRow(proposal: TvProposal, theme: TvDesignTheme = getTvDesignTheme("neon")) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(theme.itemRowBackground, RoundedCornerShape(8.dp))
            .border(1.dp, theme.itemRowBorder, RoundedCornerShape(8.dp))
            .padding(horizontal = 9.dp, vertical = 6.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = if (proposal.isKaraoke) "🎤 ${proposal.title}" else proposal.title,
                color = Color.White,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "${proposal.voteCount}/${proposal.neededVotes}",
                color = theme.primaryColor,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }
        if (!proposal.guestName.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(1.5.dp))
            Text(
                text = "🎉 Pedido por ${proposal.guestName}",
                color = Color(0xFFF472B6),
                fontSize = 9.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(modifier = Modifier.height(3.5.dp))

        val progress = (proposal.voteCount.toFloat() / proposal.neededVotes.toFloat()).coerceIn(0f, 1f)
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(3.5.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = theme.primaryColor,
            trackColor = Color(0xFF334155)
        )
    }
}

private data class DedicationThemeConfig(
    val bgBrush: Brush,
    val borderColor: Color,
    val leadEmoji: String,
    val tailEmoji: String,
    val badgeBg: Color,
    val badgeBorder: Color,
    val badgeTextColor: Color
)

/**
 * Horizontal Marquee across the vertical middle of the TV screen moving from Left to Right.
 */
@Composable
private fun DedicationHorizontalMarquee(
    dedication: String,
    guestName: String?,
    style: String = "neon",
    repeats: Int = 2,
    modifier: Modifier = Modifier
) {
    val configuration = LocalConfiguration.current
    val screenWidthDp = configuration.screenWidthDp.toFloat().coerceAtLeast(640f)
    var isFinished by remember { mutableStateOf(false) }

    if (isFinished) return

    val progress = remember { Animatable(-1.0f) }

    LaunchedEffect(dedication, repeats) {
        val animDuration = 14000
        if (repeats == 0) {
            while (true) {
                progress.snapTo(-1.0f)
                progress.animateTo(1.0f, animationSpec = tween(durationMillis = animDuration, easing = LinearEasing))
            }
        } else {
            for (i in 1..repeats) {
                progress.snapTo(-1.0f)
                progress.animateTo(1.0f, animationSpec = tween(durationMillis = animDuration, easing = LinearEasing))
            }
            isFinished = true
        }
    }

    val themeCfg = when (style.lowercase()) {
        "gold" -> DedicationThemeConfig(
            bgBrush = Brush.horizontalGradient(listOf(Color(0xF2D97706), Color(0xF2CA8A04), Color(0xF2B45309))),
            borderColor = Color(0xFFFDE047),
            leadEmoji = "👑",
            tailEmoji = "✨",
            badgeBg = Color(0x73000000),
            badgeBorder = Color(0xFFFDE047),
            badgeTextColor = Color(0xFFFEF08A)
        )
        "cyber" -> DedicationThemeConfig(
            bgBrush = Brush.horizontalGradient(listOf(Color(0xF206B6D4), Color(0xF22563EB), Color(0xF24338CA))),
            borderColor = Color(0xFF67E8F9),
            leadEmoji = "⚡",
            tailEmoji = "🛸",
            badgeBg = Color(0x73000000),
            badgeBorder = Color(0xFF67E8F9),
            badgeTextColor = Color(0xFFA5F3FC)
        )
        "minimal" -> DedicationThemeConfig(
            bgBrush = Brush.horizontalGradient(listOf(Color(0xF20A0D16), Color(0xF2161B26), Color(0xF20A0D16))),
            borderColor = Color(0xFF64748B),
            leadEmoji = "💬",
            tailEmoji = "🤍",
            badgeBg = Color(0x33FFFFFF),
            badgeBorder = Color(0x4DFFFFFF),
            badgeTextColor = Color(0xFFF1F5F9)
        )
        "love" -> DedicationThemeConfig(
            bgBrush = Brush.horizontalGradient(listOf(Color(0xF2E11D48), Color(0xF2DC2626), Color(0xF2DB2777))),
            borderColor = Color(0xFFFDA4AF),
            leadEmoji = "💌",
            tailEmoji = "💖",
            badgeBg = Color(0x73000000),
            badgeBorder = Color(0xFFFDA4AF),
            badgeTextColor = Color(0xFFFFE4E6)
        )
        else -> DedicationThemeConfig( // "neon"
            bgBrush = Brush.horizontalGradient(listOf(Color(0xF2C026D3), Color(0xF27C3AED), Color(0xF24F46E5))),
            borderColor = Color(0xFFF472B6),
            leadEmoji = "💌",
            tailEmoji = "🎉",
            badgeBg = Color(0x66000000),
            badgeBorder = Color(0xFFFDE68A),
            badgeTextColor = Color(0xFFFDE68A)
        )
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .offset(x = (progress.value * screenWidthDp).dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            modifier = Modifier
                .background(themeCfg.bgBrush, RoundedCornerShape(18.dp))
                .border(2.dp, themeCfg.borderColor, RoundedCornerShape(18.dp))
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(text = themeCfg.leadEmoji, fontSize = 22.sp)
            if (!guestName.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .background(themeCfg.badgeBg, RoundedCornerShape(8.dp))
                        .border(1.dp, themeCfg.badgeBorder, RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = guestName.uppercase(),
                        color = themeCfg.badgeTextColor,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
            Text(
                text = "“$dedication”",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
            Text(text = themeCfg.tailEmoji, fontSize = 22.sp)
        }
    }
}

@Composable
private fun TvSkipVoteBadge(
    skipVote: TvSkipVote,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .background(Color(0xEB0D101B), RoundedCornerShape(16.dp))
            .border(1.5.dp, Color(0xFFF43F5E), RoundedCornerShape(16.dp))
            .padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(text = "⏭️", fontSize = 16.sp)
        Text(
            text = "VOTACIÓN CAMBIAR CANCIÓN: ${skipVote.votes}/${skipVote.threshold} VOTOS",
            color = Color(0xFFFDA4AF),
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
private fun TvDuelOverlay(
    duel: TvDuel,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xF2120E24), RoundedCornerShape(22.dp))
            .border(2.dp, Color(0xFFFBBF24), RoundedCornerShape(22.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .background(Color(0xFFFBBF24), RoundedCornerShape(12.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(
                    text = "⚡ DUELO FIESTERO 1 vs 1 EN VIVO • ¡VOTÁ EN TU CELULAR!",
                    color = Color(0xFF090D16),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Corner A
            Row(
                modifier = Modifier
                    .weight(1f)
                    .background(Color(0x3306B6D4), RoundedCornerShape(16.dp))
                    .border(1.5.dp, Color(0xFF22D3EE), RoundedCornerShape(16.dp))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "ESQUINA A",
                        color = Color(0xFF67E8F9),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = duel.titleA,
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = duel.artistA,
                        color = Color(0xFFCBD5E1),
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "${duel.votesA}",
                        color = Color(0xFF22D3EE),
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "VOTOS",
                        color = Color(0xFFA5F3FC),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            // Corner B
            Row(
                modifier = Modifier
                    .weight(1f)
                    .background(Color(0x33D946EF), RoundedCornerShape(16.dp))
                    .border(1.5.dp, Color(0xFFE879F9), RoundedCornerShape(16.dp))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "ESQUINA B",
                        color = Color(0xFFF0ABFC),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = duel.titleB,
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = duel.artistB,
                        color = Color(0xFFCBD5E1),
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "${duel.votesB}",
                        color = Color(0xFFE879F9),
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "VOTOS",
                        color = Color(0xFFF5D0FE),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}

@Composable
private fun TvRouletteOverlay(
    roulette: TvRoulette,
    modifier: Modifier = Modifier
) {
    var spinIndex by remember(roulette.spinId) { mutableStateOf(0) }
    var spinFinished by remember(roulette.spinId) { mutableStateOf(false) }

    LaunchedEffect(roulette.spinId) {
        spinFinished = false
        val count = roulette.candidates.size.coerceAtLeast(1)
        repeat(26) {
            spinIndex = (spinIndex + 1) % count
            kotlinx.coroutines.delay(110)
        }
        spinFinished = true
    }

    Box(
        modifier = modifier.background(Color(0xD9070A13)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .width(520.dp)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color(0xFF231238), Color(0xFF0F1322))
                    ),
                    RoundedCornerShape(26.dp)
                )
                .border(2.5.dp, Color(0xFFE879F9), RoundedCornerShape(26.dp))
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(text = "🎡", fontSize = 42.sp)
            Box(
                modifier = Modifier
                    .background(Color(0x33D946EF), RoundedCornerShape(20.dp))
                    .border(1.dp, Color(0xFFE879F9), RoundedCornerShape(20.dp))
                    .padding(horizontal = 14.dp, vertical = 4.dp)
            ) {
                Text(
                    text = if (spinFinished) "🎉 RESULTADO DE LA RULETA" else "🎰 GIRANDO RULETA FIESTERA EN VIVO...",
                    color = Color(0xFFF5D0FE),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace
                )
            }
            Text(
                text = if (spinFinished) "¡Tema Ganador del Sorteo!" else "Sorteando entre las propuestas...",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Black
            )

            val displayedTitle = if (!spinFinished && roulette.candidates.isNotEmpty()) {
                roulette.candidates[spinIndex % roulette.candidates.size].title
            } else {
                roulette.winnerTitle
            }
            val displayedArtist = if (!spinFinished && roulette.candidates.isNotEmpty()) {
                roulette.candidates[spinIndex % roulette.candidates.size].artist
            } else {
                roulette.winnerArtist
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        if (spinFinished) Color(0x33F59E0B) else Color(0x33A855F7),
                        RoundedCornerShape(18.dp)
                    )
                    .border(
                        1.5.dp,
                        if (spinFinished) Color(0xFFFBBF24) else Color(0xFFC084FC),
                        RoundedCornerShape(18.dp)
                    )
                    .padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (spinFinished) {
                    Text(
                        text = "🏆 GANADORA • PASA AL TOPE DE LA COLA",
                        color = Color(0xFFFDE68A),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }
                Text(
                    text = displayedTitle,
                    color = Color(0xFFFDE68A),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Black,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = displayedArtist,
                    color = Color(0xFFE2E8F0),
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (spinFinished && !roulette.winnerGuestName.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "🎉 Propuesto por ${roulette.winnerGuestName}",
                        color = Color(0xFFF0ABFC),
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
