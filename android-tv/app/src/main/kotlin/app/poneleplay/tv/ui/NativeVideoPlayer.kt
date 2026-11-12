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
    private val onError: (errorCode: Int) -> Unit = {},
    private val getDeviceId: () -> String = { "" },
    private val onDisplayConfig: (String) -> Unit = {},
    private val onVideoCued: (String) -> Unit = {},
    private val onTimeUpdate: (Float, Int) -> Unit = { _, _ -> }
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun onStateChange(state: Int) {
        if (state == 0) { // YT.PlayerState.ENDED
            mainHandler.post { onEnded() }
        }
    }

    @JavascriptInterface
    fun onTrackNearEnd(remainingSec: Int) {
        // Preload notification from web player
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

    @JavascriptInterface
    fun getDeviceId(): String = getDeviceId()

    @JavascriptInterface
    fun onDisplayConfig(jsonStr: String) {
        mainHandler.post { onDisplayConfig(jsonStr) }
    }

    @JavascriptInterface
    fun onVideoCued(videoId: String) {
        mainHandler.post { onVideoCued(videoId) }
    }

    @JavascriptInterface
    fun onTimeUpdate(currentTimeSec: Float, playerState: Int) {
        mainHandler.post { onTimeUpdate(currentTimeSec, playerState) }
    }
}

class VideoPlayerController {
    internal var webView: WebView? = null
    internal var currentVideoId: String? = null
    @Volatile var activeBarrierVideoId: String? = null
    @Volatile var currentPositionSec: Float = 0f
    @Volatile var currentPlayerState: Int = -1
    var onVideoCuedCallback: ((String) -> Unit)? = null

    private fun sanitizeId(raw: String): String =
        raw.replace("'", "").replace("\\", "").replace("\n", "").trim()

    fun loadVideo(videoId: String, startSeconds: Float = 0f) {
        val cleanId = sanitizeId(videoId)
        if (cleanId.isEmpty() || cleanId == currentVideoId || cleanId == activeBarrierVideoId) return
        currentVideoId = cleanId
        val safeSec = startSeconds.coerceAtLeast(0f)
        webView?.evaluateJavascript("loadVideo('$cleanId', $safeSec);", null)
    }

    fun cueVideo(videoId: String, startSeconds: Float = 0f) {
        val cleanId = sanitizeId(videoId)
        if (cleanId.isEmpty()) return
        activeBarrierVideoId = cleanId
        currentVideoId = cleanId
        val safeSec = startSeconds.coerceAtLeast(0f)
        webView?.evaluateJavascript("cueVideoForBarrier('$cleanId', $safeSec);", null)
    }

    fun startScheduledPlay(
        videoId: String,
        startSeconds: Float = 0f,
        volume: Int = 85,
        isMuted: Boolean = false
    ) {
        val cleanId = sanitizeId(videoId)
        if (cleanId.isEmpty()) return
        activeBarrierVideoId = null
        currentVideoId = cleanId
        val safeSec = startSeconds.coerceAtLeast(0f)
        val safeVol = volume.coerceIn(0, 100)
        webView?.evaluateJavascript("startBarrierPlay('$cleanId', $safeSec, $safeVol, $isMuted);", null)
    }

    fun play() {
        if (activeBarrierVideoId != null && activeBarrierVideoId == currentVideoId) return
        webView?.evaluateJavascript("playVideo();", null)
    }

    fun pause() {
        webView?.evaluateJavascript("pauseVideo();", null)
    }

    fun togglePlayPause() {
        webView?.evaluateJavascript("togglePlayPause();", null)
    }

    fun seekTo(seconds: Float) {
        val safeSec = seconds.coerceAtLeast(0f)
        currentPositionSec = safeSec
        webView?.evaluateJavascript("seekTo($safeSec);", null)
    }

    fun seekTo(seconds: Int) {
        seekTo(seconds.toFloat())
    }

    fun setVolume(volume: Int) {
        webView?.evaluateJavascript("setVolume(${volume.coerceIn(0, 100)});", null)
    }

    fun mute() {
        webView?.evaluateJavascript("mute();", null)
    }

