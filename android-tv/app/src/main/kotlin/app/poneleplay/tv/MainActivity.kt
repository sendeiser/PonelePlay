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
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        webViewInstance?.destroy()
        super.onDestroy()
    }
}

/**
 * TV D-Pad Focusable Button with prominent visual feedback (scale, border, bright colors).
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
            .clickable {
                view.playSoundEffect(SoundEffectConstants.CLICK)
                onClick()
            }
            .background(backgroundColor, RoundedCornerShape(12.dp))
            .border(if (isFocused) 3.dp else 1.5.dp, borderColor, RoundedCornerShape(12.dp))
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
    // Default to the computer's detected local IP or saved preference
    val defaultLocalIp = "http://192.168.18.2:3000"
    val defaultCloud = "https://poneleplay.app"

    var venueSlug by remember {
        mutableStateOf(prefs.getString("venue_slug", "billar-aurora") ?: "billar-aurora")
    }
    var serverUrl by remember {
        mutableStateOf(prefs.getString("server_url", defaultLocalIp) ?: defaultLocalIp)
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

    Box(modifier = Modifier.fillMaxSize()) {
        // Fullscreen Hardware-Accelerated WebView
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )

                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        mediaPlaybackRequiresUserGesture = false // Key for auto-playing music/video on TV!
                        allowFileAccess = true
                        allowContentAccess = true
                        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        cacheMode = WebSettings.LOAD_DEFAULT
                        userAgentString =
                            "Mozilla/5.0 (Linux; Android 14; PonelePlayTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    }

                    setLayerType(View.LAYER_TYPE_HARDWARE, null)
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
                    }

                    webChromeClient = object : WebChromeClient() {
                        private var customView: View? = null
                        private var customViewCallback: CustomViewCallback? = null

                        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                            if (customView != null) {
                                callback?.onCustomViewHidden()
                                return
                            }
                            customView = view
                            customViewCallback = callback
                        }

                        override fun onHideCustomView() {
                            customView = null
                            customViewCallback?.onCustomViewHidden()
                            customViewCallback = null
                        }
                    }

                    webViewRef = this
                    onBindWebView(this)
                    loadUrl(currentUrl)
                }
            },
            update = { webView ->
                if (webView.url != currentUrl) {
                    webView.loadUrl(currentUrl)
                }
            }
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
                        .width(620.dp)
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
                            text = "La URL intentada no respondió:",
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
                            text = "Elegí una conexión rápida con el control remoto:",
                            color = Color(0xFFCBD5E1),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        // Quick Connection Buttons (D-Pad Navigable)
                        Column(
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
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
                                isPrimary = true,
                                focusRequester = errorFocusRequester,
                                modifier = Modifier.fillMaxWidth()
                            )

                            TVButton(
                                text = "🌐 Conectar a Servidor Cloud ($defaultCloud)",
                                onClick = {
                                    serverUrl = defaultCloud
                                    prefs.edit().putString("server_url", defaultCloud).apply()
                                    currentUrl = "$defaultCloud/player/$venueSlug"
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
                                    text = "⚙️ Cambiar URL o Bar",
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

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xDD000000)),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    modifier = Modifier
                        .width(560.dp)
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
                            text = "Configurá la dirección del servidor y el identificador del bar",
                            color = Color(0xFF94A3B8),
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp)
                        )

                        // Presets Row
                        Text(
                            text = "Servidores Frecuentes:",
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
                                text = "PC Local (:3000)",
                                onClick = { tempServer = defaultLocalIp },
                                focusRequester = settingsFocusRequester,
                                modifier = Modifier.weight(1f)
                            )
                            TVButton(
                                text = "PonelePlay Cloud",
                                onClick = { tempServer = defaultCloud },
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
                                    prefs.edit()
                                        .putString("venue_slug", tempSlug)
                                        .putString("server_url", tempServer)
                                        .apply()

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
