package com.poneleplay.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

object PonelePlayTvColors {
    val BgCanvas = Color(0xFF0B1517)
    val BgCard = Color(0xFF122226)
    val BgElevated = Color(0xFF1A3036)
    val BrandTeal = Color(0xFF14B8A6)
    val CoralAccent = Color(0xFFFB7185)
    val OnBrandTeal = Color(0xFF042F2E)
    val TextPrimary = Color(0xFFF0FDFA)
    val TextMuted = Color(0xFF94A3B8)
    val BorderSubtle = Color(0xFF1E3A40)
    val AmberGold = Color(0xFFF59E0B)
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PonelePlayTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = PonelePlayTvColors.BrandTeal,
            onPrimary = PonelePlayTvColors.OnBrandTeal,
            secondary = PonelePlayTvColors.CoralAccent,
            onSecondary = PonelePlayTvColors.BgCanvas,
            background = PonelePlayTvColors.BgCanvas,
            onBackground = PonelePlayTvColors.TextPrimary,
            surface = PonelePlayTvColors.BgCard,
            onSurface = PonelePlayTvColors.TextPrimary
        ),
        content = content
    )
}
