package app.poneleplay.tv

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.view.KeyEvent
import android.view.SoundEffectConstants
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.poneleplay.tv.data.TvFeed
import app.poneleplay.tv.data.TvFeedParser
import app.poneleplay.tv.ui.NativeVideoPlayer
import app.poneleplay.tv.ui.TvPairingScreen
import app.poneleplay.tv.ui.TvScreen
import app.poneleplay.tv.ui.TvScreenMode
import app.poneleplay.tv.ui.TvSettingsDialog
import app.poneleplay.tv.ui.VideoPlayerController
import app.poneleplay.tv.ui.theme.PonelePlayTVTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {

    private lateinit var prefs: SharedPreferences
    private val videoController = VideoPlayerController()
    private var showSettingsState = mutableStateOf(false)
    private var screenModeState = mutableStateOf(TvScreenMode.VIDEO)
    private var isMutedState = mutableStateOf(true)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Keep TV screen on constantly
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Immersive sticky fullscreen for TV displays
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        prefs = getSharedPreferences("poneleplay_tv_prefs", Context.MODE_PRIVATE)

        val savedMode = prefs.getString("tv_screen_mode", "VIDEO")
        screenModeState.value = if (savedMode == "PLAYLIST") TvScreenMode.PLAYLIST else TvScreenMode.VIDEO
        isMutedState.value = prefs.getBoolean("tv_is_muted", true)

        setContent {
            PonelePlayTVTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF070A13)
                ) {
                    NativeTvApp(
                        prefs = prefs,
                        screenMode = screenModeState.value,
                        isMuted = isMutedState.value,
                        showSettings = showSettingsState.value,
                        videoController = videoController,
                        onDismissSettings = { showSettingsState.value = false },
                        onOpenSettings = { showSettingsState.value = true },
                        onToggleMode = { toggleMode() },
                        onToggleMute = { toggleMute() },
                        onExitApp = { finish() }
                    )
                }
            }
        }
    }

    private fun toggleMode() {
        val next = if (screenModeState.value == TvScreenMode.VIDEO) {
            TvScreenMode.PLAYLIST
        } else {
            TvScreenMode.VIDEO
        }
        screenModeState.value = next
        prefs.edit().putString("tv_screen_mode", next.name).apply()
    }

    private fun toggleMute() {
        val next = !isMutedState.value
        isMutedState.value = next
        prefs.edit().putBoolean("tv_is_muted", next).apply()
        if (next) videoController.mute() else videoController.unMute()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // TV Remote Menu key opens Settings
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showSettingsState.value = !showSettingsState.value
            return true
        }

        // TV Remote Color / Mode / Info keys toggle between Video & Playlist mode
        if (keyCode == KeyEvent.KEYCODE_PROG_GREEN ||
            keyCode == KeyEvent.KEYCODE_BUTTON_Y ||
            keyCode == KeyEvent.KEYCODE_INFO ||
            keyCode == KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK ||
            keyCode == KeyEvent.KEYCODE_V ||
            keyCode == KeyEvent.KEYCODE_P
        ) {
            toggleMode()
            return true
        }

        // TV Remote Mute key
        if (keyCode == KeyEvent.KEYCODE_M) {
            toggleMute()
            return true
        }

        // TV Remote Space / Play-Pause key
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_SPACE) {
            videoController.play()
            return true
        }

        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        videoController.release()
        super.onDestroy()
    }
}

/**
 * TV D-Pad Focusable Button with prominent visual feedback.
 */
