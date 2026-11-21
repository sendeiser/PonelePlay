package com.poneleplay.tv

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.poneleplay.tv.data.SupabaseTvRepository
import com.poneleplay.tv.data.TvRecentRoomUi
import com.poneleplay.tv.data.TvRoomUiState
import com.poneleplay.tv.ui.screens.TvHomeScreen
import com.poneleplay.tv.ui.screens.TvRoomScreen
import com.poneleplay.tv.ui.screens.TvSummaryScreen
import com.poneleplay.tv.ui.theme.PonelePlayTvTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class TvRoute { HOME, ROOM, SUMMARY }

class MainActivity : ComponentActivity() {
    private var mediaActionHandler: ((Int) -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PonelePlayTvTheme {
                val scope = rememberCoroutineScope()
                var currentRoute by remember { mutableStateOf(TvRoute.HOME) }
                var activeCode by remember { mutableStateOf("PLAY42") }
                var recentRooms by remember { mutableStateOf<List<TvRecentRoomUi>>(emptyList()) }
                var roomState by remember { mutableStateOf(TvRoomUiState(code = activeCode)) }

                LaunchedEffect(Unit) {
                    recentRooms = SupabaseTvRepository.fetchRecentRooms()
                }

                LaunchedEffect(currentRoute, activeCode) {
                    while (currentRoute == TvRoute.ROOM || currentRoute == TvRoute.SUMMARY) {
                        val loaded = SupabaseTvRepository.fetchRoomState(activeCode)
                        if (loaded != null) {
                            roomState = loaded
                            if (!loaded.isActive && currentRoute == TvRoute.ROOM) {
                                currentRoute = TvRoute.SUMMARY
                            }
                        }
                        delay(3000)
                    }
                }

                mediaActionHandler = { keyCode ->
                    scope.launch {
                        when (keyCode) {
                            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                                val nextPlaying = !roomState.isPlaying
                                roomState = roomState.copy(isPlaying = nextPlaying)
                                SupabaseTvRepository.updatePlaybackState(
                                    roomState.roomId,
                                    roomState.rawPlaybackState,
                                    isPlaying = nextPlaying
                                )
                            }
                            KeyEvent.KEYCODE_MEDIA_NEXT -> {
                                SupabaseTvRepository.advancePlayback(roomState.roomId)
                                SupabaseTvRepository.fetchRoomState(activeCode)?.let { roomState = it }
                            }
                        }
                    }
                }

                when (currentRoute) {
                    TvRoute.HOME -> TvHomeScreen(
                        initialCode = activeCode,
                        recentRooms = recentRooms,
                        onConnectRoom = { code ->
                            activeCode = code.trim().uppercase()
                            currentRoute = TvRoute.ROOM
                        },
                        onCreateTvRoom = {
                            scope.launch {
                                val created = SupabaseTvRepository.createTvRoom()
                                if (created != null) {
                                    activeCode = created
                                    recentRooms = SupabaseTvRepository.fetchRecentRooms()
                                    currentRoute = TvRoute.ROOM
                                }
                            }
                        }
                    )
                    TvRoute.ROOM -> TvRoomScreen(
                        state = roomState,
                        onTogglePlayPause = {
                            val nextPlaying = !roomState.isPlaying
                            roomState = roomState.copy(isPlaying = nextPlaying)
                            scope.launch {
                                SupabaseTvRepository.updatePlaybackState(
                                    roomState.roomId,
                                    roomState.rawPlaybackState,
                                    isPlaying = nextPlaying
                                )
                            }
                        },
                        onSkipTrack = {
                            scope.launch {
                                SupabaseTvRepository.advancePlayback(roomState.roomId)
                                SupabaseTvRepository.fetchRoomState(activeCode)?.let { roomState = it }
                            }
                        },
                        onToggleAudioMode = {
                            val nextAudioTv = !roomState.audioOnTv
                            roomState = roomState.copy(audioOnTv = nextAudioTv)
                            scope.launch {
                                SupabaseTvRepository.updatePlaybackState(
                                    roomState.roomId,
                                    roomState.rawPlaybackState,
                                    audioOnTv = nextAudioTv
                                )
                            }
                        },
                        onFinishParty = {
                            scope.launch {
                                SupabaseTvRepository.finishParty(roomState.roomId)
                                currentRoute = TvRoute.SUMMARY
                            }
                        },
                        onDisconnect = { currentRoute = TvRoute.HOME }
                    )
                    TvRoute.SUMMARY -> TvSummaryScreen(
                        roomCode = activeCode,
                        topDjs = roomState.topDjs,
                        onBackHome = { currentRoute = TvRoute.HOME }
                    )
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_MEDIA_NEXT) {
            mediaActionHandler?.invoke(keyCode)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
