package com.poneleplay.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

data class TvRecentRoomUi(val code: String, val name: String, val host: String)
data class TvQueueEntryUi(val title: String, val artist: String, val netScore: Int, val isPinned: Boolean)
data class TvDjRankUi(val rankLabel: String, val displayName: String, val avatar: String, val points: Int)

data class TvRoomUiState(
    val roomId: String = "",
    val code: String = "PLAY42",
    val name: String = "PonelePlay Live",
    val isActive: Boolean = true,
    val audioOnTv: Boolean = true,
    val isPlaying: Boolean = true,
    val nowPlayingTitle: String = "Cargando pista...",
    val nowPlayingArtist: String = "YouTube Music Audio",
    val proposedBy: String = "@host",
    val reactionSummary: String = "🔥0  ❤️0  🕺0",
    val topQueue: List<TvQueueEntryUi> = emptyList(),
    val topDjs: List<TvDjRankUi> = emptyList(),
    val rawPlaybackState: JSONObject = JSONObject(
        """{"is_playing":true,"progress_ms":0,"audio_output":"tv","volume_percent":82,"is_autoplay":false}"""
    )
)

object SupabaseTvRepository {
    private const val BASE_URL = "https://ydoviusjpgmjsxpspexu.supabase.co/rest/v1"
    private const val PUBLISHABLE_KEY = "sb_publishable_BatRAF73v_z6b8SpNIMurw_yp4Or8Ww"
    private const val TV_HOST_ID = "10000000-0000-4000-8000-000000000077"

    private fun request(
        path: String,
        method: String = "GET",
        body: String? = null,
        prefer: String? = null
    ): String {
        val url = URL("$BASE_URL/$path")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 7000
            readTimeout = 7000
            setRequestProperty("apikey", PUBLISHABLE_KEY)
            setRequestProperty("Content-Type", "application/json")
            if (prefer != null) {
                setRequestProperty("Prefer", prefer)
            }
            if (body != null) {
                doOutput = true
            }
        }

