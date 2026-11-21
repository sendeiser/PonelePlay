package com.poneleplay.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.poneleplay.tv.data.TvRoomUiState
import com.poneleplay.tv.ui.theme.PonelePlayTvColors
import com.poneleplay.tv.ui.theme.PonelePlayTvTheme

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvRoomScreen(
    state: TvRoomUiState = TvRoomUiState(),
    onTogglePlayPause: () -> Unit = {},
    onSkipTrack: () -> Unit = {},
    onToggleAudioMode: () -> Unit = {},
    onFinishParty: () -> Unit = {},
    onDisconnect: () -> Unit = {}
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PonelePlayTvColors.BgCanvas)
            .padding(horizontal = 44.dp, vertical = 30.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = if (state.audioOnTv) {
                    "AUDIO EN PARLANTES DEL TV · YOUTUBE MUSIC SIN PREMIUM"
                } else {
                    "SOLO PANTALLA SINCRONIZADA · AUDIO EN HOST"
                },
                color = PonelePlayTvColors.CoralAccent,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "${state.name} · Sala ${state.code}",
                color = PonelePlayTvColors.TextMuted,
                fontSize = 14.sp
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(28.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .weight(1.25f)
                    .background(PonelePlayTvColors.BgCard, RoundedCornerShape(24.dp))
                    .padding(24.dp),
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(210.dp)
                        .background(PonelePlayTvColors.BgElevated, RoundedCornerShape(20.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (state.isPlaying) "SONANDO" else "EN PAUSA",
                        color = PonelePlayTvColors.CoralAccent,
                        fontWeight = FontWeight.Bold
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text("SONANDO AHORA", color = PonelePlayTvColors.CoralAccent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(state.nowPlayingTitle, color = PonelePlayTvColors.TextPrimary, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                    Text("${state.nowPlayingArtist} · ${state.proposedBy}", color = PonelePlayTvColors.TextMuted, fontSize = 18.sp)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(state.reactionSummary, color = PonelePlayTvColors.TextPrimary, fontSize = 15.sp)
                }
            }

            Column(
                modifier = Modifier
                    .weight(0.95f)
                    .background(PonelePlayTvColors.BgCard, RoundedCornerShape(24.dp))
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("ESCANEÁ PARA VOTAR · ${state.code}", color = PonelePlayTvColors.BrandTeal, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                if (state.topQueue.isEmpty()) {
                    Text("Cola vacía · Autoplay activo", color = PonelePlayTvColors.TextMuted, fontSize = 15.sp)
                } else {
                    state.topQueue.forEachIndexed { idx, entry ->
                        val pinBadge = if (entry.isPinned) " 📌" else ""
                        val scoreLabel = if (entry.netScore >= 0) "+${entry.netScore}" else "${entry.netScore}"
                        Text(
                            text = "#${idx + 1} ${entry.title} — ${entry.artist} ($scoreLabel)$pinBadge",
                            color = if (idx == 0) PonelePlayTvColors.TextPrimary else PonelePlayTvColors.TextMuted,
                            fontSize = 15.sp
                        )
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(
                onClick = onTogglePlayPause,
                colors = ButtonDefaults.colors(
                    containerColor = PonelePlayTvColors.BrandTeal,
                    contentColor = PonelePlayTvColors.OnBrandTeal,
                    focusedContainerColor = Color.White,
                    focusedContentColor = PonelePlayTvColors.BgCanvas
                ),
                border = ButtonDefaults.border(focusedBorder = Border(BorderStroke(3.dp, PonelePlayTvColors.BrandTeal)))
            ) {
                Text(if (state.isPlaying) "Pausar" else "Reproducir", fontWeight = FontWeight.Bold)
            }

            Button(onClick = onSkipTrack) {
                Text("Siguiente Tema")
            }

            Button(onClick = onToggleAudioMode) {
                Text(if (state.audioOnTv) "Cambiar a Solo Pantalla" else "Pasar Audio a TV")
            }

            Button(onClick = onFinishParty) {
                Text("Finalizar Fiesta")
            }

            Button(onClick = onDisconnect) {
                Text("Desconectar")
            }
        }
    }
}

@Preview(widthDp = 960, heightDp = 540, showBackground = true)
@Composable
fun TvRoomScreenPreview() {
    PonelePlayTvTheme {
        TvRoomScreen()
    }
}
