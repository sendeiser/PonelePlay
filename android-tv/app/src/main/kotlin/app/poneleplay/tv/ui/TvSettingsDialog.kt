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
    currentMode: TvScreenMode,
    isMuted: Boolean,
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
                        text = "App Nativa v2.5",
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
                    text = if (isMuted) "🔇 Sonido TV: SILENCIADO (Audio en Cabina)" else "🔊 Sonido TV: ACTIVO (Audio en TV)",
                    onClick = onToggleMute,
                    modifier = Modifier.fillMaxWidth()
                )

                // Currently Linked Venue Info (Linked via PIN)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF141A2E), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0xFF263252), RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "CUENTA / CABINA VINCULADA:",
                                color = Color(0xFF94A3B8),
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = currentSlug.ifBlank { "SIN VINCULAR (EN CERO)" }.uppercase(),
                                color = if (currentSlug.isNotBlank()) Color(0xFF38BDF8) else Color(0xFFFBBF24),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = FontFamily.Monospace
                            )
                        }

                        Text(
                            text = if (currentSlug.isNotBlank()) "✅ Vinculado por PIN" else "⏳ Esperando PIN",
                            color = if (currentSlug.isNotBlank()) Color(0xFF34D399) else Color(0xFFFBBF24),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Unpair / PIN Linking Button
                TVButton(
                    text = "🔑 Desvincular Pantalla / Vincular con otra Cabina",
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
