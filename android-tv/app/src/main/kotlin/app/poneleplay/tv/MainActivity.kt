package app.poneleplay.tv

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.os.Bundle
import android.view.KeyEvent
import android.view.SoundEffectConstants
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.poneleplay.tv.ui.theme.PonelePlayTVTheme
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {

    private lateinit var prefs: SharedPreferences
    private var webViewInstance: WebView? = null
    private var showSettingsState = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Keep TV screen on constantly (no sleep / screensaver)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Immersive sticky fullscreen for TV displays
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        prefs = getSharedPreferences("poneleplay_tv_prefs", Context.MODE_PRIVATE)

        setContent {
            PonelePlayTVTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF0A0E17) // Nocturne deep background
                ) {
                    TVPlayerApp(
                        prefs = prefs,
                        showSettings = showSettingsState.value,
                        onDismissSettings = { showSettingsState.value = false },
                        onOpenSettings = { showSettingsState.value = true },
                        onBindWebView = { webViewInstance = it },
                        onExitApp = { finish() }
                    )
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // TV Remote Menu key opens Settings
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showSettingsState.value = !showSettingsState.value
            return true
        }

        // TV Remote Color buttons, Info, Audio, or Mode key toggles between Video mode & Playlist/Votos mode
        if (keyCode == KeyEvent.KEYCODE_PROG_GREEN ||
            keyCode == KeyEvent.KEYCODE_BUTTON_Y ||
            keyCode == KeyEvent.KEYCODE_INFO ||
            keyCode == KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK ||
            keyCode == KeyEvent.KEYCODE_V ||
            keyCode == KeyEvent.KEYCODE_M ||
            keyCode == KeyEvent.KEYCODE_P
        ) {
            webViewInstance?.evaluateJavascript("window.toggleTvScreenMode && window.toggleTvScreenMode()", null)
            return true
        }

        return super.onKeyDown(keyCode, event)
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_MODERATE) {
            webViewInstance?.freeMemory()
        }
    }

    override fun onDestroy() {
        webViewInstance?.destroy()
        super.onDestroy()
    }
}