    fun unMute() {
        webView?.evaluateJavascript("unMute();", null)
    }

    fun setLegacyWsEnabled(enabled: Boolean) {
        webView?.evaluateJavascript("setLegacyWsEnabled($enabled);", null)
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
    venueSlug: String = "",
    deviceId: String = "",
    isPaused: Boolean = false,
    volume: Int = 85,
    isMuted: Boolean = false,
    initialPositionSeconds: Float = 0f,
    useLegacySupabaseWs: Boolean = true,
    controller: VideoPlayerController,
    modifier: Modifier = Modifier,
    onEnded: () -> Unit = {},
    onDisplayConfig: (String) -> Unit = {}
) {
    // React to video changes (deferred when an active Ready-Barrier is pre-cueing this video)
    LaunchedEffect(videoId) {
        if (videoId.isNotBlank() && controller.activeBarrierVideoId != videoId) {
            controller.loadVideo(videoId, initialPositionSeconds.coerceAtLeast(0f))
        }
    }

    // Follow the server pause state unless holding for Ready-Barrier release
    LaunchedEffect(isPaused, videoId) {
        if (isPaused) {
            controller.pause()
        } else if (controller.activeBarrierVideoId != videoId) {
            controller.play()
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

    // Toggle legacy Supabase WebSocket off immediately once LAN/Cloud sync is active
    LaunchedEffect(useLegacySupabaseWs) {
        controller.setLegacyWsEnabled(useLegacySupabaseWs)
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

                addJavascriptInterface(
                    YouTubeBridge(
                        onEnded = onEnded,
                        getDeviceId = { deviceId },
                        onDisplayConfig = onDisplayConfig,
                        onVideoCued = { cuedId ->
                            controller.onVideoCuedCallback?.invoke(cuedId)
                        },
                        onTimeUpdate = { posSec, state ->
                            controller.currentPositionSec = posSec
                            controller.currentPlayerState = state
                        }
                    ),
                    "AndroidBridge"
                )

                controller.webView = this
                controller.currentVideoId = videoId

                val html = buildPlayerHtml(
                    videoId = videoId,
                    venueSlug = venueSlug,
                    deviceId = deviceId,
                    isPaused = isPaused,
                    volume = volume,
                    isMuted = isMuted,
                    initialPositionSeconds = initialPositionSeconds.coerceAtLeast(0f),
                    useLegacySupabaseWs = useLegacySupabaseWs
                )
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
    deviceId: String,
    isPaused: Boolean,
    volume: Int,
    isMuted: Boolean,
    initialPositionSeconds: Float = 0f,
    useLegacySupabaseWs: Boolean = true
): String {
    val autoPlayParam = if (isPaused) 0 else 1
    val startParam = initialPositionSeconds.toInt().coerceAtLeast(0)
    val embedUrl = "https://www.youtube-nocookie.com/embed/$videoId?autoplay=$autoPlayParam&start=$startParam&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&widgetid=1&origin=https%3A%2F%2Fponeleplay.netlify.app&widget_referrer=https%3A%2F%2Fponeleplay.netlify.app"

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
            var myDeviceId = '$deviceId';
            var isEndedSent = false;
            var desiredPaused = ${if (isPaused) "true" else "false"};
            var currentVolume = ${if (isMuted) 0 else volume};
            var currentMuted = ${if (isMuted) "true" else "false"};
            var venueSlug = '${venueSlug.trim()}';
            var lastSyncSeekAt = 0;
            var currentTvTime = ${initialPositionSeconds};
            var currentDuration = 0;
            var currentTvState = -1;
            var isPreloadSent = false;
            var isFadingOut = false;
            var localTrackLock = { id: null, until: 0 };
            var originalVolume = currentVolume > 0 ? currentVolume : 85;
            var hasSyncedFirstFrame = false;
            var isBarrierHolding = false;
            var barrierCuedNotified = false;
            var legacyWsEnabled = ${if (useLegacySupabaseWs) "true" else "false"};
            var lastTimePushAt = 0;
            var latestMasterTargetSec = ${initialPositionSeconds};
            var latestMasterSentAt = Date.now();
            var lastAppliedSeekSeq = 0;

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

            // Anti-freeze watchdog: if the video should be playing but YouTube stays
            // PAUSED / CUED / UNSTARTED (pause icon frozen on screen after a skip), resume it.
            var lastLoadAt = 0;
            setInterval(function() {
              try {
                if (desiredPaused || isBarrierHolding || isEndedSent || !currentVideoId) return;
                if (Date.now() - lastLoadAt < 2500) return;
                if (currentTvState === 2 || currentTvState === 5 || currentTvState === -1) {
                  playVideo();
                }
              } catch(_) {}
            }, 2500);

            function cueVideoForBarrier(id, startSec) {
              if (!id) return;
              var sec = (typeof startSec === 'number' && startSec >= 0) ? startSec : 0;
              isBarrierHolding = true;
              barrierCuedNotified = false;
              desiredPaused = true;
              isEndedSent = false;
              isPreloadSent = false;
              isFadingOut = false;
              hasSyncedFirstFrame = false;
              currentVideoId = id;
              currentTvTime = sec;
              currentTvState = -1;
              lastLoadAt = Date.now();
              lastSyncSeekAt = Date.now() + 1200;

              sendCommand('pauseVideo', []);
              sendCommand('mute', []);
              sendCommand('setVolume', [0]);
              sendCommand('cueVideoById', [{ videoId: id, startSeconds: sec }]);
            }

            function startBarrierPlay(id, startSec, vol, muted) {
              var sec = (typeof startSec === 'number' && startSec >= 0) ? startSec : 0;
              var targetVol = (typeof vol === 'number' && vol >= 0) ? vol : (originalVolume > 0 ? originalVolume : 85);
              isBarrierHolding = false;
              desiredPaused = false;
              currentMuted = Boolean(muted);
              currentVolume = currentMuted ? 0 : targetVol;
              if (!currentMuted) originalVolume = targetVol;
              lastLoadAt = Date.now();
              lastSyncSeekAt = Date.now() + 900;

              if (id && id !== currentVideoId) {
                currentVideoId = id;
                isEndedSent = false;
                isPreloadSent = false;
                isFadingOut = false;
                hasSyncedFirstFrame = false;
                currentTvTime = sec;
                sendCommand('loadVideoById', [{ videoId: id, startSeconds: sec }]);
              } else if (sec > 0.25 && Math.abs((currentTvTime || 0) - sec) > 0.35) {
                currentTvTime = sec;
                sendCommand('seekTo', [sec, true]);
              }

              sendCommand('playVideo', []);
              if (currentMuted) {
                sendCommand('mute', []);
                sendCommand('setVolume', [0]);
              } else {
                sendCommand('unMute', []);
                sendCommand('setVolume', [targetVol]);
              }
            }

            function reportBridgeTime(forcePush) {
              try {
                var now = Date.now();
                if (!forcePush && now - lastTimePushAt < 250) return;
                lastTimePushAt = now;
                if (window.AndroidBridge && window.AndroidBridge.onTimeUpdate) {
                  window.AndroidBridge.onTimeUpdate(Number(currentTvTime) || 0, Number(currentTvState));
                }
              } catch(_) {}
            }

            function handleBarrierState(state) {
              if (!isBarrierHolding) return;
              if (state === 1 || state === 2 || state === 5) {
                sendCommand('pauseVideo', []);
                sendCommand('mute', []);
                if (!barrierCuedNotified) {
                  barrierCuedNotified = true;
                  if (window.AndroidBridge && window.AndroidBridge.onVideoCued) {
                    window.AndroidBridge.onVideoCued(currentVideoId);
                  }
                }
              }
            }

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
              var clamped = Math.max(0, Number(sec) || 0);
              lastSyncSeekAt = Date.now();
              currentTvTime = clamped;
              sendCommand('seekTo', [clamped, true]);
            }

            function notifyFirstFramePlaying() {
              if (hasSyncedFirstFrame) return;
              hasSyncedFirstFrame = true;

              // 1. Notify Cabina via WebSocket broadcast so Cabina releases its pre-buffer start hold
              try {
                if (ws && ws.readyState === WebSocket.OPEN && venueSlug) {
                  ws.send(JSON.stringify({
                    topic: "realtime:playback-control:" + venueSlug,
                    event: "broadcast",
                    payload: {
                      type: "broadcast",
                      event: "tv_ready",
                      payload: {
                        videoId: currentVideoId,
                        deviceId: myDeviceId,
                        sentAt: Date.now()
                      }
                    },
                    ref: "tv-ready-" + Date.now()
                  }));
                }
              } catch(_) {}

              // 2. If Cabina is already ahead when TV finishes buffering its first frame, snap immediately!
              try {
                var elapsedSinceMaster = Math.max(0, Math.min(2.5, (Date.now() - latestMasterSentAt) / 1000));
                var expectedSec = desiredPaused ? latestMasterTargetSec : (latestMasterTargetSec + elapsedSinceMaster);
                if (expectedSec > 0.3 && Math.abs(expectedSec - currentTvTime) > 0.35) {
                  seekTo(expectedSec);
                }
              } catch(_) {}
            }

            function setVolume(v) {
              if (!currentMuted) {
                currentVolume = v;
                originalVolume = v;
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

            // Load video cleanly: start at volume 0 and smoothly fade in over 1.5s!
            function loadVideo(id, startSec) {
              if (!id) return;
              var sec = (typeof startSec === 'number' && startSec >= 0) ? startSec : 0;

              // If an authoritative play_now command just locked a new video, reject any
              // stale HTTP poll or background sync trying to load a different (older) video!
              if (localTrackLock.id && Date.now() < localTrackLock.until && id !== localTrackLock.id) {
                return;
              }

              // If already playing/loading this exact video or waiting in barrier, never reload/restart it!
              if (currentVideoId === id) {
                if (!isBarrierHolding && sec > 0) seekTo(sec);
                return;
              }

              isEndedSent = false;
              isPreloadSent = false;
              isFadingOut = false;
              hasSyncedFirstFrame = false;
              currentVideoId = id;
              currentDuration = 0;
              currentTvState = -1;
              lastLoadAt = Date.now();

              // Brief 900ms window to let loadVideoById initialize, then allow first-frame & seek sync
              lastSyncSeekAt = Date.now() + 900;
              currentTvTime = sec;
              latestMasterTargetSec = sec;
              latestMasterSentAt = Date.now();

              // Kill audio of existing video immediately with 0 volume
              sendCommand('pauseVideo', []);
              sendCommand('mute', []);
              sendCommand('setVolume', [0]);

              if (desiredPaused) {
                sendCommand('cueVideoById', [{ videoId: id, startSeconds: sec }]);
              } else {
                sendCommand('loadVideoById', [{ videoId: id, startSeconds: sec }]);
                sendCommand('playVideo', []);
                if (!currentMuted) {
                  sendCommand('unMute', []);
                  // Smooth 5-step fade-in from 0 to originalVolume over 1500ms
                  var targetVol = currentVolume > 0 ? currentVolume : 85;
                  originalVolume = targetVol;
                  var steps = 5;
                  for (var s = 1; s <= steps; s++) {
                    (function(step) {
                      setTimeout(function() {
                        if (!isFadingOut && !currentMuted) {
                          sendCommand('setVolume', [Math.round((targetVol / steps) * step)]);
                        }
                      }, step * 300);
                    })(s);
                  }
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
                  if (typeof data.info.duration === 'number' && data.info.duration > 0) {
                    currentDuration = data.info.duration;
                  }
                  if (typeof data.info.playerState === 'number') {
                    var prevState = currentTvState;
                    currentTvState = data.info.playerState;
                    reportBridgeTime(prevState !== currentTvState);
                    handleBarrierState(currentTvState);
                    if (data.info.playerState === 1 && !desiredPaused && !isBarrierHolding) {
                      notifyFirstFramePlaying();
                    }
                  } else if (typeof data.info.currentTime === 'number') {
                    reportBridgeTime(false);
                  }

                  // Preload next track 10-15s before end & crossfade audio
                  if (currentDuration > 0 && currentTvTime > 0) {
                    var remaining = currentDuration - currentTvTime;

                    // 15 seconds before end: notify AndroidBridge to preload next track
                    if (remaining <= 15 && remaining > 0 && !isPreloadSent) {
                      isPreloadSent = true;
                      if (window.AndroidBridge && window.AndroidBridge.onTrackNearEnd) {
                        window.AndroidBridge.onTrackNearEnd(Math.round(remaining));
                      }
                    }

                    // Last 3.0 seconds: gentle fade out audio down to 0
                    if (remaining <= 3.0 && remaining > 0.3 && !currentMuted && !desiredPaused) {
                      isFadingOut = true;
                      var targetVol = originalVolume > 0 ? originalVolume : 85;
                      var fadeVol = Math.max(0, Math.min(targetVol, Math.round(targetVol * (remaining / 3.0))));
                      sendCommand('setVolume', [fadeVol]);
                    }

                    // Track reached end (within 0.35s): stop immediately and trigger next track so it NEVER loops!
                    if (remaining <= 0.35 && !isEndedSent) {
                      isEndedSent = true;
                      sendCommand('pauseVideo', []);
                      sendCommand('mute', []);
                      if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                        window.AndroidBridge.onStateChange(0);
                      }
                    }
                  }
                }

                if (data.event === 'onStateChange') {
                  currentTvState = data.info;
                  reportBridgeTime(true);
                  handleBarrierState(data.info);
                  if (data.info === 0 && !isEndedSent) { // ENDED
                    isEndedSent = true;
                    if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                      window.AndroidBridge.onStateChange(0);
                    }
                  } else if (data.info === 1) { // PLAYING
                    isEndedSent = false;
                    if (desiredPaused || isBarrierHolding) {
                      sendCommand('pauseVideo', []);
                    } else {
                      notifyFirstFramePlaying();
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
                      reportBridgeTime(true);
                      handleBarrierState(e.data);
                      if (e.data === 0 && !isEndedSent) {
                        isEndedSent = true;
                        if (window.AndroidBridge && window.AndroidBridge.onStateChange) {
                          window.AndroidBridge.onStateChange(0);
                        }
                      } else if (e.data === 1) {
                        isEndedSent = false;
                        if (desiredPaused || isBarrierHolding) {
                          sendCommand('pauseVideo', []);
                        } else {
                          notifyFirstFramePlaying();
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
              if (!venueSlug || !legacyWsEnabled || typeof WebSocket === 'undefined') return;
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

                    // 0. Display Configuration Event from Cabina (Individual per TV or All)
                    if (eventName === "tv_display_config" || (eventName === "playback_command" && eventPayload && eventPayload.command === "set_tv_display")) {
                      var p = eventPayload.payload || eventPayload;
                      var target = p.targetDeviceId || eventPayload.targetDeviceId;
                      var cfg = p.config || p.displayConfig || eventPayload.config;
                      if (cfg) {
                        var devId = myDeviceId;
                        if (!devId && window.AndroidBridge && window.AndroidBridge.getDeviceId) {
                          try { devId = window.AndroidBridge.getDeviceId(); } catch(_) {}
                        }
                        if (!target || target === 'all' || target === devId || !devId) {
                          if (window.AndroidBridge && window.AndroidBridge.onDisplayConfig) {
                            window.AndroidBridge.onDisplayConfig(typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
                          }
                        }
                      }
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
                        var sSeq = Number(p.seekSeq || eventPayload.seekSeq || 0);
                        if (sSeq > 0) lastAppliedSeekSeq = sSeq;
                        latestMasterTargetSec = Math.max(0, sec);
                        latestMasterSentAt = Date.now();
                        seekTo(latestMasterTargetSec);
                      } else if (cmd === 'set_volume') {
                        var vol = Number(p.volume != null ? p.volume : (eventPayload.volume != null ? eventPayload.volume : 85));
                        setVolume(vol);
                        unMute();
                      } else if (cmd === 'set_tv_mute') {
                        var tvM = Boolean(p.tvMuted != null ? p.tvMuted : eventPayload.tvMuted);
                        if (tvM) mute(); else unMute();
                      } else if (cmd === 'mute') {
                        if (p.tvMuted === true || (p.cabinaMuted == null && eventPayload.cabinaMuted == null)) {
                          mute();
                        }
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
                          localTrackLock = { id: trk.youtubeVideoId, until: Date.now() + 10000 };
                          currentTvTime = 0;
                          latestMasterTargetSec = 0;
                          latestMasterSentAt = Date.now();
                          loadVideo(trk.youtubeVideoId, 0);
                        }
                      }
                    } else if (eventName === "tv_playback_progress" && eventPayload) {
                      // 2. Continuous Sync: Keep TV synchronized from start (0:00) and on seeks
                      var curr = eventPayload.currentTime;
                      var isP = eventPayload.isPaused;
                      var sentAt = eventPayload.sentAt;
                      var trk = eventPayload.track;
                      var forceSeek = Boolean(eventPayload.forceSeek);
                      var incomingSeekSeq = typeof eventPayload.seekSeq === 'number' ? eventPayload.seekSeq : 0;
                      var now = Date.now();

                      var latency = 0;
                      if (typeof sentAt === 'number' && sentAt > 0) {
                        latency = Math.max(0, Math.min(1.2, (now - sentAt) / 1000));
                      }

                      if (typeof curr === 'number' && !isNaN(curr)) {
                        latestMasterTargetSec = Math.max(0, curr);
                        latestMasterSentAt = (typeof sentAt === 'number' && sentAt > 0) ? sentAt : now;
                      }

                      // Sync Pause from master Cabina
                      if (typeof isP === 'boolean') {
                        if (isP) {
                          if (!desiredPaused && now > lastSyncSeekAt) pauseVideo();
                        } else {
                          if (desiredPaused) playVideo();
                        }
                      }

                      // Sync Track if changed
                      if (trk && trk.youtubeVideoId && trk.youtubeVideoId !== currentVideoId) {
                        if (localTrackLock.id && now < localTrackLock.until && trk.youtubeVideoId !== localTrackLock.id) {
                          return;
                        }
                        loadVideo(trk.youtubeVideoId, typeof curr === 'number' && curr > 0 ? curr : 0);
                        return;
                      }

                      // Authoritative Immediate Seek (+10s, -10s, scrubber bar, or Restart 0:00)
                      var isNewSeekSeq = incomingSeekSeq > 0 && incomingSeekSeq !== lastAppliedSeekSeq;
                      if ((forceSeek || isNewSeekSeq) && typeof curr === 'number' && !isNaN(curr)) {
                        if (incomingSeekSeq > 0) lastAppliedSeekSeq = incomingSeekSeq;
                        var forcedTarget = (curr <= 0.25) ? 0 : Math.max(0, curr + (isP ? 0 : latency));
                        seekTo(forcedTarget);
                        return;
                      }

                      // Tight Drift Correction: Lock onto master right from 0:00 and throughout the song
                      if (typeof curr === 'number' && !isNaN(curr) && !desiredPaused && now > lastSyncSeekAt) {
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

                        if (tvSec >= 0 && currentTvState === 1) {
                          var targetSec = curr + latency;
                          var drift = Math.abs(tvSec - targetSec);
                          var isEarlyWindow = tvSec < 5.0 || (now - lastLoadAt < 6500);
                          var driftThreshold = isEarlyWindow ? 0.55 : 1.5;
                          var cooldownMs = isEarlyWindow ? 1400 : 3000;

                          if (drift > driftThreshold && (now - lastSyncSeekAt > cooldownMs)) {
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

            function setLegacyWsEnabled(enabled) {
              legacyWsEnabled = Boolean(enabled);
              if (!legacyWsEnabled) {
                clearInterval(hbInterval);
                if (ws) {
                  try { ws.close(); } catch(_) {}
                  ws = null;
                }
              } else if (!ws || ws.readyState === WebSocket.CLOSED) {
                connectRealtimeWs();
              }
            }

            // Start legacy Supabase WS only after a short grace window if LAN/Cloud WS is not active
            setTimeout(function() {
              if (legacyWsEnabled) connectRealtimeWs();
            }, 2500);
          </script>
        </body>
        </html>
    """.trimIndent()
}
