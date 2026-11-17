package com.poneleplay.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

object PonelePlayTvColors {
    val BgCanvas = Color(0xFF060913)
    val BgCard = Color(0xFF0D1322)
    val BgElevated = Color(0xFF172138)
    val BrandIndigo = Color(0xFF2563EB)
    val BrandMagenta = Color(0xFF06B6D4)
    val BrandAmber = Color(0xFF10B981)
    val BrandTeal = Color(0xFF60A5FA)
    val CoralAccent = Color(0xFF22D3EE)
    val OnBrandTeal = Color(0xFFFFFFFF)
    val TextPrimary = Color(0xFFF8FAFC)
    val TextMuted = Color(0xFF94A3B8)
    val BorderSubtle = Color(0xFF282C40)
    val AmberGold = Color(0xFF34D399)
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
