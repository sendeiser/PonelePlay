package app.poneleplay.tv.ui

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

class YouTubeBridge(
    private val onEnded: () -> Unit,
    private val onError: (errorCode: Int) -> Unit = {}
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun onStateChange(state: Int) {
        if (state == 0) { // YT.PlayerState.ENDED
            mainHandler.post { onEnded() }
        }
    }

    @JavascriptInterface
    fun onError(errorCode: Int) {
        mainHandler.post {
            onError(errorCode)
            // If an unplayable video error occurs (e.g. 100, 101, 150, 152),
            // auto-advance to next song after 3.5s so screen doesn't stay frozen
            mainHandler.postDelayed({
                onEnded()
            }, 3500)
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
                    databaseEnabled = true
                    mediaPlaybackRequiresUserGesture = false
                    cacheMode = WebSettings.LOAD_DEFAULT
                    allowContentAccess = true
                    allowFileAccess = true
                    // Standard Chrome Mobile User-Agent without '; wv' prevents YouTube error 150 / 152-4 on VEVO / BBC Music videos
                    userAgentString = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
                }

                webChromeClient = object : WebChromeClient() {
                    override fun onPermissionRequest(request: PermissionRequest?) {
                        request?.grant(request.resources)
                    }
                }
                webViewClient = WebViewClient()

                addJavascriptInterface(YouTubeBridge(onEnded), "AndroidBridge")

                controller.webView = this
                controller.currentVideoId = videoId

                val html = buildPlayerHtml(videoId, isMuted)
                val originUrl = "https://poneleplay.netlify.app"
                loadDataWithBaseURL(originUrl, html, "text/html", "UTF-8", originUrl)
            }
        },
        update = {
            controller.webView = it
        }
    )
}

private fun buildPlayerHtml(videoId: String, isMuted: Boolean): String {
    val muteCall = if (isMuted) "try { e.target.mute(); } catch(_){}" else "try { e.target.unMute(); } catch(_){}"
    val embedUrl = "https://www.youtube-nocookie.com/embed/$videoId?autoplay=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1&origin=https%3A%2F%2Fponeleplay.netlify.app&widget_referrer=https%3A%2F%2Fponeleplay.netlify.app"

    return """
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <meta name="referrer" content="strict-origin-when-cross-origin">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; background: #000; }
            html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
            #player { width: 100vw; height: 100vh; pointer-events: none; border: none; }
          </style>
        </head>
        <body>
          <iframe
            id="player"
            width="100%"
            height="100%"
            src="$embedUrl"
            frameborder="0"
            allow="autoplay; encrypted-media; gyroscope; picture-in-picture"
            referrerpolicy="strict-origin-when-cross-origin"
            style="width: 100vw; height: 100vh; border: none; pointer-events: none;"
          ></iframe>
          <script>
            var tag = document.createElement('script');
            tag.src = "https://www.youtube-nocookie.com/iframe_api";
            var first = document.getElementsByTagName('script')[0];
            first.parentNode.insertBefore(tag, first);

            var player = null;
            var initialId = '$videoId';
            var isEndedSent = false;

            function onYouTubeIframeAPIReady() {
              player = new YT.Player('player', {
                events: {
                  'onReady': function(e) {
                    try {
                      e.target.playVideo();
                      $muteCall
                    } catch(err) {}
                  },
                  'onStateChange': function(e) {
                    if (e.data === 0 && !isEndedSent) { // YT.PlayerState.ENDED
                      isEndedSent = true;
                      if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                        window.AndroidBridge.onStateChange(0);
                      }
                    } else if (e.data === 1) {
                      isEndedSent = false;
                    }
                  },
                  'onError': function(e) {
                    console.error('YouTube Player Error:', e.data);
                    if (window.AndroidBridge && window.AndroidBridge.onError) {
                      window.AndroidBridge.onError(e.data);
                    }
                  }
                }
              });
            }

            function loadVideo(id) {
              isEndedSent = false;
              if (player && typeof player.loadVideoById === 'function') {
                try {
                  player.loadVideoById({
                    videoId: id,
                    startSeconds: 0
                  });
                } catch(e) {
                  updateIframe(id);
                }
              } else {
                updateIframe(id);
                initialId = id;
              }
            }

            function updateIframe(id) {
              var el = document.getElementById('player');
              if (el) {
                el.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1&origin=https%3A%2F%2Fponeleplay.netlify.app&widget_referrer=https%3A%2F%2Fponeleplay.netlify.app";
              }
            }

            function playVideo() { try { if (player && player.playVideo) player.playVideo(); } catch(_){} }
            function pauseVideo() { try { if (player && player.pauseVideo) player.pauseVideo(); } catch(_){} }
            function seekTo(sec) { try { if (player && player.seekTo) player.seekTo(sec, true); } catch(_){} }
            function setVolume(v) { try { if (player && player.setVolume) player.setVolume(v); } catch(_){} }
            function mute() { try { if (player && player.mute) player.mute(); } catch(_){} }
            function unMute() { try { if (player && player.unMute) player.unMute(); } catch(_){} }
          </script>
        </body>
        </html>
    """.trimIndent()
}
