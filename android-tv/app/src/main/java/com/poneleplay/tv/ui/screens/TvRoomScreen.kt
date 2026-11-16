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
import com.poneleplay.tv.ui.theme.PonelePlayTvColors
import com.poneleplay.tv.ui.theme.PonelePlayTvTheme

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvRoomScreen(
    roomCode: String = "PLAY42",
    audioOnTv: Boolean = true,
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
                text = if (audioOnTv) "AUDIO EN PARLANTES DEL TV · YOUTUBE MUSIC SIN PREMIUM" else "SOLO PANTALLA SINCRONIZADA",
                color = PonelePlayTvColors.BrandCrimson,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Sala $roomCode",
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
                    Text("PORTADA HD", color = Color.White, fontWeight = FontWeight.Bold)
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text("SONANDO AHORA", color = PonelePlayTvColors.BrandCrimson, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text("Neon Pulse (Night City)", color = PonelePlayTvColors.TextPrimary, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                    Text("Synthwave Dreams · @martina", color = PonelePlayTvColors.TextMuted, fontSize = 18.sp)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("01:48 / 03:24 · 🔥14  ❤️9  🕺6", color = PonelePlayTvColors.TextPrimary, fontSize = 15.sp)
                }
            }

            Column(
                modifier = Modifier
                    .weight(0.95f)
                    .background(PonelePlayTvColors.BgCard, RoundedCornerShape(24.dp))
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("ESCANEÁ PARA VOTAR · $roomCode", color = PonelePlayTvColors.BrandCrimson, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text("#1 Neon Rebelión (+14) 📌", color = PonelePlayTvColors.TextPrimary, fontSize = 16.sp)
                Text("#2 Automático — María Becerra (+9)", color = PonelePlayTvColors.TextMuted, fontSize = 15.sp)
                Text("#3 Rincón de la Noche — Duki (+4)", color = PonelePlayTvColors.TextMuted, fontSize = 15.sp)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(
                onClick = {},
                colors = ButtonDefaults.colors(
                    containerColor = PonelePlayTvColors.BrandCrimson,
                    contentColor = PonelePlayTvColors.OnBrandCrimson,
                    focusedContainerColor = Color.White,
                    focusedContentColor = PonelePlayTvColors.BgCanvas
                ),
                border = ButtonDefaults.border(focusedBorder = Border(BorderStroke(3.dp, PonelePlayTvColors.BrandCrimson)))
            ) {
                Text("Play / Pause", fontWeight = FontWeight.Bold)
            }

            Button(onClick = {}) {
                Text("Siguiente Tema")
            }

            Button(onClick = onToggleAudioMode) {
                Text(if (audioOnTv) "Cambiar a Solo Pantalla" else "Pasar Audio a TV")
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
