package com.poneleplay.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

object PonelePlayTvColors {
    val BgCanvas = Color(0xFF07080E)
    val BgCard = Color(0xFF121420)
    val BgElevated = Color(0xFF1E2132)
    val BrandIndigo = Color(0xFF6366F1)
    val BrandMagenta = Color(0xFFEC4899)
    val BrandAmber = Color(0xFFF97316)
    val BrandTeal = Color(0xFF818CF8)
    val CoralAccent = Color(0xFFF472B6)
    val OnBrandTeal = Color(0xFFFFFFFF)
    val TextPrimary = Color(0xFFF8FAFC)
    val TextMuted = Color(0xFF94A3B8)
    val BorderSubtle = Color(0xFF282C40)
    val AmberGold = Color(0xFFF59E0B)
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PonelePlayTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = PonelePlayTvColors.BrandIndigo,
            onPrimary = PonelePlayTvColors.OnBrandTeal,
            secondary = PonelePlayTvColors.BrandMagenta,
            onSecondary = PonelePlayTvColors.OnBrandTeal,
            background = PonelePlayTvColors.BgCanvas,
            onBackground = PonelePlayTvColors.TextPrimary,
            surface = PonelePlayTvColors.BgCard,
            onSurface = PonelePlayTvColors.TextPrimary
        ),
        content = content
    )
}
