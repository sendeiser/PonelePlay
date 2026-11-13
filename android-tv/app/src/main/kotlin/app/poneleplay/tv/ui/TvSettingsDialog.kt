package app.poneleplay.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import app.poneleplay.tv.sync.SyncStatusState
import app.poneleplay.tv.sync.SyncTransportMode

@Composable
fun TvSettingsDialog(
    isOpen: Boolean,
    currentSlug: String,
    currentMode: TvScreenMode,
    isMuted: Boolean,
    currentVersionName: String = "2.9.1",
    syncStatus: SyncStatusState = SyncStatusState(),
    manualLanHost: String = "",
    isScanningLan: Boolean = false,
    lanScanStatusText: String? = null,
    onToggleMode: () -> Unit,
    onToggleMute: () -> Unit,
    onAutoScanLan: () -> Unit = {},
    onSaveManualLanHost: (String) -> Unit = {},
    onForceReconnectSync: () -> Unit = {},
    onUnpair: () -> Unit,
    onCheckUpdates: () -> Unit,
    onReload: () -> Unit,
    onDismiss: () -> Unit,
    onExitApp: () -> Unit
) {
    if (!isOpen) return

    val firstFocusRequester = remember { FocusRequester() }
    var showLanEditor by remember { mutableStateOf(false) }
    var lanInput by remember(manualLanHost, isOpen) { mutableStateOf(manualLanHost) }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(100)
        try {
            firstFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .width(560.dp)
                .background(Color(0xFF0F1424), RoundedCornerShape(20.dp))
                .border(2.dp, Color(0xFF3B4970), RoundedCornerShape(20.dp))
                .padding(24.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
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
                        text = "App Nativa v$currentVersionName",
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

                // Live LAN / Cloud Sync Status Box (Newbie-Friendly)
                val transportLabel = when (syncStatus.transport) {
                    SyncTransportMode.LAN -> "⚡ LAN DIRECTO (Sin delay)"
                    SyncTransportMode.CLOUD -> "☁️ NUBE TIEMPO REAL"
                    SyncTransportMode.CONNECTING -> "🔄 CONECTANDO..."
                    SyncTransportMode.OFFLINE -> "📡 HTTP RESPUESTA LENTA"
                }
                val transportColor = when (syncStatus.transport) {
                    SyncTransportMode.LAN -> Color(0xFF22D3EE)
                    SyncTransportMode.CLOUD -> Color(0xFF34D399)
                    SyncTransportMode.CONNECTING -> Color(0xFFFBBF24)
                    SyncTransportMode.OFFLINE -> Color(0xFF94A3B8)
                }
                val rttLabel = syncStatus.rttMs?.let { " • ${it}ms" } ?: ""
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF141A2E), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0xFF263252), RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "SINCRONIZACIÓN:",
                                color = Color(0xFF94A3B8),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "$transportLabel$rttLabel",
                                color = transportColor,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        val hostInfo = when {
                            manualLanHost.isNotBlank() -> "IP manual Cabina: $manualLanHost"
                            syncStatus.transport == SyncTransportMode.LAN && syncStatus.activeHostLabel.isNotBlank() ->
                                "Conectado a PC en ${syncStatus.activeHostLabel}"
                            !syncStatus.discoveredLanHost.isNullOrBlank() ->
                                "Cabina detectada: ${syncStatus.discoveredLanHost}"
                            syncStatus.cloudDiscoveredLanHosts.isNotEmpty() ->
                                "Red detectada vía nube: ${syncStatus.cloudDiscoveredLanHosts.first()}"
                            syncStatus.activeHostLabel.isNotBlank() -> syncStatus.activeHostLabel
                            else -> "Modo automático activo (Nube + auto-búsqueda Wi-Fi)"
                        }
                        Text(
                            text = hostInfo,
                            color = Color(0xFFCBD5E1),
                            fontSize = 10.5.sp,
                            fontFamily = FontFamily.Monospace
                        )
                        if (!lanScanStatusText.isNullOrBlank()) {
                            Text(
                                text = lanScanStatusText,
                                color = if (lanScanStatusText.startsWith("✅")) Color(0xFF34D399) else Color(0xFFFBBF24),
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }

                // 1-Click Zero-Config Wi-Fi Subnet Finder for Newbies
                TVButton(
                    text = if (isScanningLan) {
                        "⏳ Buscando PC de Cabina en tu Wi-Fi..."
                    } else {
                        "🔍 Buscar Cabina en Wi-Fi automáticamente"
                    },
                    onClick = onAutoScanLan,
                    modifier = Modifier.fillMaxWidth()
                )

                TVButton(
                    text = if (showLanEditor) "🔽 Ocultar opciones avanzadas (IP manual)" else "🛠️ Opciones avanzadas (IP manual / Reconectar)",
                    onClick = { showLanEditor = !showLanEditor },
                    modifier = Modifier.fillMaxWidth()
                )

                if (showLanEditor) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF101629), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0xFF2D3B63), RoundedCornerShape(12.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedTextField(
                            value = lanInput,
                            onValueChange = { lanInput = it },
                            singleLine = true,
                            label = { Text("IP de la PC Cabina (ej: 192.168.1.50)", fontSize = 11.sp) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = Color(0xFF22D3EE),
                                unfocusedBorderColor = Color(0xFF3B4970),
                                focusedLabelColor = Color(0xFF22D3EE),
                                unfocusedLabelColor = Color(0xFF94A3B8)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            TVButton(
                                text = "💾 Guardar IP",
                                onClick = {
                                    onSaveManualLanHost(lanInput.trim())
                                    showLanEditor = false
                                },
                                modifier = Modifier.weight(1f),
                                isPrimary = true
                            )
                            TVButton(
                                text = "Auto mDNS",
                                onClick = {
                                    lanInput = ""
                                    onSaveManualLanHost("")
                                    showLanEditor = false
                                },
                                modifier = Modifier.weight(1f)
                            )
                            TVButton(
                                text = "⚡ Reconectar",
                                onClick = onForceReconnectSync,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }

                // Unpair / PIN Linking Button
                TVButton(
                    text = "🔑 Desvincular Pantalla / Vincular con otra Cabina",
                    onClick = onUnpair,
                    modifier = Modifier.fillMaxWidth()
                )

                // Check for Updates Button
                TVButton(
                    text = "🚀 Buscar Actualizaciones del Sistema",
                    onClick = onCheckUpdates,
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
