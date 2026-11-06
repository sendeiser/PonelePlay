package app.poneleplay.tv.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.poneleplay.tv.TVButton
import app.poneleplay.tv.updater.AppUpdateInfo

sealed class UpdateDialogState {
    object Checking : UpdateDialogState()
    data class Available(val updateInfo: AppUpdateInfo) : UpdateDialogState()
    data class Downloading(val progress: Float, val downloadedBytes: Long, val totalBytes: Long) : UpdateDialogState()
    data class ReadyToInstall(val updateInfo: AppUpdateInfo) : UpdateDialogState()
    data class UpToDate(val currentVersionName: String) : UpdateDialogState()
    data class Error(val message: String) : UpdateDialogState()
}

@Composable
fun TvUpdateDialog(
    isOpen: Boolean,
    state: UpdateDialogState,
    currentVersionName: String,
    onStartDownload: (AppUpdateInfo) -> Unit,
    onInstall: () -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit
) {
    if (!isOpen) return

    val firstFocusRequester = remember { FocusRequester() }

    LaunchedEffect(state) {
        kotlinx.coroutines.delay(120)
        try {
            firstFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    Dialog(onDismissRequest = {
        if (state !is UpdateDialogState.Downloading) {
            onDismiss()
        }
    }) {
        Box(
            modifier = Modifier
                .width(560.dp)
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
                        text = "🚀 ACTUALIZADOR DE APP",
                        color = Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "Actual: v$currentVersionName",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Spacer(modifier = Modifier.height(2.dp))

                when (state) {
                    is UpdateDialogState.Checking -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 24.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(
                                color = Color(0xFF22D3EE),
                                modifier = Modifier.size(28.dp)
                            )
                            Spacer(modifier = Modifier.width(16.dp))
                            Text(
                                text = "Buscando actualizaciones en el servidor...",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    is UpdateDialogState.Available -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF141A2E), RoundedCornerShape(12.dp))
                                .border(1.dp, Color(0xFF22D3EE).copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                                .padding(16.dp)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "¡NUEVA VERSIÓN DISPONIBLE!",
                                        color = Color(0xFF22D3EE),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Black,
                                        fontFamily = FontFamily.Monospace
                                    )
                                    Text(
                                        text = state.updateInfo.versionName,
                                        color = Color(0xFF34D399),
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontFamily = FontFamily.Monospace
                                    )
                                }

                                if (!state.updateInfo.releaseNotes.isNullOrBlank()) {
                                    Text(
                                        text = state.updateInfo.releaseNotes,
                                        color = Color(0xFFCBD5E1),
                                        fontSize = 12.sp,
                                        lineHeight = 17.sp
                                    )
                                }
                            }
                        }

                        Text(
                            text = "💡 La descarga se realizará directamente a este televisor y tus datos/vinculación se mantendrán intactos.",
                            color = Color(0xFF94A3B8),
                            fontSize = 11.5.sp
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            TVButton(
                                text = "⬇️ Descargar e Instalar Ahora",
                                onClick = { onStartDownload(state.updateInfo) },
                                modifier = Modifier.weight(1.3f),
                                isPrimary = true,
                                focusRequester = firstFocusRequester
                            )
                            if (!state.updateInfo.mandatory) {
                                TVButton(
                                    text = "Más tarde",
                                    onClick = onDismiss,
                                    modifier = Modifier.weight(0.7f)
                                )
                            }
                        }
                    }

                    is UpdateDialogState.Downloading -> {
                        val animatedProgress by animateFloatAsState(
                            targetValue = state.progress,
                            label = "download_progress"
                        )
                        val percent = (state.progress * 100).toInt()
                        val dlMb = String.format("%.1f", state.downloadedBytes / (1024f * 1024f))
                        val totalMb = if (state.totalBytes > 0) {
                            String.format("%.1f", state.totalBytes / (1024f * 1024f))
                        } else "?"

                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Descargando actualización...",
                                    color = Color.White,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "$percent% ($dlMb / $totalMb MB)",
                                    color = Color(0xFF22D3EE),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }

                            LinearProgressIndicator(
                                progress = { animatedProgress },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(10.dp)
                                    .clip(RoundedCornerShape(5.dp)),
                                color = Color(0xFF22D3EE),
                                trackColor = Color(0xFF1E2638)
                            )

                            Text(
                                text = "⏳ Por favor, no apagues ni desconectes la TV durante la descarga.",
                                color = Color(0xFF94A3B8),
                                fontSize = 11.5.sp
                            )
                        }
                    }

                    is UpdateDialogState.ReadyToInstall -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF0D251C), RoundedCornerShape(12.dp))
                                .border(1.dp, Color(0xFF10B981), RoundedCornerShape(12.dp))
                                .padding(16.dp)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = "✅ ¡DESCARGA COMPLETADA!",
                                    color = Color(0xFF34D399),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Black,
                                    fontFamily = FontFamily.Monospace
                                )
                                Text(
                                    text = "Presioná el botón de abajo para abrir el instalador del sistema Android y confirmar la actualización.",
                                    color = Color(0xFFE2E8F0),
                                    fontSize = 12.sp
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            TVButton(
                                text = "📲 Abrir Instalador de Android",
                                onClick = onInstall,
                                modifier = Modifier.weight(1.3f),
                                isPrimary = true,
                                focusRequester = firstFocusRequester
                            )
                            TVButton(
                                text = "Cerrar",
                                onClick = onDismiss,
                                modifier = Modifier.weight(0.7f)
                            )
                        }
                    }

                    is UpdateDialogState.UpToDate -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF141A2E), RoundedCornerShape(12.dp))
                                .border(1.dp, Color(0xFF3B4970), RoundedCornerShape(12.dp))
                                .padding(16.dp)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = "✅ LA APLICACIÓN ESTÁ AL DÍA",
                                    color = Color(0xFF34D399),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Black,
                                    fontFamily = FontFamily.Monospace
                                )
                                Text(
                                    text = "Ya tienes instalada la versión más reciente (v${state.currentVersionName}).",
                                    color = Color(0xFFCBD5E1),
                                    fontSize = 12.5.sp
                                )
                            }
                        }

                        TVButton(
                            text = "Entendido",
                            onClick = onDismiss,
                            modifier = Modifier.fillMaxWidth(),
                            isPrimary = true,
                            focusRequester = firstFocusRequester
                        )
                    }

                    is UpdateDialogState.Error -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF261217), RoundedCornerShape(12.dp))
                                .border(1.dp, Color(0xFFF43F5E), RoundedCornerShape(12.dp))
                                .padding(16.dp)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = "⚠️ NO SE PUDO ACTUALIZAR",
                                    color = Color(0xFFFB7185),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Black,
                                    fontFamily = FontFamily.Monospace
                                )
                                Text(
                                    text = state.message,
                                    color = Color(0xFFE2E8F0),
                                    fontSize = 12.sp
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            TVButton(
                                text = "Reintentar",
                                onClick = onRetry,
                                modifier = Modifier.weight(1f),
                                isPrimary = true,
                                focusRequester = firstFocusRequester
                            )
                            TVButton(
                                text = "Cerrar",
                                onClick = onDismiss,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
        }
    }
}

