package app.poneleplay.tv

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.poneleplay.tv.ui.theme.PonelePlayTVTheme

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
    var venueSlug by remember {
        mutableStateOf(prefs.getString("venue_slug", "billar-aurora") ?: "billar-aurora")
    }
    var serverUrl by remember {
        mutableStateOf(prefs.getString("server_url", "https://poneleplay.app") ?: "https://poneleplay.app")
    }
    var currentUrl by remember {
        mutableStateOf("${serverUrl.trimEnd('/')}/player/$venueSlug")
    }

    var isLoading by remember { mutableStateOf(true) }
    var hasError by remember { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    // Intercept Back button on TV remote
    BackHandler(enabled = true) {
        if (showSettings) {
            onDismissSettings()
        } else {
            onOpenSettings()
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
                        databaseEnabled = true
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
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0x990A0E17)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(
                        color = Color(0xFF4F46E5),
                        strokeWidth = 3.dp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Conectando con la sala...",
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        // Connection Error / Offline Overlay
        if (hasError) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xE60A0E17)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Text(
                        text = "⚠️ No se pudo conectar con el servidor",
                        color = Color(0xFFEF4444),
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Verificá la conexión a Internet de la TV o la URL: $currentUrl",
                        color = Color(0xFF94A3B8),
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Button(
                            onClick = {
                                hasError = false
                                isLoading = true
                                webViewRef?.reload()
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4F46E5))
                        ) {
                            Text("Reintentar Conexión")
                        }
                        OutlinedButton(
                            onClick = onOpenSettings,
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                        ) {
                            Text("Ajustes del Bar")
                        }
                    }
                }
            }
        }

        // Remote Setup & Settings Modal Dialog
        if (showSettings) {
            var tempSlug by remember { mutableStateOf(venueSlug) }
            var tempServer by remember { mutableStateOf(serverUrl) }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xCC000000)),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    modifier = Modifier
                        .width(480.dp)
                        .padding(16.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF141824)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .padding(24.dp)
                            .fillMaxWidth(),
                        horizontalAlignment = Alignment.Start
                    ) {
                        Text(
                            text = "⚙️ Configuración de Pantalla TV",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Ajustá la sala asignada a este televisor",
                            color = Color(0xFF94A3B8),
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp)
                        )

                        // Venue Slug Input
                        Text(
                            text = "Identificador del Bar (Slug):",
                            color = Color(0xFFCBD5E1),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        OutlinedTextField(
                            value = tempSlug,
                            onValueChange = { tempSlug = it.trim().lowercase() },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = Color(0xFF4F46E5),
                                unfocusedBorderColor = Color(0xFF232B42)
                            )
                        )

                        // Server URL Input
                        Text(
                            text = "Servidor Web:",
                            color = Color(0xFFCBD5E1),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        OutlinedTextField(
                            value = tempServer,
                            onValueChange = { tempServer = it.trim() },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = Color(0xFF4F46E5),
                                unfocusedBorderColor = Color(0xFF232B42)
                            )
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        // Action Buttons
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Button(
                                onClick = {
                                    venueSlug = tempSlug
                                    serverUrl = tempServer
                                    prefs.edit()
                                        .putString("venue_slug", tempSlug)
                                        .putString("server_url", tempServer)
                                        .apply()

                                    currentUrl = "${tempServer.trimEnd('/')}/player/$tempSlug"
                                    webViewRef?.loadUrl(currentUrl)
                                    onDismissSettings()
                                },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4F46E5))
                            ) {
                                Text("Guardar y Conectar")
                            }

                            OutlinedButton(
                                onClick = {
                                    webViewRef?.reload()
                                    onDismissSettings()
                                },
                                modifier = Modifier.weight(0.7f),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                            ) {
                                Text("Recargar")
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        TextButton(
                            onClick = onExitApp,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        ) {
                            Text("Salir de la App", color = Color(0xFF94A3B8), fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}
