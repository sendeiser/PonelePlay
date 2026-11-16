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
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.poneleplay.tv.ui.theme.PonelePlayTvColors
import com.poneleplay.tv.ui.theme.PonelePlayTvTheme

data class TvRecentRoomUi(val code: String, val name: String, val host: String)

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvHomeScreen(
    initialCode: String = "PLAY42",
    onConnectRoom: (String) -> Unit = {},
    onCreateTvRoom: () -> Unit = {}
) {
    val recentRooms = listOf(
        TvRecentRoomUi("PLAY42", "Previa en lo de Tincho", "Tincho"),
        TvRecentRoomUi("ROOF99", "Terraza Electrónica", "Martu")
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PonelePlayTvColors.BgCanvas)
            .padding(horizontal = 48.dp, vertical = 36.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(
                text = "PONELEPLAY TV",
                color = PonelePlayTvColors.BrandCrimson,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Conecta tu Smart TV a la Fiesta",
                color = PonelePlayTvColors.TextPrimary,
                fontSize = 36.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(PonelePlayTvColors.BgCard, RoundedCornerShape(24.dp))
                    .padding(28.dp)
            ) {
                Column {
                    Text(
                        text = "Unirse con Código D-Pad",
                        color = PonelePlayTvColors.TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        initialCode.padEnd(6, ' ').take(6).forEach { ch ->
                            Box(
                                modifier = Modifier
                                    .size(56.dp)
                                    .background(PonelePlayTvColors.BgCanvas, RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = ch.toString(),
                                    color = PonelePlayTvColors.BrandCrimson,
                                    fontSize = 24.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(20.dp))
                    Button(
                        onClick = { onConnectRoom(initialCode) },
                        colors = ButtonDefaults.colors(
                            containerColor = PonelePlayTvColors.BrandCrimson,
                            contentColor = PonelePlayTvColors.OnBrandCrimson,
                            focusedContainerColor = Color.White,
                            focusedContentColor = PonelePlayTvColors.BgCanvas
                        ),
                        border = ButtonDefaults.border(
                            focusedBorder = Border(BorderStroke(3.dp, PonelePlayTvColors.BrandCrimson))
                        )
                    ) {
                        Text("OK · Conectar a $initialCode", fontWeight = FontWeight.Bold)
                    }
                }
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(PonelePlayTvColors.BgCard, RoundedCornerShape(24.dp))
                    .padding(28.dp)
            ) {
                Column(verticalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        text = "Crear Sala Nueva en esta TV",
                        color = PonelePlayTvColors.TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Usa YouTube Music Audio (sin cuenta Premium) reproduciendo directo en los parlantes del TV.",
                        color = PonelePlayTvColors.TextMuted,
                        fontSize = 16.sp
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = onCreateTvRoom,
                        colors = ButtonDefaults.colors(
                            containerColor = PonelePlayTvColors.BgElevated,
                            contentColor = PonelePlayTvColors.TextPrimary,
                            focusedContainerColor = PonelePlayTvColors.BrandCrimson,
                            focusedContentColor = PonelePlayTvColors.OnBrandCrimson
                        )
                    ) {
                        Text("Crear Sala Ahora", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        Column {
            Text(
                text = "Salas Recientes",
                color = PonelePlayTvColors.TextMuted,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(12.dp))
            TvLazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                items(recentRooms) { room ->
                    Surface(
                        onClick = { onConnectRoom(room.code) },
                        colors = ClickableSurfaceDefaults.colors(
                            containerColor = PonelePlayTvColors.BgCard,
                            focusedContainerColor = PonelePlayTvColors.BgElevated
                        ),
                        border = ClickableSurfaceDefaults.border(
                            focusedBorder = Border(BorderStroke(2.dp, PonelePlayTvColors.BrandCrimson))
                        ),
                        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(16.dp))
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 16.dp)) {
                            Text(room.name, color = PonelePlayTvColors.TextPrimary, fontWeight = FontWeight.Bold)
                            Text("Código ${room.code} · Host ${room.host}", color = PonelePlayTvColors.BrandCrimson, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

@Preview(widthDp = 960, heightDp = 540, showBackground = true)
@Composable
fun TvHomeScreenPreview() {
    PonelePlayTvTheme {
        TvHomeScreen()
    }
}
