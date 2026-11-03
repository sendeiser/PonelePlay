package app.poneleplay.tv.ui

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.poneleplay.tv.data.TvFeed
import app.poneleplay.tv.data.TvProposal
import app.poneleplay.tv.data.TvTrack
import app.poneleplay.tv.util.QrGenerator
import java.text.SimpleDateFormat
import java.util.*

enum class TvScreenMode {
    VIDEO,
    PLAYLIST
}

@Composable
fun TvScreen(
    feed: TvFeed,
    mode: TvScreenMode,
    videoController: VideoPlayerController,
    onVideoEnded: () -> Unit,
    modifier: Modifier = Modifier
) {
    val qrBitmap = remember(feed.clientUrl) {
        QrGenerator.generate(feed.clientUrl, 320)
    }

    var currentTimeString by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        while (true) {
            currentTimeString = sdf.format(Date())
            kotlinx.coroutines.delay(1000)
        }
    }

    // Reactive Control: React to master control commands from DJ booth (Cabina)
    var lastExecutedSeq by remember { mutableStateOf(feed.playback.commandSeq) }
    LaunchedEffect(feed.playback.commandSeq) {
        if (feed.playback.commandSeq > lastExecutedSeq) {
            lastExecutedSeq = feed.playback.commandSeq
            when (feed.playback.lastCommand) {
                "pause" -> videoController.pause()
                "resume" -> videoController.play()
                "toggle_pause" -> {
                    if (feed.playback.isPaused) videoController.pause() else videoController.play()
                }
                "seek" -> videoController.seekTo(feed.playback.positionSeconds)
                "set_volume" -> {
                    videoController.setVolume(feed.playback.volume)
                    videoController.unMute()
                }
                "mute" -> videoController.mute()
                "unmute" -> videoController.unMute()
                "skip" -> onVideoEnded()
            }
        }
    }

    LaunchedEffect(feed.playback.isPaused) {
        if (feed.playback.isPaused) videoController.pause() else videoController.play()
    }

    LaunchedEffect(feed.playback.volume) {
        videoController.setVolume(feed.playback.volume)
    }

    LaunchedEffect(feed.playback.isMuted) {
        if (feed.playback.isMuted) videoController.mute() else videoController.unMute()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF070A13))
    ) {
        when (mode) {
            TvScreenMode.VIDEO -> {
                TvModeVideo(
                    feed = feed,
                    qrBitmap = qrBitmap,
                    currentTimeString = currentTimeString,
                    videoController = videoController,
                    onVideoEnded = onVideoEnded
                )
            }
            TvScreenMode.PLAYLIST -> {
                TvModePlaylist(
                    feed = feed,
                    qrBitmap = qrBitmap,
                    currentTimeString = currentTimeString,
                    videoController = videoController,
                    onVideoEnded = onVideoEnded
                )
            }
        }
    }
}

/**
 * MODE 1: Fullscreen Video Player with clean, non-intrusive bottom HUD.
 */
