package com.poneleplay.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

object PonelePlayTvColors {
    val BgCanvas = Color(0xFF0F172A)
    val BgCard = Color(0xFF1E293B)
    val BgElevated = Color(0xFF334155)
    val BrandBlue = Color(0xFF3B82F6)
    val SkyAccent = Color(0xFF38BDF8)
    val OnBrandBlue = Color(0xFFFFFFFF)
    val TextPrimary = Color(0xFFF8FAFC)
    val TextMuted = Color(0xFF94A3B8)
    val BorderSubtle = Color(0xFF334155)
    val AmberGold = Color(0xFFF59E0B)
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PonelePlayTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = PonelePlayTvColors.BrandBlue,
            onPrimary = PonelePlayTvColors.OnBrandBlue,
            secondary = PonelePlayTvColors.SkyAccent,
            onSecondary = PonelePlayTvColors.BgCanvas,
            background = PonelePlayTvColors.BgCanvas,
            onBackground = PonelePlayTvColors.TextPrimary,
            surface = PonelePlayTvColors.BgCard,
            onSurface = PonelePlayTvColors.TextPrimary
        ),
        content = content
    )
}
