package com.poneleplay.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

object PonelePlayTvColors {
    val BgCanvas = Color(0xFF0F0F23)
    val BgCard = Color(0xFF1B1B30)
    val BgElevated = Color(0xFF27273B)
    val BrandIndigo = Color(0xFF4338CA)
    val NeonGreen = Color(0xFF22C55E)
    val OnNeonGreen = Color(0xFF0F172A)
    val TextPrimary = Color(0xFFF8FAFC)
    val TextMuted = Color(0xFF94A3B8)
    val BorderSubtle = Color(0xFF312E81)
    val AmberGold = Color(0xFFF59E0B)
    val YtmRed = Color(0xFFFF0033)
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PonelePlayTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = PonelePlayTvColors.NeonGreen,
            onPrimary = PonelePlayTvColors.OnNeonGreen,
            secondary = PonelePlayTvColors.BrandIndigo,
            onSecondary = PonelePlayTvColors.TextPrimary,
            background = PonelePlayTvColors.BgCanvas,
            onBackground = PonelePlayTvColors.TextPrimary,
            surface = PonelePlayTvColors.BgCard,
            onSurface = PonelePlayTvColors.TextPrimary
        ),
        content = content
    )
}
