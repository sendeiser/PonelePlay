package app.poneleplay.tv.ui

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

class YouTubeBridge(
    private val onEnded: () -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun onStateChange(state: Int) {
        if (state == 0) { // YT.PlayerState.ENDED
            mainHandler.post { onEnded() }
        }
    }
}

class VideoPlayerController {
    internal var webView: WebView? = null
    internal var currentVideoId: String? = null

    fun loadVideo(videoId: String) {
        if (videoId == currentVideoId) return
        currentVideoId = videoId
        webView?.evaluateJavascript("loadVideo('$videoId');", null)
    }

    fun play() {
        webView?.evaluateJavascript("playVideo();", null)
    }

    fun pause() {
        webView?.evaluateJavascript("pauseVideo();", null)
    }

    fun seekTo(seconds: Float) {
        webView?.evaluateJavascript("seekTo($seconds);", null)
    }

    fun setVolume(volume: Int) {
        webView?.evaluateJavascript("setVolume($volume);", null)
    }

    fun mute() {
        webView?.evaluateJavascript("mute();", null)
    }

    fun unMute() {
        webView?.evaluateJavascript("unMute();", null)
    }

    fun release() {
        webView?.destroy()
        webView = null
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun NativeVideoPlayer(
    videoId: String,
    isPaused: Boolean,
    isMuted: Boolean,
    controller: VideoPlayerController,
    modifier: Modifier = Modifier,
    onEnded: () -> Unit = {}
) {
    // React to video changes
    LaunchedEffect(videoId) {
        if (videoId.isNotBlank()) {
            controller.loadVideo(videoId)
        }
    }

    // React to pause/play
    LaunchedEffect(isPaused) {
        if (isPaused) controller.pause() else controller.play()
    }

    // React to mute
    LaunchedEffect(isMuted) {
        if (isMuted) controller.mute() else controller.unMute()
    }

    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )

                setBackgroundColor(0xFF000000.toInt())

                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    mediaPlaybackRequiresUserGesture = false
                    cacheMode = WebSettings.LOAD_DEFAULT
                    allowContentAccess = true
                    allowFileAccess = false
                }

                webChromeClient = WebChromeClient()
                webViewClient = WebViewClient()

                addJavascriptInterface(YouTubeBridge(onEnded), "AndroidBridge")

                controller.webView = this
                controller.currentVideoId = videoId

                val html = buildPlayerHtml(videoId, isMuted)
                loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "UTF-8", null)
            }
        },
        update = {
            // Keep controller bound without full reload
            controller.webView = it
        }
    )
}

private fun buildPlayerHtml(videoId: String, isMuted: Boolean): String {
    val muteCall = if (isMuted) "event.target.mute();" else "event.target.unMute();"
    return """
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; background: #000; }
            html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
            #player { width: 100vw; height: 100vh; pointer-events: none; }
          </style>
        </head>
        <body>
          <div id="player"></div>
          <script>
            var tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            var first = document.getElementsByTagName('script')[0];
            first.parentNode.insertBefore(tag, first);

            var player = null;
            var initialId = '$videoId';

            function onYouTubeIframeAPIReady() {
              player = new YT.Player('player', {
                width: '100%',
                height: '100%',
                videoId: initialId,
                playerVars: {
                  'autoplay': 1,
                  'controls': 0,
                  'disablekb': 1,
                  'enablejsapi': 1,
                  'fs': 0,
                  'modestbranding': 1,
                  'rel': 0,
                  'playsinline': 1,
                  'iv_load_policy': 3
                },
                events: {
                  'onReady': function(e) {
                    e.target.playVideo();
                    $muteCall
                  },
                  'onStateChange': function(e) {
                    if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                      window.AndroidBridge.onStateChange(e.data);
                    }
                  }
                }
              });
            }

            function loadVideo(id) {
              if (player && player.loadVideoById) {
                player.loadVideoById(id);
              } else {
                initialId = id;
              }
            }

            function playVideo() { if (player && player.playVideo) player.playVideo(); }
            function pauseVideo() { if (player && player.pauseVideo) player.pauseVideo(); }
            function seekTo(sec) { if (player && player.seekTo) player.seekTo(sec, true); }
            function setVolume(v) { if (player && player.setVolume) player.setVolume(v); }
            function mute() { if (player && player.mute) player.mute(); }
            function unMute() { if (player && player.unMute) player.unMute(); }
          </script>
        </body>
        </html>
    """.trimIndent()
}
