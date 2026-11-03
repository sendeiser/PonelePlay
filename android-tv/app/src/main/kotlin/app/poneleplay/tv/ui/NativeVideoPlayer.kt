package app.poneleplay.tv.ui

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.ConsoleMessage
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
                    mediaPlaybackRequiresUserGesture = false
                    cacheMode = WebSettings.LOAD_DEFAULT
                    allowContentAccess = true
                    allowFileAccess = true
                    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    // Desktop Chrome User-Agent without '; wv' prevents mobile touch play-pause overlay and bypasses error 150/152-4
                    userAgentString = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                }

                webChromeClient = object : WebChromeClient() {
                    override fun onPermissionRequest(request: PermissionRequest?) {
                        request?.grant(request.resources)
                    }

                    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                        android.util.Log.d("PonelePlayTV", "[WebView] ${consoleMessage?.message()}")
                        return true
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
    val embedUrl = "https://www.youtube-nocookie.com/embed/$videoId?autoplay=$autoPlayParam&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&widgetid=1&origin=https%3A%2F%2Fponeleplay.netlify.app&widget_referrer=https%3A%2F%2Fponeleplay.netlify.app"

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
            var player = null;
            var currentVideoId = '$videoId';
            var isEndedSent = false;
            var desiredPaused = ${if (isPaused) "true" else "false"};
            var currentVolume = ${if (isMuted) 0 else volume};
            var currentMuted = ${if (isMuted) "true" else "false"};
            var venueSlug = '${venueSlug.ifBlank { "billar-aurora" }}';
            var lastSyncSeekAt = 0;
            var currentTvTime = 0;
            var currentTvState = -1;

            // Send command directly to YouTube iframe via postMessage AND player instance
            function sendCommand(func, args) {
              try {
                var ifr = document.getElementById('player');
                if (ifr && ifr.contentWindow) {
                  ifr.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: func,
                    args: args || []
                  }), '*');
                }
              } catch(_) {}

              try {
                if (player && typeof player[func] === 'function') {
                  player[func].apply(player, args || []);
                }
              } catch(_) {}
            }

            function pingListening() {
              try {
                var ifr = document.getElementById('player');
                if (ifr && ifr.contentWindow) {
                  ifr.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
                }
              } catch(_) {}
            }

            // Continuously request infoDelivery from YouTube iframe so currentTvTime is always live
            setInterval(pingListening, 1500);
            setTimeout(pingListening, 400);

            function playVideo() {
              desiredPaused = false;
              sendCommand('playVideo', []);
              if (!currentMuted) {
                sendCommand('unMute', []);
                sendCommand('setVolume', [currentVolume > 0 ? currentVolume : 85]);
              }
            }

            function pauseVideo() {
              desiredPaused = true;
              sendCommand('pauseVideo', []);
            }

            function togglePlayPause() {
              if (desiredPaused) playVideo(); else pauseVideo();
            }

            function seekTo(sec) {
              lastSyncSeekAt = Date.now();
              sendCommand('seekTo', [sec, true]);
            }

            function setVolume(v) {
              if (!currentMuted) {
                currentVolume = v;
                sendCommand('setVolume', [v]);
              }
            }

            function mute() {
              currentMuted = true;
              sendCommand('mute', []);
              sendCommand('setVolume', [0]);
            }

            function unMute() {
              currentMuted = false;
              sendCommand('unMute', []);
              sendCommand('setVolume', [currentVolume > 0 ? currentVolume : 85]);
            }

            // Load video cleanly: immediately pause/mute old video so it NEVER leaks or replays at 0s!
            function loadVideo(id, startSec) {
              if (!id) return;
              isEndedSent = false;
              currentVideoId = id;
              var sec = (typeof startSec === 'number' && startSec >= 0) ? startSec : 0;

              // Kill audio of existing video immediately
              sendCommand('pauseVideo', []);
              sendCommand('mute', []);

              if (desiredPaused) {
                sendCommand('cueVideoById', [{ videoId: id, startSeconds: sec }]);
              } else {
                sendCommand('loadVideoById', [{ videoId: id, startSeconds: sec }]);
                sendCommand('playVideo', []);
                if (!currentMuted) {
                  sendCommand('unMute', []);
                  sendCommand('setVolume', [currentVolume > 0 ? currentVolume : 85]);
                }
              }
            }

            // Capture YouTube iframe postMessage responses (infoDelivery gives exact currentTime!)
            window.addEventListener('message', function(e) {
              try {
                var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                if (!data || typeof data !== 'object') return;

                if (data.event === 'infoDelivery' && data.info) {
                  if (typeof data.info.currentTime === 'number') {
                    currentTvTime = data.info.currentTime;
                  }
                  if (typeof data.info.playerState === 'number') {
                    currentTvState = data.info.playerState;
                  }
                }

                if (data.event === 'onStateChange') {
                  currentTvState = data.info;
                  if (data.info === 0 && !isEndedSent) { // ENDED
                    isEndedSent = true;
                    if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                      window.AndroidBridge.onStateChange(0);
                    }
                  } else if (data.info === 1) { // PLAYING
                    isEndedSent = false;
                    if (desiredPaused) {
                      sendCommand('pauseVideo', []);
                    }
                  }
                }
              } catch(_) {}
            });

            // YouTube Iframe API hook (if loaded)
            var tag = document.createElement('script');
            tag.src = "https://www.youtube-nocookie.com/iframe_api";
            var first = document.getElementsByTagName('script')[0];
            first.parentNode.insertBefore(tag, first);

            function onYouTubeIframeAPIReady() {
              try {
                player = new YT.Player('player', {
                  events: {
                    'onReady': function(e) {
                      try {
                        pingListening();
                        if (currentMuted) {
                          sendCommand('mute', []);
                          sendCommand('setVolume', [0]);
                        } else {
                          sendCommand('unMute', []);
                          sendCommand('setVolume', [currentVolume > 0 ? currentVolume : 85]);
                        }
                        if (!desiredPaused) {
                          sendCommand('playVideo', []);
                        } else {
                          sendCommand('pauseVideo', []);
                        }
                      } catch(_) {}
                    },
                    'onStateChange': function(e) {
                      currentTvState = e.data;
                      if (e.data === 0 && !isEndedSent) {
                        isEndedSent = true;
                        if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                          window.AndroidBridge.onStateChange(0);
                        }
                      } else if (e.data === 1) {
                        isEndedSent = false;
                        if (desiredPaused) {
                          sendCommand('pauseVideo', []);
                        }
                      }
                    },
                    'onError': function(e) {
                      if (window.AndroidBridge && window.AndroidBridge.onError) {
                        window.AndroidBridge.onError(e.data);
                      }
                    }
                  }
                });
              } catch(_) {}
            }

            // --- ZERO-DEPENDENCY NATIVE WEBSOCKET FOR INSTANT REALTIME (Sub-30ms) ---
            var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZWxqYm5ybnl4Zmp3bWRwYWV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjQ4MDgsImV4cCI6MjEwOTA0MDgwOH0.ykyPCpxUy9_Dqyx5PdgsdK1gYjuat82v-zMTGDrjxJU";
            var ws = null;
            var hbInterval = null;

            function connectRealtimeWs() {
              if (!venueSlug || typeof WebSocket === 'undefined') return;
              try {
                if (ws) {
                  try { ws.close(); } catch(_) {}
                }
                var wsUrl = "wss://kbeljbnrnyxfjwmdpaew.supabase.co/realtime/v1/websocket?apikey=" + SUPABASE_KEY + "&vsn=1.0.0";
                ws = new WebSocket(wsUrl);

                ws.onopen = function() {
                  // Join the broadcast channel for this venue
                  ws.send(JSON.stringify({
                    topic: "realtime:playback-control:" + venueSlug,
                    event: "phx_join",
                    payload: {
                      config: {
                        broadcast: { ack: false, self: false }
                      }
                    },
                    ref: "join-tv-1"
                  }));

                  clearInterval(hbInterval);
                  hbInterval = setInterval(function() {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({
                        topic: "phoenix",
                        event: "heartbeat",
                        payload: {},
                        ref: "hb"
                      }));
                    }
                  }, 25000);
                };

                ws.onmessage = function(e) {
                  try {
                    var envelope = JSON.parse(e.data);
                    var eventName = null;
                    var eventPayload = null;

                    // Support Phoenix Realtime broadcast wrapper envelope
                    if (envelope.event === "broadcast" && envelope.payload) {
                      eventName = envelope.payload.event;
                      eventPayload = envelope.payload.payload || envelope.payload;
                    } else {
                      eventName = envelope.event;
                      eventPayload = envelope.payload || {};
                    }

                    // 1. Instant Playback Command from DJ Booth
                    if (eventName === "playback_command" && eventPayload) {
                      var cmd = eventPayload.command;
                      var p = eventPayload.payload || eventPayload;

                      if (cmd === 'pause') {
                        pauseVideo();
                      } else if (cmd === 'resume') {
                        playVideo();
                      } else if (cmd === 'toggle_pause') {
                        togglePlayPause();
                      } else if (cmd === 'seek') {
                        var sec = Number(p.seconds != null ? p.seconds : (eventPayload.seconds != null ? eventPayload.seconds : 0));
                        seekTo(sec);
                      } else if (cmd === 'set_volume') {
                        var vol = Number(p.volume != null ? p.volume : (eventPayload.volume != null ? eventPayload.volume : 85));
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
                      } else if (cmd === 'play_now') {
                        var trk = p.track || eventPayload.track;
                        if (trk && trk.youtubeVideoId) {
                          desiredPaused = false;
                          currentVideoId = trk.youtubeVideoId;
                          loadVideo(trk.youtubeVideoId, 0);
                        }
                      }
                    } else if (eventName === "tv_playback_progress" && eventPayload) {
                      // 2. Strict Continuous Time Sync: The TV synchronizes to the Cabina!
                      var curr = eventPayload.currentTime;
                      var isP = eventPayload.isPaused;
                      var sentAt = eventPayload.sentAt;
                      var trk = eventPayload.track;

                      // Sync Pause from master Cabina
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
                        loadVideo(trk.youtubeVideoId, typeof curr === 'number' && curr > 0 ? curr : 0);
                        return;
                      }

                      // Precise Drift Correction (Cabina is Master!)
                      if (typeof curr === 'number' && !isNaN(curr) && !desiredPaused) {
                        var latency = 0;
                        if (typeof sentAt === 'number' && sentAt > 0) {
                          latency = Math.max(0, Math.min(1.0, (Date.now() - sentAt) / 1000));
                        }
                        var targetSec = curr + latency;

                        // TV time from player or infoDelivery postMessage
                        var tvSec = -1;
                        if (player && typeof player.getCurrentTime === 'function') {
                          try {
                            var pt = player.getCurrentTime();
                            if (typeof pt === 'number' && pt >= 0) tvSec = pt;
                          } catch(_) {}
                        }
                        if (tvSec < 0 && typeof currentTvTime === 'number' && currentTvTime >= 0) {
                          tvSec = currentTvTime;
                        }

                        if (tvSec >= 0) {
                          var drift = Math.abs(tvSec - targetSec);
                          var now = Date.now();

                          // Immediate align on major jump/seek (> 1.2s)
                          if (drift > 1.2) {
                            lastSyncSeekAt = now;
                            seekTo(targetSec);
                          }
                          // Smooth 100% sync alignment for noticeable drift (>= 0.35s)
                          else if (drift >= 0.35 && (now - lastSyncSeekAt > 1500)) {
                            lastSyncSeekAt = now;
                            seekTo(targetSec);
                          }
                        }
                      }

                      // Volume & Mute if not overridden by local mute
                      if (!eventPayload.isFromAdminAudio && !currentMuted) {
                        if (typeof eventPayload.volume === 'number') setVolume(eventPayload.volume);
                      }
                    }
                  } catch(err) {}
                };

                ws.onclose = function() {
                  clearInterval(hbInterval);
                  setTimeout(connectRealtimeWs, 3000);
                };

                ws.onerror = function() {
                  try { ws.close(); } catch(_) {}
                };
              } catch(_) {}
            }

            // Start WebSocket Realtime immediately
            connectRealtimeWs();
          </script>
        </body>
        </html>
    """.trimIndent()
}
