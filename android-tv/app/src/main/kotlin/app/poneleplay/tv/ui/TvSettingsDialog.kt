package app.poneleplay.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.poneleplay.tv.TVButton

@Composable
fun TvSettingsDialog(
    isOpen: Boolean,
    currentSlug: String,
    currentServer: String,
    currentMode: TvScreenMode,
    isMuted: Boolean,
    onSelectSlug: (String) -> Unit,
    onSelectServer: (String) -> Unit,
    onToggleMode: () -> Unit,
    onToggleMute: () -> Unit,
    onUnpair: () -> Unit,
    onReload: () -> Unit,
    onDismiss: () -> Unit,
    onExitApp: () -> Unit
) {
    if (!isOpen) return

    val firstFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(100)
        try {
            firstFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .width(540.dp)
                .background(Color(0xFF0F1424), RoundedCornerShape(20.dp))
                .border(2.dp, Color(0xFF3B4970), RoundedCornerShape(20.dp))
                .padding(28.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "⚙️ AJUSTES DE PANTALLA TV",
                        color = Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "App Nativa v2.0",
                        color = Color(0xFF22D3EE),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Mode Switcher Button
                TVButton(
                    text = if (currentMode == TvScreenMode.VIDEO) {
                        "📺 Modo Pantalla: 🎬 VIDEO COMPLETO (Clic para cambiar)"
                    } else {
                        "📺 Modo Pantalla: 📋 PLAYLIST & VOTOS (Clic para cambiar)"
                    },
                    onClick = onToggleMode,
                    modifier = Modifier.fillMaxWidth(),
                    isPrimary = true,
                    focusRequester = firstFocusRequester
                )

                // Mute Toggle Button
                TVButton(
                    text = if (isMuted) "🔇 Sonido TV: SILENCIADO (Recomendado para Cabina)" else "🔊 Sonido TV: ACTIVO",
                    onClick = onToggleMute,
                    modifier = Modifier.fillMaxWidth()
                )

                // Presets for Venue Slug
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "LOCAL VINCULADO (SLUG):",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        TVButton(
                            text = "billar-aurora",
                            onClick = { onSelectSlug("billar-aurora") },
                            modifier = Modifier.weight(1f),
                            isPrimary = currentSlug == "billar-aurora"
                        )
                        TVButton(
                            text = "barpub-nova",
                            onClick = { onSelectSlug("barpub-nova") },
                            modifier = Modifier.weight(1f),
                            isPrimary = currentSlug == "barpub-nova"
                        )
                    }
                }

                // Server URL Toggle
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "SERVIDOR:",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        TVButton(
                            text = "Cloud (Netlify)",
                            onClick = { onSelectServer("https://poneleplay.netlify.app") },
                            modifier = Modifier.weight(1f),
                            isPrimary = currentServer.contains("netlify")
                        )
                        TVButton(
                            text = "LAN Local (192.168.18.2)",
                            onClick = { onSelectServer("http://192.168.18.2:3000") },
                            modifier = Modifier.weight(1f),
                            isPrimary = currentServer.contains("192.168")
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Unpair / PIN Linking Button
                TVButton(
                    text = "🔑 Desvincular Pantalla / Vincular por PIN",
                    onClick = onUnpair,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(6.dp))

                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    TVButton(
                        text = "🔄 Recargar",
                        onClick = onReload,
                        modifier = Modifier.weight(1f)
                    )
                    TVButton(
                        text = "Cerrar Ajustes",
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f)
                    )
                    TVButton(
                        text = "Salir",
                        onClick = onExitApp,
                        modifier = Modifier.weight(0.7f)
                    )
                }
            }
        }
    }
}