        if (body != null) {
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }
        }

        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.let { BufferedReader(InputStreamReader(it)).use { r -> r.readText() } } ?: ""
        conn.disconnect()
        return text
    }

    suspend fun fetchRecentRooms(): List<TvRecentRoomUi> = withContext(Dispatchers.IO) {
        runCatching {
            val res = request("rooms?select=code,name,host:users(display_name)&order=created_at.desc&limit=6")
            val arr = JSONArray(res)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val hostName = obj.optJSONObject("host")?.optString("display_name") ?: "Host"
                    add(
                        TvRecentRoomUi(
                            code = obj.optString("code", "PLAY42"),
                            name = obj.optString("name", "Fiesta en Vivo"),
                            host = hostName
                        )
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    suspend fun fetchRoomState(code: String): TvRoomUiState? = withContext(Dispatchers.IO) {
        runCatching {
            val cleanCode = code.trim().uppercase()
            val roomJson = request("rooms?select=*&code=eq.$cleanCode&limit=1")
            val roomsArr = JSONArray(roomJson)
            if (roomsArr.length() == 0) return@runCatching null

            val r = roomsArr.getJSONObject(0)
            val roomId = r.getString("id")
            val pb = r.optJSONObject("playback_state") ?: JSONObject()
            val audioOnTv = pb.optString("audio_output", "host_device") == "tv"
            val isPlaying = pb.optBoolean("is_playing", true)
            val rc = pb.optJSONObject("reaction_counts") ?: JSONObject()
            val reactionSummary = "🔥${rc.optInt("🔥", 0)}  ❤️${rc.optInt("❤️", 0)}  🕺${rc.optInt("🕺", 0)}"

            val itemsRaw = request(
                "queue_items?select=*,song:songs(title,artist),proposer:users(id,display_name,avatar_emoji)&room_id=eq.$roomId"
            )
            val itemsArr = JSONArray(itemsRaw)

            var playingTitle = "Autoplay · Sin pistas pendientes"
            var playingArtist = "PonelePlay Audio"
            var proposedBy = "@host"
            val pending = mutableListOf<TvQueueEntryUi>()
            val pointsByUser = mutableMapOf<String, Int>()
            val userMeta = mutableMapOf<String, Pair<String, String>>()

            for (i in 0 until itemsArr.length()) {
                val item = itemsArr.getJSONObject(i)
                val status = item.optString("status", "pending")
                val song = item.optJSONObject("song")
                val proposer = item.optJSONObject("proposer")
                val title = song?.optString("title", "Sin título") ?: "Sin título"
                val artist = song?.optString("artist", "Artista") ?: "Artista"
                val pName = proposer?.optString("display_name", "invitado") ?: "invitado"
                val pAvatar = proposer?.optString("avatar_emoji", "🎧") ?: "🎧"
                val pId = proposer?.optString("id", "") ?: item.optString("proposed_by", "")
                val netScore = item.optInt("net_score", 0)
                val isPinned = item.optBoolean("is_pinned", false)

                if (pId.isNotEmpty()) {
                    userMeta[pId] = pName to pAvatar
                    if (status != "blocked" && netScore > 0) {
                        pointsByUser[pId] = (pointsByUser[pId] ?: 0) + netScore
                    }
                }

                when (status) {
                    "playing" -> {
                        playingTitle = title
                        playingArtist = artist
                        proposedBy = "$pAvatar @$pName"
                    }
                    "pending" -> {
                        pending.add(TvQueueEntryUi(title, artist, netScore, isPinned))
                    }
                }
            }

            pending.sortWith(compareByDescending<TvQueueEntryUi> { it.isPinned }.thenByDescending { it.netScore })

            val rankLabels = listOf("1º ORO", "2º PLATA", "3º BRONCE")
            val topDjs = pointsByUser.entries
                .sortedByDescending { it.value }
                .take(3)
                .mapIndexed { idx, (uid, pts) ->
                    val (name, avatar) = userMeta[uid] ?: ("invitado" to "🎧")
                    TvDjRankUi(rankLabels.getOrElse(idx) { "${idx + 1}º" }, "@$name", avatar, pts)
                }

            TvRoomUiState(
                roomId = roomId,
                code = r.optString("code", cleanCode),
                name = r.optString("name", "Fiesta TV"),
                isActive = r.optBoolean("is_active", true),
                audioOnTv = audioOnTv,
                isPlaying = isPlaying,
                nowPlayingTitle = playingTitle,
                nowPlayingArtist = playingArtist,
                proposedBy = proposedBy,
                reactionSummary = reactionSummary,
                topQueue = pending.take(4),
                topDjs = topDjs,
                rawPlaybackState = pb
            )
        }.getOrNull()
    }

    suspend fun createTvRoom(): String? = withContext(Dispatchers.IO) {
        runCatching {
            val hostJson = JSONObject().apply {
                put("p_user_id", TV_HOST_ID)
                put("p_display_name", "SmartTV")
                put("p_avatar_emoji", "📺")
                put("p_is_anonymous", true)
            }
            request("rpc/upsert_party_user", "POST", hostJson.toString())

            val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            val newCode = (1..6).map { chars.random() }.joinToString("")
            val pb = JSONObject().apply {
                put("is_playing", true)
                put("progress_ms", 0)
                put("audio_output", "tv")
                put("volume_percent", 85)
                put("is_autoplay", false)
            }
            val roomBody = JSONObject().apply {
                put("id", UUID.randomUUID().toString())
                put("code", newCode)
                put("name", "Fiesta Smart TV")
                put("host_id", TV_HOST_ID)
                put("is_active", true)
                put("active_provider", "youtube_music")
                put("playback_state", pb)
            }
            request("rooms", "POST", roomBody.toString(), prefer = "return=representation")
            newCode
        }.getOrNull()
    }

    suspend fun updatePlaybackState(
        roomId: String,
        currentPlayback: JSONObject,
        isPlaying: Boolean? = null,
        audioOnTv: Boolean? = null
    ) = withContext(Dispatchers.IO) {
        if (roomId.isBlank()) return@withContext
        runCatching {
            val nextPb = JSONObject(currentPlayback.toString())
            if (isPlaying != null) nextPb.put("is_playing", isPlaying)
            if (audioOnTv != null) nextPb.put("audio_output", if (audioOnTv) "tv" else "host_device")
            val body = JSONObject().apply { put("playback_state", nextPb) }
            request("rooms?id=eq.$roomId", "PATCH", body.toString())
        }
    }

    suspend fun advancePlayback(roomId: String) = withContext(Dispatchers.IO) {
        if (roomId.isBlank()) return@withContext
        runCatching {
            val body = JSONObject().apply { put("p_room_id", roomId) }
            request("rpc/advance_room_playback", "POST", body.toString())
        }
    }

    suspend fun finishParty(roomId: String) = withContext(Dispatchers.IO) {
        if (roomId.isBlank()) return@withContext
        runCatching {
            val body = JSONObject().apply { put("is_active", false) }
            request("rooms?id=eq.$roomId", "PATCH", body.toString())
        }
    }
}
