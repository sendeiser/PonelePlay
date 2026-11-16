package com.poneleplay.tv

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.poneleplay.tv.ui.screens.TvHomeScreen
import com.poneleplay.tv.ui.screens.TvRoomScreen
import com.poneleplay.tv.ui.screens.TvSummaryScreen
import com.poneleplay.tv.ui.theme.PonelePlayTvTheme

enum class TvRoute { HOME, ROOM, SUMMARY }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PonelePlayTvTheme {
                var currentRoute by remember { mutableStateOf(TvRoute.HOME) }
                var activeCode by remember { mutableStateOf("PLAY42") }
                var audioOnTv by remember { mutableStateOf(true) }

                when (currentRoute) {
                    TvRoute.HOME -> TvHomeScreen(
                        initialCode = activeCode,
                        onConnectRoom = { code ->
                            activeCode = code
                            currentRoute = TvRoute.ROOM
                        },
                        onCreateTvRoom = {
                            activeCode = "PLAY42"
                            audioOnTv = true
                            currentRoute = TvRoute.ROOM
                        }
                    )
                    TvRoute.ROOM -> TvRoomScreen(
                        roomCode = activeCode,
                        audioOnTv = audioOnTv,
                        onToggleAudioMode = { audioOnTv = !audioOnTv },
                        onFinishParty = { currentRoute = TvRoute.SUMMARY },
                        onDisconnect = { currentRoute = TvRoute.HOME }
                    )
                    TvRoute.SUMMARY -> TvSummaryScreen(
                        roomCode = activeCode,
                        onBackHome = { currentRoute = TvRoute.HOME }
                    )
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_MEDIA_NEXT -> super.onKeyDown(keyCode, event)
            else -> super.onKeyDown(keyCode, event)
        }
    }
}