/**
 * TV D-Pad Focusable Button with prominent visual feedback (scale, border, bright colors).
 * Fully responds to D-Pad Center, OK, and Enter key events.
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
    val scale by animateFloatAsState(targetValue = if (isFocused) 1.08f else 1.0f, label = "button_scale")

    val backgroundColor = when {
        isFocused -> Color(0xFF22D3EE) // Bright Cyan on Focus
        isPrimary -> Color(0xFF4F46E5) // Solid Indigo
        else -> Color(0xFF141824)     // Dark Card
    }

    val textColor = when {
        isFocused -> Color(0xFF0A0E17) // Dark text on bright cyan
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
            .padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = textColor,
            fontSize = 14.sp,
            fontWeight = if (isFocused) FontWeight.ExtraBold else FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TVPlayerApp(
    prefs: SharedPreferences,
    showSettings: Boolean,
    onDismissSettings: () -> Unit,
    onOpenSettings: () -> Unit,
    onBindWebView: (WebView) -> Unit,
    onExitApp: () -> Unit
) {
    // Official live Netlify deployment and local LAN IP
    val defaultCloud = "https://poneleplay.netlify.app"
    val defaultLocalIp = "http://192.168.18.2:3000"

    // Upgrade old placeholder 'poneleplay.app' to the real Netlify deployment URL automatically
    val savedServer = prefs.getString("server_url", null)
    val initialServer = if (savedServer == null || savedServer.contains("poneleplay.app")) {
        defaultCloud
    } else {
        savedServer
    }

    var displayZoom by remember {
        mutableStateOf(prefs.getInt("display_zoom", 78))
    }
    var venueSlug by remember {
        mutableStateOf(prefs.getString("venue_slug", "billar-aurora") ?: "billar-aurora")
    }
    var serverUrl by remember {
        mutableStateOf(initialServer)
    }
    var currentUrl by remember {
        mutableStateOf("${serverUrl.trimEnd('/')}/player/$venueSlug")
    }

    var isLoading by remember { mutableStateOf(true) }
    var hasError by remember { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    val errorFocusRequester = remember { FocusRequester() }
    val settingsFocusRequester = remember { FocusRequester() }

    // Intercept Back button on TV remote
    BackHandler(enabled = true) {
        if (showSettings) {
            onDismissSettings()
        } else {
            onOpenSettings()
        }
    }

    // Auto-focus the first button on error screen
    LaunchedEffect(hasError) {
        if (hasError) {
            delay(150)
            try {
                errorFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    // Auto-focus when settings open
    LaunchedEffect(showSettings) {
        if (showSettings) {
            delay(150)
            try {
                settingsFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    // Auto-focus WebView when return from settings
    LaunchedEffect(showSettings, hasError) {
        if (!showSettings && !hasError) {
            delay(150)
            webViewRef?.requestFocus()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Fullscreen Hardware-Accelerated WebView
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                val cookieManager = android.webkit.CookieManager.getInstance()
                cookieManager.setAcceptCookie(true)

                WebView(context).apply {
                    cookieManager.setAcceptThirdPartyCookies(this, true)
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )

                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        mediaPlaybackRequiresUserGesture = false // Key for auto-playing music/video on TV!
                        allowFileAccess = true
                        allowContentAccess = true
                        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        cacheMode = WebSettings.LOAD_DEFAULT
                        offscreenPreRaster = false // Saves GPU texture memory on TV boxes
                        textZoom = displayZoom
                        userAgentString =
                            "Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2 Build/BRAVIA_VH2_UC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    }

                    overScrollMode = View.OVER_SCROLL_NEVER
                    isVerticalScrollBarEnabled = false
                    isHorizontalScrollBarEnabled = false
                    setBackgroundColor(android.graphics.Color.parseColor("#0A0E17"))

                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            isLoading = true
                            hasError = false
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            isLoading = false
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?
                        ) {
                            if (request?.isForMainFrame == true) {
                                isLoading = false
                                hasError = true
                            }
                        }

                        override fun onRenderProcessGone(
                            view: WebView?,
                            detail: android.webkit.RenderProcessGoneDetail?
                        ): Boolean {
                            try {
                                view?.destroy()
                            } catch (_: Exception) {}
                            isLoading = true
                            hasError = true
                            return true
                        }
                    }

                    webChromeClient = object : WebChromeClient() {
                        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                            // On TV, video playback remains inline in the DOM to avoid compositor freezes
                            callback?.onCustomViewHidden()
                        }

                        override fun onHideCustomView() {
                        }
                    }

                    webViewRef = this
                    onBindWebView(this)
                    loadUrl(currentUrl)
                }
            },
            update = { /* Stable WebView: do not auto-reload on Compose recomposition */ }
        )

        // Loading Indicator Overlay
        if (isLoading && !hasError) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xCC0A0E17)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(
                        color = Color(0xFF22D3EE),
                        strokeWidth = 4.dp,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Text(
                        text = "Conectando con la pantalla del salón...",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = currentUrl,
                        color = Color(0xFF94A3B8),
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        // Connection Error Screen with D-Pad Navigable Quick Options
        if (hasError) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xEE0A0E17)),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    modifier = Modifier
                        .width(640.dp)
                        .padding(24.dp),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF141824)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 16.dp)
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(28.dp)
                    ) {
                        Text(
                            text = "⚠️ No se pudo conectar con el servidor",
                            color = Color(0xFFEF4444),
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "La dirección intentada no respondió:",
                            color = Color(0xFF94A3B8),
                            fontSize = 13.sp
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = currentUrl,
                            color = Color(0xFF22D3EE),
                            fontSize = 13.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center
                        )

                        Spacer(modifier = Modifier.height(24.dp))
                        Text(
                            text = "Elegí una conexión rápida con las flechitas del control:",
                            color = Color(0xFFCBD5E1),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        // Quick Connection Buttons (D-Pad Navigable)
                        Column(
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            TVButton(
                                text = "🌐 Conectar a Netlify ($defaultCloud)",
                                onClick = {
                                    serverUrl = defaultCloud
                                    prefs.edit().putString("server_url", defaultCloud).apply()
                                    currentUrl = "$defaultCloud/player/$venueSlug"
                                    hasError = false
                                    isLoading = true
                                    webViewRef?.loadUrl(currentUrl)
                                },
                                isPrimary = true,
                                focusRequester = errorFocusRequester,
                                modifier = Modifier.fillMaxWidth()
                            )

                            TVButton(
                                text = "💻 Conectar a PC Local ($defaultLocalIp)",
                                onClick = {
                                    serverUrl = defaultLocalIp
                                    prefs.edit().putString("server_url", defaultLocalIp).apply()
                                    currentUrl = "$defaultLocalIp/player/$venueSlug"
                                    hasError = false
                                    isLoading = true
                                    webViewRef?.loadUrl(currentUrl)
                                },
                                modifier = Modifier.fillMaxWidth()
                            )

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                TVButton(
                                    text = "🔄 Reintentar",
                                    onClick = {
                                        hasError = false
                                        isLoading = true
                                        webViewRef?.reload()
                                    },
                                    modifier = Modifier.weight(1f)
                                )

                                TVButton(
                                    text = "⚙️ Cambiar Bar o URL",
                                    onClick = onOpenSettings,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }
            }
        }

        // Full Settings Modal Dialog (Accessible via TV Remote MENU / BACK)
        if (showSettings) {
            var tempSlug by remember { mutableStateOf(venueSlug) }
            var tempServer by remember { mutableStateOf(serverUrl) }
            var tempZoom by remember { mutableStateOf(displayZoom) }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xDD000000)),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    modifier = Modifier
                        .width(580.dp)
                        .padding(20.dp),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF141824)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 20.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .padding(24.dp)
                            .fillMaxWidth(),
                        horizontalAlignment = Alignment.Start
                    ) {
                        Text(
                            text = "⚙️ Ajustes de Pantalla PonelePlay TV",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Configurá la dirección del servidor y el identificador de la sala",
                            color = Color(0xFF94A3B8),
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp)
                        )

                        // Presets Row
                        Text(
                            text = "Selección rápida de Servidor:",
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            TVButton(
                                text = "🌐 Netlify Cloud",
                                onClick = { tempServer = defaultCloud },
                                isPrimary = tempServer == defaultCloud,
                                focusRequester = settingsFocusRequester,
                                modifier = Modifier.weight(1f)
                            )
                            TVButton(
                                text = "💻 PC Local (:3000)",
                                onClick = { tempServer = defaultLocalIp },
                                isPrimary = tempServer == defaultLocalIp,
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Server URL Input
                        Text(
                            text = "Dirección del Servidor (URL):",
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        OutlinedTextField(
                            value = tempServer,
                            onValueChange = { tempServer = it.trim() },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = Color(0xFF22D3EE),
                                unfocusedBorderColor = Color(0xFF232B42)
                            )
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        // Venue Slug Input
                        Text(
                            text = "Identificador del Bar (Slug de sala):",
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        OutlinedTextField(
                            value = tempSlug,
                            onValueChange = { tempSlug = it.trim().lowercase() },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = Color(0xFF22D3EE),
                                unfocusedBorderColor = Color(0xFF232B42)
                            )
                        )

                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "Escala de Pantalla (Zoom TV):",
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            TVButton(
                                text = "70%",
                                onClick = { tempZoom = 70 },
                                isPrimary = tempZoom == 70,
                                modifier = Modifier.weight(1f)
                            )
                            TVButton(
                                text = "78% (TV Óptimo)",
                                onClick = { tempZoom = 78 },
                                isPrimary = tempZoom == 78,
                                modifier = Modifier.weight(1.3f)
                            )
                            TVButton(
                                text = "90%",
                                onClick = { tempZoom = 90 },
                                isPrimary = tempZoom == 90,
                                modifier = Modifier.weight(1f)
                            )
                            TVButton(
                                text = "100%",
                                onClick = { tempZoom = 100 },
                                isPrimary = tempZoom == 100,
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        // Actions
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            TVButton(
                                text = "Guardar y Conectar",
                                onClick = {
                                    venueSlug = tempSlug
                                    serverUrl = tempServer
                                    displayZoom = tempZoom
                                    prefs.edit()
                                        .putString("venue_slug", tempSlug)
                                        .putString("server_url", tempServer)
                                        .putInt("display_zoom", tempZoom)
                                        .apply()
                                    webViewRef?.settings?.textZoom = tempZoom

                                    currentUrl = "${tempServer.trimEnd('/')}/player/$tempSlug"
                                    hasError = false
                                    isLoading = true
                                    webViewRef?.loadUrl(currentUrl)
                                    onDismissSettings()
                                },
                                isPrimary = true,
                                modifier = Modifier.weight(1.2f)
                            )

                            TVButton(
                                text = "Cancelar",
                                onClick = onDismissSettings,
                                modifier = Modifier.weight(0.8f)
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        TVButton(
                            text = "Cerrar Aplicación",
                            onClick = onExitApp,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )
                    }
                }
            }
        }
    }
}
