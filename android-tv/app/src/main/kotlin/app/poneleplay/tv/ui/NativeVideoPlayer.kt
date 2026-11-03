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

    fun togglePlayPause() {
        webView?.evaluateJavascript("togglePlayPause();", null)
    }

    fun seekTo(seconds: Float) {
        webView?.evaluateJavascript("seekTo($seconds);", null)
    }

    fun seekTo(seconds: Int) {
        seekTo(seconds.toFloat())
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
    venueSlug: String = "billar-aurora",
    isPaused: Boolean = false,
    volume: Int = 85,
    isMuted: Boolean = false,
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

    // React to volume
    LaunchedEffect(volume) {
        controller.setVolume(volume)
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

                val html = buildPlayerHtml(videoId, venueSlug, isPaused, volume, isMuted)
                val originUrl = "https://poneleplay.netlify.app"
                loadDataWithBaseURL(originUrl, html, "text/html", "UTF-8", originUrl)
            }
        },
        update = {
            controller.webView = it
        }
    )
}

private fun buildPlayerHtml(
    videoId: String,
    venueSlug: String,
    isPaused: Boolean,
    volume: Int,
    isMuted: Boolean
): String {
    val autoPlayParam = if (isPaused) 0 else 1
    val embedUrl = "https://www.youtube-nocookie.com/embed/$videoId?autoplay=$autoPlayParam&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1&origin=https%3A%2F%2Fponeleplay.netlify.app&widget_referrer=https%3A%2F%2Fponeleplay.netlify.app"

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
          <!-- Supabase Client for Sub-50ms Realtime Remote Control & Time Sync -->
          <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
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
            var currentVideoId = '$videoId';
            var isEndedSent = false;
            var desiredPaused = ${if (isPaused) "true" else "false"};
            var currentVolume = $volume;
            var currentMuted = ${if (isMuted) "true" else "false"};
            var venueSlug = '${venueSlug.ifBlank { "billar-aurora" }}';
            var lastSyncSeekAt = 0;
            var realtimeChannel = null;

            function onYouTubeIframeAPIReady() {
              player = new YT.Player('player', {
                events: {
                  'onReady': function(e) {
                    try {
                      if (currentMuted) {
                        e.target.mute();
                      } else {
                        e.target.unMute();
                        e.target.setVolume(currentVolume);
                      }
                      if (!desiredPaused) {
                        e.target.playVideo();
                      } else {
                        e.target.pauseVideo();
                      }
                    } catch(err) {}
                  },
                  'onStateChange': function(e) {
                    if (e.data === 0 && !isEndedSent) { // YT.PlayerState.ENDED
                      isEndedSent = true;
                      if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                        window.AndroidBridge.onStateChange(0);
                      }
                    } else if (e.data === 1) { // PLAYING
                      isEndedSent = false;
                      if (desiredPaused) {
                        try { e.target.pauseVideo(); } catch(_) {}
                      }
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
              if (!id) return;
              isEndedSent = false;
              currentVideoId = id;
              if (player && typeof player.loadVideoById === 'function') {
                try {
                  if (desiredPaused) {
                    player.cueVideoById({ videoId: id, startSeconds: 0 });
                  } else {
                    player.loadVideoById({ videoId: id, startSeconds: 0 });
                  }
                } catch(e) {
                  updateIframe(id);
                }
              } else {
                updateIframe(id);
              }
            }

            function updateIframe(id) {
              var el = document.getElementById('player');
              if (el) {
                var auto = desiredPaused ? 0 : 1;
                el.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=" + auto + "&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&widgetid=1&origin=https%3A%2F%2Fponeleplay.netlify.app&widget_referrer=https%3A%2F%2Fponeleplay.netlify.app";
              }
            }

            function playVideo() {
              desiredPaused = false;
              try { if (player && player.playVideo) player.playVideo(); } catch(_){}
            }

            function pauseVideo() {
              desiredPaused = true;
              try { if (player && player.pauseVideo) player.pauseVideo(); } catch(_){}
            }

            function togglePlayPause() {
              if (desiredPaused) playVideo(); else pauseVideo();
            }

            function seekTo(sec) {
              lastSyncSeekAt = Date.now();
              try { if (player && player.seekTo) player.seekTo(sec, true); } catch(_){}
            }

            function setVolume(v) {
              currentVolume = v;
              try { if (player && player.setVolume) player.setVolume(v); } catch(_){}
            }

            function mute() {
              currentMuted = true;
              try { if (player && player.mute) player.mute(); } catch(_){}
            }

            function unMute() {
              currentMuted = false;
              try {
                if (player && player.unMute) player.unMute();
                if (player && player.setVolume) player.setVolume(currentVolume);
              } catch(_){}
            }

            // --- SUPABASE REALTIME SYNC ENGINE ---
            var SUPABASE_URL = "https://kbeljbnrnyxfjwmdpaew.supabase.co";
            var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZWxqYm5ybnl4Zmp3bWRwYWV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjQ4MDgsImV4cCI6MjEwOTA0MDgwOH0.ykyPCpxUy9_Dqyx5PdgsdK1gYjuat82v-zMTGDrjxJU";

            function connectSupabaseRealtime() {
              if (!venueSlug || typeof window.supabase === 'undefined' || !window.supabase.createClient) {
                return;
              }
              try {
                var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                var channel = client.channel('playback-control:' + venueSlug);

                // 1. Instant Playback Commands (Play, Pause, Seek, Volume, Mute, Skip, Play Now)
                channel.on('broadcast', { event: 'playback_command' }, function(msg) {
                  if (!msg || !msg.payload) return;
                  var cmd = msg.payload.command;
                  var p = msg.payload.payload || {};

                  if (cmd === 'pause') {
                    pauseVideo();
                  } else if (cmd === 'resume') {
                    playVideo();
                  } else if (cmd === 'toggle_pause') {
                    togglePlayPause();
                  } else if (cmd === 'seek') {
                    var targetSec = Number(p.seconds || 0);
                    seekTo(targetSec);
                  } else if (cmd === 'set_volume') {
                    var vol = Number(p.volume != null ? p.volume : 85);
                    setVolume(vol);
                    unMute();
                  } else if (cmd === 'mute') {
                    mute();
                  } else if (cmd === 'unmute') {
                    unMute();
                  } else if (cmd === 'toggle_mute') {
                    if (currentMuted) unMute(); else mute();
                  } else if (cmd === 'skip') {
                    if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                      window.AndroidBridge.onStateChange(0);
                    }
                  } else if (cmd === 'play_now' && p.track && p.track.youtubeVideoId) {
                    desiredPaused = false;
                    loadVideo(p.track.youtubeVideoId);
                    seekTo(0);
                    playVideo();
                  }
                });

                // 2. Continuous Synchronization & Drift Correction (Cabina Audio -> TV Video)
                channel.on('broadcast', { event: 'tv_playback_progress' }, function(msg) {
                  if (!msg || !msg.payload) return;
                  var p = msg.payload;
                  var curr = p.currentTime;
                  var isP = p.isPaused;
                  var sentAt = p.sentAt;
                  var trk = p.track;

                  // Sync Pause state
                  if (typeof isP === 'boolean') {
                    if (isP) {
                      if (!desiredPaused) pauseVideo();
                    } else {
                      if (desiredPaused) playVideo();
                    }
                  }

                  // Sync Track if changed
                  if (trk && trk.youtubeVideoId && trk.youtubeVideoId !== currentVideoId) {
                    currentVideoId = trk.youtubeVideoId;
                    loadVideo(trk.youtubeVideoId);
                  }

                  // High precision time sync
                  if (typeof curr === 'number' && !isNaN(curr) && !desiredPaused) {
                    var latency = 0;
                    if (typeof sentAt === 'number') {
                      latency = Math.max(0, Math.min(1.5, (Date.now() - sentAt) / 1000));
                    }
                    var targetSec = curr + latency;
                    if (player && typeof player.getCurrentTime === 'function') {
                      try {
                        var tvSec = player.getCurrentTime();
                        var drift = Math.abs(tvSec - targetSec);
                        // If drift is >= 0.7s and cooldown >= 2500ms, align TV
                        if (drift >= 0.7 && (Date.now() - lastSyncSeekAt > 2500)) {
                          seekTo(targetSec);
                        }
                      } catch(_) {}
                    }
                  }

                  // Volume & Mute if not overridden by admin audio
                  if (!p.isFromAdminAudio) {
                    if (typeof p.volume === 'number') setVolume(p.volume);
                    if (typeof p.isMuted === 'boolean') {
                      if (p.isMuted) mute(); else unMute();
                    }
                  }
                });

                channel.subscribe();
                realtimeChannel = channel;
              } catch(err) {
                console.error('Realtime initialization error:', err);
              }
            }

            // Poll until Supabase client is ready in window
            var sbTries = 0;
            function initRealtimeWhenReady() {
              if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                connectSupabaseRealtime();
              } else if (sbTries < 40) {
                sbTries++;
                setTimeout(initRealtimeWhenReady, 250);
              }
            }
            initRealtimeWhenReady();
          </script>
        </body>
        </html>
    """.trimIndent()
}
