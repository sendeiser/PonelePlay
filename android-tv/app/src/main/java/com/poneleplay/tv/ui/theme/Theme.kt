package com.poneleplay.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

object PonelePlayTvColors {
    val BgCanvas = Color(0xFF09090B)
    val BgCard = Color(0xFF121215)
    val BgElevated = Color(0xFF1C1C21)
    val BrandCrimson = Color(0xFFFF2D55)
    val OnBrandCrimson = Color(0xFFFFFFFF)
    val TextPrimary = Color(0xFFFAFAFA)
    val TextMuted = Color(0xFFA1A1AA)
    val BorderSubtle = Color(0xFF27272A)
    val AmberGold = Color(0xFFF59E0B)
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PonelePlayTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = PonelePlayTvColors.BrandCrimson,
            onPrimary = PonelePlayTvColors.OnBrandCrimson,
            secondary = PonelePlayTvColors.BgElevated,
            onSecondary = PonelePlayTvColors.TextPrimary,
            background = PonelePlayTvColors.BgCanvas,
            onBackground = PonelePlayTvColors.TextPrimary,
            surface = PonelePlayTvColors.BgCard,
            onSurface = PonelePlayTvColors.TextPrimary
        ),
        content = content
    )
}
