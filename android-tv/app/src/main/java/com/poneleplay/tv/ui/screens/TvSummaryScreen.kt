package com.poneleplay.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.poneleplay.tv.ui.theme.PonelePlayTvColors
import com.poneleplay.tv.ui.theme.PonelePlayTvTheme

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvSummaryScreen(
    roomCode: String = "PLAY42",
    onBackHome: () -> Unit = {}
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PonelePlayTvColors.BgCanvas)
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("FIN DE FIESTA · SALA $roomCode", color = PonelePlayTvColors.AmberGold, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(8.dp))
        Text("Podio de DJs de la Noche", color = PonelePlayTvColors.TextPrimary, fontSize = 36.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(modifier = Modifier.height(28.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            listOf(
                Triple("1º ORO", "@martina", "33 pts"),
                Triple("2º PLATA", "@gonza", "27 pts"),
                Triple("3º BRONCE", "@flor", "20 pts")
            ).forEach { (rank, user, pts) ->
                Column(
                    modifier = Modifier
                        .background(PonelePlayTvColors.BgCard, RoundedCornerShape(20.dp))
                        .padding(horizontal = 32.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(rank, color = PonelePlayTvColors.AmberGold, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(user, color = PonelePlayTvColors.TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Text(pts, color = PonelePlayTvColors.SkyAccent, fontSize = 18.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
        Button(onClick = onBackHome) {
            Text("OK · Volver al Inicio de TV", fontWeight = FontWeight.Bold)
        }
    }
}

@Preview(widthDp = 960, heightDp = 540, showBackground = true)
@Composable
fun TvSummaryScreenPreview() {
    PonelePlayTvTheme {
        TvSummaryScreen()
    }
}
