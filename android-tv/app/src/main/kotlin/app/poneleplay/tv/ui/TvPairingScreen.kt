package app.poneleplay.tv.ui

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.poneleplay.tv.TVButton
import app.poneleplay.tv.util.QrGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun TvPairingScreen(
    serverUrl: String,
    venueSlug: String,
    onPaired: (token: String, deviceId: String, slug: String) -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    var pairingCode by remember { mutableStateOf<String?>(null) }
    var pairUrl by remember { mutableStateOf<String?>(null) }
    var qrBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var remainingSeconds by remember { mutableIntStateOf(1800) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isSuccess by remember { mutableStateOf(false) }
    var isPairedData by remember { mutableStateOf<Triple<String, String, String>?>(null) }

    val firstFocusRequester = remember { FocusRequester() }
    val successFocusRequester = remember { FocusRequester() }

    // When pairing is confirmed, automatically transition after 1.2s delay
    LaunchedEffect(isPairedData) {
        val data = isPairedData ?: return@LaunchedEffect
        delay(1200)
        onPaired(data.first, data.second, data.third)
    }

    // Auto-focus success button if paired
    LaunchedEffect(isSuccess) {
        if (isSuccess) {
            delay(150)
            try {
                successFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    // Real-time clock formatted HH:mm
    var currentTime by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        while (isActive) {
            currentTime = sdf.format(Date())
            delay(1000)
        }
    }

    // Auto-focus first button after loading
    LaunchedEffect(pairingCode) {
        if (pairingCode != null) {
            delay(150)
            try {
                firstFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    // Function to request a new pairing code from backend
    suspend fun fetchPairingCode() {
        withContext(Dispatchers.Main) {
            isLoading = true
            errorMessage = null
        }
        withContext(Dispatchers.IO) {
            try {
                val endpoint = "${serverUrl.trimEnd('/')}/api/tv/pair"
                val url = URL(endpoint)
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Accept", "application/json")

                val body = JSONObject().apply {
                    put("action", "request")
                    put("slug", venueSlug.trim())
                    put("deviceName", "Android TV Salón")
                }

                OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

                if (conn.responseCode in 200..299) {
                    val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(responseText)
                    val code = json.optString("code")
                    val rawPairUrl = json.optString("pairUrl")
                    val expiresIn = json.optInt("expiresInSeconds", 1800)

                    val qr = QrGenerator.generate(rawPairUrl, 320)

                    withContext(Dispatchers.Main) {
                        pairingCode = code
                        pairUrl = rawPairUrl
                        qrBitmap = qr
                        remainingSeconds = expiresIn
                        isLoading = false
                        errorMessage = null
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        errorMessage = "Error del servidor (HTTP ${conn.responseCode})"
                        isLoading = false
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    errorMessage = e.message ?: "Error de conexión al servidor"
                    isLoading = false
                }
            }
        }
    }

    // Initial fetch on mount or slug/server change
    var refreshTrigger by remember { mutableIntStateOf(0) }
    LaunchedEffect(serverUrl, venueSlug, refreshTrigger) {
        fetchPairingCode()
    }

    // Countdown timer for code expiry
    LaunchedEffect(pairingCode) {
        while (isActive && remainingSeconds > 0 && !isSuccess) {
            delay(1000)
            remainingSeconds--
        }
        if (remainingSeconds <= 0 && pairingCode != null && !isSuccess) {
            // Auto refresh expired code
            refreshTrigger++
        }
    }

    // Status polling loop: checks every 2500ms
    LaunchedEffect(pairingCode) {
        val currentCode = pairingCode ?: return@LaunchedEffect

        while (isActive && isPairedData == null) {
            delay(2500)
            withContext(Dispatchers.IO) {
                try {
                    val endpoint = "${serverUrl.trimEnd('/')}/api/tv/pair"
                    val url = URL(endpoint)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 4000
                    conn.readTimeout = 4000
                    conn.requestMethod = "POST"
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("Accept", "application/json")

                    val body = JSONObject().apply {
                        put("action", "check")
                        put("slug", venueSlug.trim())
                        put("code", currentCode)
                    }

                    OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

                    if (conn.responseCode in 200..299) {
                        val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(responseText)
                        val isPaired = json.optBoolean("paired", false)
                        val pairedSlug = json.optString("slug", "").trim().ifBlank { venueSlug.trim() }
                        val rawToken = json.optString("token", "")
                        val deviceId = json.optString("deviceId", "")
                        val finalToken = if (rawToken.isNotBlank()) rawToken else "tv-session-$pairedSlug"

                        if (isPaired && pairedSlug.isNotBlank()) {
                            withContext(Dispatchers.Main) {
                                isSuccess = true
                                isPairedData = Triple(finalToken, deviceId, pairedSlug)
                            }
                        }
                    }
                    conn.disconnect()
                } catch (_: Exception) {
                    // Ignore transient network errors during polling
                }
            }
        }
    }

    // Pulsing animation for waiting indicator
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_alpha"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF0F172A), Color(0xFF050811)),
                    radius = 1600f
                )
            )
            .padding(horizontal = 48.dp, vertical = 32.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // TOP HEADER
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFF4F46E5))
                            .padding(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = "PONELEPLAY TV",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Black,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Text(
                        text = "VINCULACIÓN DE PANTALLA",
                        color = Color(0xFFE2E8F0),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )

                    Text(
                        text = if (venueSlug.isNotBlank()) "•  Cabina: $venueSlug" else "•  En cero · Lista para vincular con tu cabina",
                        color = Color(0xFF22D3EE),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = currentTime,
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            // MAIN CONTENT CARD
            if (isSuccess) {
                // Success screen
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(18.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(88.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF10B981)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "✓",
                                color = Color.White,
                                fontSize = 48.sp,
                                fontWeight = FontWeight.Black
                            )
                        }

                        Text(
                            text = "¡PANTALLA VINCULADA CON ÉXITO!",
                            color = Color(0xFF34D399),
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 1.sp
                        )

                        Text(
                            text = "Iniciando reproductor y sincronización en vivo...",
                            color = Color(0xFF94A3B8),
                            fontSize = 16.sp
                        )

                        Spacer(modifier = Modifier.height(6.dp))

                        TVButton(
                            text = "▶️ Entrar al Reproductor Ahora",
                            onClick = {
                                val data = isPairedData
                                if (data != null) {
                                    onPaired(data.first, data.second, data.third)
                                }
                            },
                            isPrimary = true,
                            focusRequester = successFocusRequester
                        )
                    }
                }
            } else if (isLoading && pairingCode == null) {
                // Loading screen
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        CircularProgressIndicator(
                            color = Color(0xFF22D3EE),
                            strokeWidth = 4.dp,
                            modifier = Modifier.size(54.dp)
                        )
                        Text(
                            text = "Generando código seguro de vinculación...",
                            color = Color(0xFF94A3B8),
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            } else if (errorMessage != null && pairingCode == null) {
                // Error screen
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = "⚠️ NO SE PUDO OBTENER EL CÓDIGO",
                            color = Color(0xFFF43F5E),
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = errorMessage ?: "Verificá la conexión al servidor o la URL configurada",
                            color = Color(0xFF94A3B8),
                            fontSize = 15.sp,
                            textAlign = TextAlign.Center
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TVButton(
                                text = "🔄 Reintentar",
                                onClick = { refreshTrigger++ },
                                isPrimary = true
                            )
                            TVButton(
                                text = "⚙️ Abrir Ajustes",
                                onClick = onOpenSettings
                            )
                        }
                    }
                }
            } else {
                // Normal Pairing UI
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(40.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // LEFT COLUMN: PIN Code & Instructions
                    Column(
                        modifier = Modifier
                            .weight(1.3f)
                            .fillMaxHeight(),
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Text(
                                text = "CÓDIGO DE VINCULACIÓN",
                                color = Color(0xFF22D3EE),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                letterSpacing = 2.sp
                            )

                            // 6-DIGIT PIN DISPLAY IN TWO GROUPS OF 3
                            val code = pairingCode ?: "------"
                            val part1 = if (code.length >= 3) code.substring(0, 3) else code
                            val part2 = if (code.length >= 6) code.substring(3, 6) else ""

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Group 1
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    part1.forEach { char ->
                                        PinDigitBox(digit = char.toString())
                                    }
                                }

                                Text(
                                    text = "-",
                                    color = Color(0xFF475569),
                                    fontSize = 32.sp,
                                    fontWeight = FontWeight.Black,
                                    modifier = Modifier.padding(horizontal = 4.dp)
                                )

                                // Group 2
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    part2.forEach { char ->
                                        PinDigitBox(digit = char.toString())
                                    }
                                }
                            }

                            // Pulsing status indicator & countdown
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.padding(top = 4.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(10.dp)
                                        .scale(pulseAlpha)
                                        .clip(CircleShape)
                                        .background(Color(0xFF22D3EE))
                                )

                                Text(
                                    text = "Esperando confirmación en el Panel de Administración...",
                                    color = Color(0xFFE2E8F0),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )

                                val mins = remainingSeconds / 60
                                val secs = remainingSeconds % 60
                                val timerStr = String.format(Locale.getDefault(), "%02d:%02d", mins, secs)

                                Text(
                                    text = "(Vence en $timerStr)",
                                    color = Color(0xFF64748B),
                                    fontSize = 12.sp,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }

                        // Step-by-step instructions card
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF0F172A), RoundedCornerShape(14.dp))
                                .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(14.dp))
                                .padding(16.dp)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                InstructionStep(
                                    num = "1",
                                    text = "Escaneá el código QR con tu celular o abrí el Panel Admin en tu PC."
                                )
                                InstructionStep(
                                    num = "2",
                                    text = "Ingresá a 'Pantallas TV (PIN / QR)' y confirmá este código de 6 dígitos."
                                )
                                InstructionStep(
                                    num = "3",
                                    text = "¡Listo! Esta TV se conectará al instante y comenzará la música."
                                )
                            }
                        }

                        // TV Remote D-Pad Navigation Buttons
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TVButton(
                                text = "🔄 Generar Nuevo PIN",
                                onClick = { refreshTrigger++ },
                                isPrimary = true,
                                focusRequester = firstFocusRequester
                            )

                            TVButton(
                                text = "⚙️ Ajustes de Pantalla",
                                onClick = onOpenSettings
                            )
                        }
                    }

                    // RIGHT COLUMN: High-Contrast QR Code
                    Column(
                        modifier = Modifier
                            .weight(0.7f)
                            .fillMaxHeight(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(Color.White)
                                .padding(18.dp)
                        ) {
                            val qr = qrBitmap
                            if (qr != null) {
                                Image(
                                    bitmap = qr.asImageBitmap(),
                                    contentDescription = "QR de vinculación TV",
                                    modifier = Modifier.size(230.dp)
                                )
                            } else {
                                Box(
                                    modifier = Modifier.size(230.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(color = Color(0xFF4F46E5))
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        Text(
                            text = "ESCANEAR PARA VINCULAR",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.5.sp
                        )

                        Text(
                            text = "Abre directamente el panel de confirmación",
                            color = Color(0xFF64748B),
                            fontSize = 11.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            // BOTTOM STATUS FOOTER
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Tip: Podés abrir Ajustes en cualquier momento con el botón MENÚ o ATRÁS del control.",
                    color = Color(0xFF475569),
                    fontSize = 12.sp
                )

                Text(
                    text = "Servidor: ${serverUrl.replace("https://", "").replace("http://", "")}",
                    color = Color(0xFF475569),
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }
}

@Composable
private fun PinDigitBox(digit: String) {
    Box(
        modifier = Modifier
            .width(52.dp)
            .height(68.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF131B2E))
            .border(2.dp, Color(0xFF38BDF8), RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = digit,
            color = Color.White,
            fontSize = 36.sp,
            fontWeight = FontWeight.Black,
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
private fun InstructionStep(num: String, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            modifier = Modifier
                .size(22.dp)
                .clip(CircleShape)
                .background(Color(0xFF334155)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = num,
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }
        Text(
            text = text,
            color = Color(0xFFCBD5E1),
            fontSize = 12.sp,
            fontWeight = FontWeight.Normal
        )
    }
}