@Composable
fun TVButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isPrimary: Boolean = false,
    focusRequester: FocusRequester? = null
) {
    val view = LocalView.current
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(targetValue = if (isFocused) 1.06f else 1.0f, label = "button_scale")

    val backgroundColor = when {
        isFocused -> Color(0xFF22D3EE)
        isPrimary -> Color(0xFF4F46E5)
        else -> Color(0xFF141824)
    }

    val textColor = when {
        isFocused -> Color(0xFF070A13)
        else -> Color.White
    }

    val borderColor = when {
        isFocused -> Color.White
        else -> Color(0xFF232B42)
    }

    Box(
        modifier = modifier
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .scale(scale)
            .onFocusChanged { focusState ->
                if (focusState.isFocused && !isFocused) {
                    view.playSoundEffect(SoundEffectConstants.NAVIGATION_RIGHT)
                }
                isFocused = focusState.isFocused
            }
            .focusable()
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyUp &&
                    (keyEvent.key == Key.DirectionCenter || keyEvent.key == Key.Enter || keyEvent.key == Key.NumPadEnter)
                ) {
                    view.playSoundEffect(SoundEffectConstants.CLICK)
                    onClick()
                    true
                } else {
                    false
                }
            }
            .clickable {
                view.playSoundEffect(SoundEffectConstants.CLICK)
                onClick()
            }
            .background(backgroundColor, RoundedCornerShape(12.dp))
            .border(if (isFocused) 3.5.dp else 1.5.dp, borderColor, RoundedCornerShape(12.dp))
            .padding(horizontal = 18.dp, vertical = 11.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = textColor,
            fontSize = 13.sp,
            fontWeight = if (isFocused) FontWeight.ExtraBold else FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
fun NativeTvApp(
    prefs: SharedPreferences,
    screenMode: TvScreenMode,
    isMuted: Boolean,
    showSettings: Boolean,
    videoController: VideoPlayerController,
    onDismissSettings: () -> Unit,
    onOpenSettings: () -> Unit,
    onToggleMode: () -> Unit,
    onToggleMute: () -> Unit,
    onExitApp: () -> Unit
) {
    val defaultCloud = "https://poneleplay.netlify.app"
    val savedServer = prefs.getString("server_url", null)
    var serverUrl by remember {
        mutableStateOf(
            if (savedServer == null || savedServer.contains("poneleplay.app")) defaultCloud else savedServer
        )
    }

    var venueSlug by remember {
        mutableStateOf(prefs.getString("venue_slug", "billar-aurora") ?: "billar-aurora")
    }

    var isPaired by remember {
        mutableStateOf(prefs.getBoolean("is_tv_paired", false))
    }

    var feed by remember { mutableStateOf<TvFeed?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var hasError by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Intercept Back button
    BackHandler(enabled = true) {
        if (showSettings) {
            onDismissSettings()
        } else {
            onOpenSettings()
        }
    }

    // Background Telemetry Poller: fetches /api/tv/[slug] every 3.5s when paired
    LaunchedEffect(serverUrl, venueSlug, isPaired) {
        if (!isPaired) return@LaunchedEffect

        isLoading = feed == null
        while (isActive) {
            withContext(Dispatchers.IO) {
                try {
                    val endpoint = "${serverUrl.trimEnd('/')}/api/tv/${venueSlug.trim()}"
                    val url = URL(endpoint)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 4000
                    conn.readTimeout = 4000
                    conn.requestMethod = "GET"
                    conn.setRequestProperty("Accept", "application/json")

                    if (conn.responseCode in 200..299) {
                        val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                        val parsed = TvFeedParser.parse(responseText)
                        withContext(Dispatchers.Main) {
                            feed = parsed
                            hasError = false
                            errorMessage = null
                            isLoading = false
                        }
                    } else {
                        withContext(Dispatchers.Main) {
                            if (feed == null) {
                                hasError = true
                                errorMessage = "HTTP ${conn.responseCode}: No se pudo conectar al local"
                            }
                        }
                    }
                    conn.disconnect()
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        if (feed == null) {
                            hasError = true
                            errorMessage = e.message ?: "Error de red al conectar"
                        }
                    }
                }
            }
            delay(3500)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        if (!isPaired) {
            TvPairingScreen(
                serverUrl = serverUrl,
                venueSlug = venueSlug,
                onPaired = { token, deviceId ->
                    prefs.edit()
                        .putBoolean("is_tv_paired", true)
                        .putString("tv_player_token", token)
                        .putString("tv_device_id", deviceId)
                        .apply()
                    isPaired = true
                },
                onOpenSettings = onOpenSettings,
                onBypass = {
                    prefs.edit().putBoolean("is_tv_paired", true).apply()
                    isPaired = true
                },
                modifier = Modifier.fillMaxSize()
            )
        } else {
            val currentFeed = feed
            if (currentFeed != null) {
                TvScreen(
                    feed = currentFeed,
                    mode = screenMode,
                    videoController = videoController,
                    onVideoEnded = {
                        // Handled automatically via polling
                    },
                    modifier = Modifier.fillMaxSize()
                )
            } else if (hasError) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF070A13)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = "⚠️ NO SE PUDO CONECTAR AL LOCAL",
                            color = Color(0xFFF43F5E),
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = errorMessage ?: "Verificá la conexión a Internet o el slug del local",
                            color = Color(0xFF94A3B8),
                            fontSize = 14.sp
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TVButton(
                                text = "Abrir Ajustes",
                                onClick = onOpenSettings,
                                isPrimary = true
                            )
                        }
                    }
                }
            } else {
                // Initial loading
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF070A13)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator(color = Color(0xFF22D3EE))
                        Text(
                            text = "Cargando PonelePlay TV...",
                            color = Color(0xFF94A3B8),
                            fontSize = 14.sp
                        )
                    }
                }
            }
        }

        // Settings Dialog
        TvSettingsDialog(
            isOpen = showSettings,
            currentSlug = venueSlug,
            currentServer = serverUrl,
            currentMode = screenMode,
            isMuted = isMuted,
            onSelectSlug = { newSlug ->
                if (venueSlug != newSlug) {
                    venueSlug = newSlug
                    prefs.edit().putString("venue_slug", newSlug).apply()
                    isPaired = false
                    prefs.edit().putBoolean("is_tv_paired", false).apply()
                    feed = null
                }
            },
            onSelectServer = { newServer ->
                serverUrl = newServer
                prefs.edit().putString("server_url", newServer).apply()
            },
            onToggleMode = onToggleMode,
            onToggleMute = onToggleMute,
            onUnpair = {
                prefs.edit().putBoolean("is_tv_paired", false).remove("tv_player_token").apply()
                isPaired = false
                feed = null
                onDismissSettings()
            },
            onReload = {
                feed = null
                isLoading = true
                onDismissSettings()
            },
            onDismiss = onDismissSettings,
            onExitApp = onExitApp
        )
    }
}
