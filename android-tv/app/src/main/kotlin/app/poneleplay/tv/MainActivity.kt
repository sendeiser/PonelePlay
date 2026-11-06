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
import app.poneleplay.tv.ui.TvUpdateDialog
import app.poneleplay.tv.ui.UpdateDialogState
import app.poneleplay.tv.ui.VideoPlayerController
import app.poneleplay.tv.ui.theme.PonelePlayTVTheme
import app.poneleplay.tv.updater.AppUpdateInfo
import app.poneleplay.tv.updater.TvAppUpdater
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {

    private lateinit var prefs: SharedPreferences
    private val videoController = VideoPlayerController()
    private var showSettingsState = mutableStateOf(false)
    private var screenModeState = mutableStateOf(TvScreenMode.VIDEO)
    private var showQueueState = mutableStateOf(true)
    private var showProposalsState = mutableStateOf(true)
    private var themeState = mutableStateOf("neon")
    private var scaleState = mutableStateOf("normal")
    private var isMutedState = mutableStateOf(false)

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
        screenModeState.value = when (savedMode?.uppercase()) {
            "PLAYLIST" -> TvScreenMode.PLAYLIST
            "CLEAN" -> TvScreenMode.CLEAN
            else -> TvScreenMode.VIDEO
        }
        showQueueState.value = prefs.getBoolean("tv_show_queue", true)
        showProposalsState.value = prefs.getBoolean("tv_show_proposals", true)
        themeState.value = prefs.getString("tv_theme", "neon") ?: "neon"
        scaleState.value = prefs.getString("tv_scale", "normal") ?: "normal"
        isMutedState.value = prefs.getBoolean("tv_is_muted", false)

        setContent {
            PonelePlayTVTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF070A13)
                ) {
                    NativeTvApp(
                        prefs = prefs,
                        screenMode = screenModeState.value,
                        showQueue = showQueueState.value,
                        showProposals = showProposalsState.value,
                        themeName = themeState.value,
                        scaleName = scaleState.value,
                        isMuted = isMutedState.value,
                        showSettings = showSettingsState.value,
                        videoController = videoController,
                        onDismissSettings = { showSettingsState.value = false },
                        onOpenSettings = { showSettingsState.value = true },
                        onToggleMode = { toggleMode() },
                        onToggleMute = { toggleMute() },
                        onDisplayConfig = { applyDisplayConfig(it) },
                        onExitApp = { finish() }
                    )
                }
            }
        }
    }

    private fun applyDisplayConfig(jsonStr: String) {
        try {
            val obj = org.json.JSONObject(jsonStr)
            if (obj.has("mode")) {
                val modeStr = obj.optString("mode", "")
                if (modeStr.isNotBlank()) {
                    val nextMode = when (modeStr.uppercase()) {
                        "PLAYLIST" -> TvScreenMode.PLAYLIST
                        "CLEAN" -> TvScreenMode.CLEAN
                        else -> TvScreenMode.VIDEO
                    }
                    screenModeState.value = nextMode
                    prefs.edit().putString("tv_screen_mode", nextMode.name).apply()
                }
            }
            if (obj.has("showQueue")) {
                val sq = obj.optBoolean("showQueue", true)
                showQueueState.value = sq
                prefs.edit().putBoolean("tv_show_queue", sq).apply()
            }
            if (obj.has("showProposals")) {
                val sp = obj.optBoolean("showProposals", true)
                showProposalsState.value = sp
                prefs.edit().putBoolean("tv_show_proposals", sp).apply()
            }
            if (obj.has("theme")) {
                val th = obj.optString("theme", "")
                if (th.isNotBlank()) {
                    themeState.value = th.lowercase()
                    prefs.edit().putString("tv_theme", th.lowercase()).apply()
                }
            }
            if (obj.has("scale")) {
                val sc = obj.optString("scale", "")
                if (sc.isNotBlank()) {
                    scaleState.value = sc.lowercase()
                    prefs.edit().putString("tv_scale", sc.lowercase()).apply()
                }
            }
            if (obj.has("tvMuted")) {
                val muted = obj.optBoolean("tvMuted", false)
                isMutedState.value = muted
                prefs.edit().putBoolean("tv_is_muted", muted).apply()
                if (muted) videoController.mute() else videoController.unMute()
            }
        } catch (e: Exception) {
            android.util.Log.e("PonelePlayTV", "Error parsing displayConfig: ${e.message}")
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

        // TV Remote Space / Play-Pause / Play / Pause keys
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_SPACE) {
            videoController.togglePlayPause()
            return true
        }
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY) {
            videoController.play()
            return true
        }
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
            videoController.pause()
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
    showQueue: Boolean,
    showProposals: Boolean,
    themeName: String,
    scaleName: String,
    isMuted: Boolean,
    showSettings: Boolean,
    videoController: VideoPlayerController,
    onDismissSettings: () -> Unit,
    onOpenSettings: () -> Unit,
    onToggleMode: () -> Unit,
    onToggleMute: () -> Unit,
    onDisplayConfig: (String) -> Unit,
    onExitApp: () -> Unit
) {
    val serverUrl = "https://poneleplay.netlify.app"
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val currentVersionCode = remember {
        try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                pInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode
            }
        } catch (_: Exception) {
            2
        }
    }

    val currentVersionName = remember {
        try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "2.6.0"
        } catch (_: Exception) {
            "2.6.0"
        }
    }

    var updateDialogState by remember { mutableStateOf<UpdateDialogState?>(null) }
    var downloadedApkFile by remember { mutableStateOf<File?>(null) }

    fun performCheckUpdates(manual: Boolean) {
        coroutineScope.launch {
            if (manual) {
                updateDialogState = UpdateDialogState.Checking
            }
            val res = TvAppUpdater.checkForUpdate(serverUrl, currentVersionCode)
            res.onSuccess { updateInfo ->
                if (updateInfo != null) {
                    updateDialogState = UpdateDialogState.Available(updateInfo)
                } else if (manual) {
                    updateDialogState = UpdateDialogState.UpToDate(currentVersionName)
                }
            }.onFailure { err ->
                if (manual) {
                    updateDialogState = UpdateDialogState.Error(err.message ?: "Error al comprobar actualizaciones")
                }
            }
        }
    }

    fun startDownload(updateInfo: AppUpdateInfo) {
        coroutineScope.launch {
            updateDialogState = UpdateDialogState.Downloading(progress = 0f, downloadedBytes = 0, totalBytes = 0)
            val res = TvAppUpdater.downloadApk(context, updateInfo.apkUrl) { progress, dl, total ->
                updateDialogState = UpdateDialogState.Downloading(progress, dl, total)
            }
            res.onSuccess { apkFile ->
                downloadedApkFile = apkFile
                updateDialogState = UpdateDialogState.ReadyToInstall(updateInfo)
                // Automatically launch system package installer
                val installRes = TvAppUpdater.installApk(context, apkFile)
                if (installRes.isFailure) {
                    val errMsg = installRes.exceptionOrNull()?.message ?: "Error al abrir el instalador."
                    updateDialogState = UpdateDialogState.Error(errMsg)
                }
            }.onFailure { err ->
                updateDialogState = UpdateDialogState.Error(err.message ?: "Error al descargar el archivo de actualización.")
            }
        }
    }

    // Auto-check for updates 4 seconds after app launch in background
    LaunchedEffect(serverUrl) {
        delay(4000)
        performCheckUpdates(manual = false)
    }

    var venueSlug by remember {
        val rawSaved = prefs.getString("venue_slug", "") ?: ""
        val pairedFlag = prefs.getBoolean("is_tv_paired", false)
        // Start at zero (unlinked) if not explicitly paired via PIN
        val initialSlug = if (!pairedFlag || rawSaved == "billar-aurora" || rawSaved == "billar-pool") {
            if (!pairedFlag) "" else rawSaved
        } else {
            rawSaved
        }
        mutableStateOf(initialSlug)
    }

    var isPaired by remember {
        val pairedFlag = prefs.getBoolean("is_tv_paired", false)
        val savedSlug = prefs.getString("venue_slug", "") ?: ""
        mutableStateOf(pairedFlag && savedSlug.isNotBlank())
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

    // Background Telemetry Poller: fetches /api/tv/[slug] when paired
    LaunchedEffect(serverUrl, venueSlug, isPaired) {
        if (!isPaired || venueSlug.isBlank()) return@LaunchedEffect

        isLoading = feed == null
        while (isActive) {
            withContext(Dispatchers.IO) {
                try {
                    val devId = prefs.getString("tv_device_id", "") ?: ""
                    val query = if (devId.isNotBlank()) "?device_id=${java.net.URLEncoder.encode(devId, "UTF-8")}" else ""
                    val endpoint = "${serverUrl.trimEnd('/')}/api/tv/${venueSlug.trim()}$query"
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
                            if (parsed.playback.displayConfigJson != null) {
                                onDisplayConfig(parsed.playback.displayConfigJson)
                            }
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
            delay(1000)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        if (!isPaired || venueSlug.isBlank()) {
            TvPairingScreen(
                serverUrl = serverUrl,
                venueSlug = venueSlug,
                onPaired = { token, deviceId, pairedSlug ->
                    val targetSlug = pairedSlug.ifBlank { venueSlug }
                    if (targetSlug.isNotBlank()) {
                        venueSlug = targetSlug
                        prefs.edit()
                            .putBoolean("is_tv_paired", true)
                            .putString("venue_slug", targetSlug)
                            .putString("tv_player_token", token)
                            .putString("tv_device_id", deviceId)
                            .apply()
                        isPaired = true
                    }
                },
                onOpenSettings = onOpenSettings,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            val currentFeed = feed
            if (currentFeed != null) {
                TvScreen(
                    feed = currentFeed,
                    mode = screenMode,
                    deviceId = prefs.getString("tv_device_id", "") ?: "",
                    showQueue = showQueue,
                    showProposals = showProposals,
                    themeName = themeName,
                    scaleName = scaleName,
                    localIsMuted = isMuted,
                    videoController = videoController,
                    onVideoEnded = {
                        // Handled automatically via polling
                    },
                    onDisplayConfig = onDisplayConfig,
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
            currentMode = screenMode,
            isMuted = isMuted,
            currentVersionName = currentVersionName,
            onToggleMode = onToggleMode,
            onToggleMute = onToggleMute,
            onUnpair = {
                prefs.edit()
                    .putBoolean("is_tv_paired", false)
                    .putString("venue_slug", "")
                    .remove("tv_player_token")
                    .remove("tv_device_id")
                    .apply()
                venueSlug = ""
                isPaired = false
                feed = null
                onDismissSettings()
            },
            onCheckUpdates = {
                onDismissSettings()
                performCheckUpdates(manual = true)
            },
            onReload = {
                feed = null
                isLoading = true
                onDismissSettings()
            },
            onDismiss = onDismissSettings,
            onExitApp = onExitApp
        )

        // In-App Updater Dialog
        TvUpdateDialog(
            isOpen = updateDialogState != null,
            state = updateDialogState ?: UpdateDialogState.Checking,
            currentVersionName = currentVersionName,
            onStartDownload = { info -> startDownload(info) },
            onInstall = {
                downloadedApkFile?.let { apk ->
                    val installRes = TvAppUpdater.installApk(context, apk)
                    if (installRes.isFailure) {
                        val errMsg = installRes.exceptionOrNull()?.message ?: "Error al abrir el instalador."
                        updateDialogState = UpdateDialogState.Error(errMsg)
                    }
                }
            },
            onRetry = {
                performCheckUpdates(manual = true)
            },
            onDismiss = {
                updateDialogState = null
            }
        )
    }
}
