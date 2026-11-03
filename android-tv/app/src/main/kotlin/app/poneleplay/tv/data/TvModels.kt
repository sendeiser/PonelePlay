package app.poneleplay.tv.data

import org.json.JSONObject

data class TvVenue(
    val id: String,
    val name: String,
    val slug: String
)

data class TvPlayback(
    val isPaused: Boolean,
    val volume: Int,
    val isMuted: Boolean,
    val karaokeMode: Boolean,
    val lastCommand: String?,
    val commandSeq: Long
)

data class TvTrack(
    val id: String,
    val title: String,
    val artist: String,
    val youtubeVideoId: String?,
    val thumbnailUrl: String?,
    val durationSeconds: Int,
    val voteCount: Int,
    val position: Int? = null,
    val isKaraoke: Boolean = false
)

data class TvProposal(
    val id: String,
    val title: String,
    val artist: String,
    val youtubeVideoId: String?,
    val thumbnailUrl: String?,
    val voteCount: Int,
    val neededVotes: Int
)

data class TvFeed(
    val ok: Boolean,
    val venue: TvVenue,
    val isOpen: Boolean,
    val playback: TvPlayback,
    val nowPlaying: TvTrack?,
    val queue: List<TvTrack>,
    val proposals: List<TvProposal>,
    val clientUrl: String,
    val serverTime: String
)

object TvFeedParser {
    fun parse(jsonString: String): TvFeed {
        val root = JSONObject(jsonString)
        val venueObj = root.optJSONObject("venue") ?: JSONObject()
        val venue = TvVenue(
            id = venueObj.optString("id", ""),
            name = venueObj.optString("name", "Salón Principal"),
            slug = venueObj.optString("slug", "billar-aurora")
        )

        val playObj = root.optJSONObject("playback") ?: JSONObject()
        val playback = TvPlayback(
            isPaused = playObj.optBoolean("isPaused", false),
            volume = playObj.optInt("volume", 85),
            isMuted = playObj.optBoolean("isMuted", false),
            karaokeMode = playObj.optBoolean("karaokeMode", false),
            lastCommand = playObj.optString("lastCommand", null),
            commandSeq = playObj.optLong("commandSeq", 0L)
        )

        val nowObj = root.optJSONObject("nowPlaying")
        val nowPlaying = if (nowObj != null && !nowObj.isNull("title")) {
            TvTrack(
                id = nowObj.optString("id", ""),
                title = nowObj.optString("title", "Sin título"),
                artist = nowObj.optString("artist", "Desconocido"),
                youtubeVideoId = if (nowObj.isNull("youtubeVideoId")) null else nowObj.optString("youtubeVideoId"),
                thumbnailUrl = if (nowObj.isNull("thumbnailUrl")) null else nowObj.optString("thumbnailUrl"),
                durationSeconds = nowObj.optInt("durationSeconds", 210),
                voteCount = nowObj.optInt("voteCount", 0),
                isKaraoke = nowObj.optBoolean("isKaraoke", false)
            )
        } else {
            null
        }

        val queueList = mutableListOf<TvTrack>()
        val queueArr = root.optJSONArray("queue")
        if (queueArr != null) {
            for (i in 0 until queueArr.length()) {
                val item = queueArr.getJSONObject(i)
                queueList.add(
                    TvTrack(
                        id = item.optString("id", ""),
                        title = item.optString("title", ""),
                        artist = item.optString("artist", ""),
                        youtubeVideoId = if (item.isNull("youtubeVideoId")) null else item.optString("youtubeVideoId"),
                        thumbnailUrl = if (item.isNull("thumbnailUrl")) null else item.optString("thumbnailUrl"),
                        durationSeconds = item.optInt("durationSeconds", 210),
                        voteCount = item.optInt("voteCount", 0),
                        position = item.optInt("position", i + 1)
                    )
                )
            }
        }

        val proposalList = mutableListOf<TvProposal>()
        val propArr = root.optJSONArray("proposals")
        if (propArr != null) {
            for (i in 0 until propArr.length()) {
                val item = propArr.getJSONObject(i)
                proposalList.add(
                    TvProposal(
                        id = item.optString("id", ""),
                        title = item.optString("title", ""),
                        artist = item.optString("artist", ""),
                        youtubeVideoId = if (item.isNull("youtubeVideoId")) null else item.optString("youtubeVideoId"),
                        thumbnailUrl = if (item.isNull("thumbnailUrl")) null else item.optString("thumbnailUrl"),
                        voteCount = item.optInt("voteCount", 0),
                        neededVotes = item.optInt("neededVotes", 5)
                    )
                )
            }
        }

        return TvFeed(
            ok = root.optBoolean("ok", true),
            venue = venue,
            isOpen = root.optBoolean("isOpen", true),
            playback = playback,
            nowPlaying = nowPlaying,
            queue = queueList,
            proposals = proposalList,
            clientUrl = root.optString("clientUrl", "https://poneleplay.netlify.app"),
            serverTime = root.optString("serverTime", "")
        )
    }
}