@Composable
private fun TvModeVideo(
    feed: TvFeed,
    qrBitmap: Bitmap?,
    currentTimeString: String,
    videoController: VideoPlayerController,
    onVideoEnded: () -> Unit
) {
    val currentVideoId = feed.nowPlaying?.youtubeVideoId ?: "oMpaVIio3UQ"

    Box(modifier = Modifier.fillMaxSize()) {
        // 1. Fullscreen Video Player
        NativeVideoPlayer(
            videoId = currentVideoId,
            venueSlug = feed.venue.slug,
            isPaused = feed.playback.isPaused,
            volume = feed.playback.volume,
            isMuted = feed.playback.isMuted,
            controller = videoController,
            onEnded = onVideoEnded,
            modifier = Modifier.fillMaxSize()
        )

        // 2. Subtle Dark Gradient at Bottom for HUD Readability
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color(0xCC070A13), Color(0xF2070A13))
                    )
                )
        )

        // 3. Bottom HUD Overlay
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .padding(horizontal = 36.dp, vertical = 20.dp),
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
                        .size(12.dp)
                        .background(Color(0xFF22D3EE), CircleShape)
                )
                Spacer(modifier = Modifier.width(12.dp))

                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "EN AIRE",
                            color = Color(0xFF22D3EE),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                        if (feed.nowPlaying?.isKaraoke == true) {
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "🎤 KARAOKE",
                                color = Color(0xFFF43F5E),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                    Text(
                        text = feed.nowPlaying?.title ?: "Esperando temas...",
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = feed.nowPlaying?.artist ?: feed.venue.name,
                        color = Color(0xFF94A3B8),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1
                    )
                }
            }

            // Center: Next Up Snippet
            if (feed.queue.isNotEmpty()) {
                val next = feed.queue.first()
                Column(
                    modifier = Modifier
                        .padding(horizontal = 24.dp)
                        .background(Color(0x99141824), RoundedCornerShape(10.dp))
                        .border(1.dp, Color(0x40334155), RoundedCornerShape(10.dp))
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = "A CONTINUACIÓN",
                        color = Color(0xFF818CF8),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = next.title,
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
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
                            .size(72.dp)
                            .clip(RoundedCornerShape(8.dp))
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = currentTimeString,
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "Pedí tu música",
                        color = Color(0xFF22D3EE),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

/**
 * MODE 2: Party & Queue Emphasis (Split screen: Hero card + Queue + Proposals + Big QR).
 */
@Composable
private fun TvModePlaylist(
    feed: TvFeed,
    qrBitmap: Bitmap?,
    currentTimeString: String,
    videoController: VideoPlayerController,
    onVideoEnded: () -> Unit
) {
    val currentVideoId = feed.nowPlaying?.youtubeVideoId ?: "oMpaVIio3UQ"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp, vertical = 20.dp)
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
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "• ${feed.venue.name.uppercase()}",
                    color = Color(0xFF818CF8),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                // Live Session Pill
                Box(
                    modifier = Modifier
                        .background(Color(0x2610B981), RoundedCornerShape(20.dp))
                        .border(1.dp, Color(0x6610B981), RoundedCornerShape(20.dp))
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(Color(0xFF34D399), CircleShape)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (feed.isOpen) "NOCHE ABIERTA" else "CERRADO",
                            color = Color(0xFF34D399),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }

                Spacer(modifier = Modifier.width(16.dp))

                Text(
                    text = currentTimeString,
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ================= 3-COLUMN CENTRAL AREA =================
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            horizontalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // ----- COLUMN 1: NOW PLAYING HERO CARD (36%) -----
            Box(
                modifier = Modifier
                    .weight(0.36f)
                    .fillMaxHeight()
                    .background(Color(0xFF101524), RoundedCornerShape(16.dp))
                    .border(1.5.dp, Color(0xFF262F4A), RoundedCornerShape(16.dp))
                    .padding(20.dp)
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
                                color = Color(0xFF22D3EE),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = FontFamily.Monospace
                            )

                            if (feed.nowPlaying?.isKaraoke == true) {
                                Text(
                                    text = "🎤 MODO KARAOKE",
                                    color = Color(0xFFF43F5E),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Large Thumbnail or Mini Video
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(190.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp, Color(0xFF334155), RoundedCornerShape(12.dp))
                        ) {
                            // Offscreen or PIP Video
                            NativeVideoPlayer(
                                videoId = currentVideoId,
                                venueSlug = feed.venue.slug,
                                isPaused = feed.playback.isPaused,
                                volume = feed.playback.volume,
                                isMuted = feed.playback.isMuted,
                                controller = videoController,
                                onEnded = onVideoEnded,
                                modifier = Modifier.fillMaxSize()
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        Text(
                            text = feed.nowPlaying?.title ?: "Esperando temas...",
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = feed.nowPlaying?.artist ?: "PonelePlay",
                            color = Color(0xFF94A3B8),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1
                        )
                    }

                    // Bottom: Live Votes for Now Playing
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF161C2E), RoundedCornerShape(10.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val votes = feed.nowPlaying?.voteCount ?: 0
                        val isBarSelection = votes >= 9999 || votes <= 0
                        Text(
                            text = if (isBarSelection) "Selección del bar" else "Votado por el salón",
                            color = Color(0xFF94A3B8),
                            fontSize = 12.sp
                        )
                        Text(
                            text = formatTvVotes(votes),
                            color = if (isBarSelection) Color(0xFF38BDF8) else Color(0xFFF59E0B),
                            fontSize = 14.sp,
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
                    .background(Color(0xFF101524), RoundedCornerShape(16.dp))
                    .border(1.5.dp, Color(0xFF262F4A), RoundedCornerShape(16.dp))
                    .padding(18.dp)
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "COLA EN VIVO",
                            color = Color(0xFF818CF8),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "${feed.queue.size} en espera",
                            color = Color(0xFF94A3B8),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

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
                                fontSize = 13.sp,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            itemsIndexed(feed.queue.take(6)) { index, item ->
                                QueueItemRow(item = item, index = index + 1)
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
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Table QR Call to Action Card
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(0.55f)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color(0xFF1E1B4B), Color(0xFF0F172A))
                            ),
                            RoundedCornerShape(16.dp)
                        )
                        .border(1.5.dp, Color(0xFF6366F1), RoundedCornerShape(16.dp))
                        .padding(16.dp)
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
                                    .size(130.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color.White)
                                    .padding(4.dp)
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                        }
                        Text(
                            text = "¡PEDÍ TU MÚSICA!",
                            color = Color(0xFF22D3EE),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Black,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "Escaneá el código desde tu mesa",
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }

                // Live Proposals Box
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(0.45f)
                        .background(Color(0xFF101524), RoundedCornerShape(16.dp))
                        .border(1.5.dp, Color(0xFF262F4A), RoundedCornerShape(16.dp))
                        .padding(14.dp)
                ) {
                    Column(modifier = Modifier.fillMaxSize()) {
                        Text(
                            text = "PROPUESTAS EN VOTACIÓN",
                            color = Color(0xFFF59E0B),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        if (feed.proposals.isEmpty()) {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Sin propuestas activas",
                                    color = Color(0xFF64748B),
                                    fontSize = 11.sp
                                )
                            }
                        } else {
                            LazyColumn(
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxSize()
                            ) {
                                itemsIndexed(feed.proposals.take(4)) { _, prop ->
                                    ProposalItemRow(proposal = prop)
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
private fun QueueItemRow(item: TvTrack, index: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF161C2E), RoundedCornerShape(10.dp))
            .border(1.dp, Color(0xFF262F4A), RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Position Number
        Text(
            text = "#$index",
            color = Color(0xFF818CF8),
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.width(32.dp)
        )

        // Title and Artist
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = item.artist,
                color = Color(0xFF94A3B8),
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(modifier = Modifier.width(8.dp))

        // Votes Badge
        val isBar = item.voteCount >= 9999 || item.voteCount <= 0
        Box(
            modifier = Modifier
                .background(if (isBar) Color(0x334F46E5) else Color(0x33059669), RoundedCornerShape(6.dp))
                .border(1.dp, if (isBar) Color(0x664F46E5) else Color(0x66059669), RoundedCornerShape(6.dp))
                .padding(horizontal = 8.dp, vertical = 3.dp)
        ) {
            Text(
                text = formatTvVotes(item.voteCount),
                color = if (isBar) Color(0xFFA5B4FC) else Color(0xFF6EE7B7),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

private fun formatTvVotes(voteCount: Int): String {
    return when {
        voteCount >= 9999 || voteCount <= 0 -> "⭐ Selección Bar"
        voteCount == 1 -> "1 voto"
        else -> "$voteCount votos"
    }
}

@Composable
private fun ProposalItemRow(proposal: TvProposal) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF161C2E), RoundedCornerShape(8.dp))
            .border(1.dp, Color(0xFF262F4A), RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 7.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = proposal.title,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "${proposal.voteCount}/${proposal.neededVotes}",
                color = Color(0xFFF59E0B),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }

        Spacer(modifier = Modifier.height(4.dp))

        val progress = (proposal.voteCount.toFloat() / proposal.neededVotes.toFloat()).coerceIn(0f, 1f)
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = Color(0xFFF59E0B),
            trackColor = Color(0xFF334155)
        )
    }
}

