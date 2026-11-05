package app.poneleplay.tv.data

import org.json.JSONObject

data class TvVenue(
    val id: String,
    val name: String,
    val slug: String,
    val venueType: String = "bar"
)

data class TvPlayback(
    val isPaused: Boolean,
    val volume: Int,
    val isMuted: Boolean,
    val tvMuted: Boolean = false,
    val karaokeMode: Boolean,
    val lastCommand: String?,
    val commandSeq: Long,
    val positionSeconds: Float = 0f,
    val displayConfigJson: String? = null
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
    val isKaraoke: Boolean = false,
    val guestName: String? = null,
    val dedication: String? = null
)

data class TvProposal(
    val id: String,
    val title: String,
    val artist: String,
    val youtubeVideoId: String?,
    val thumbnailUrl: String?,
    val voteCount: Int,
    val neededVotes: Int,
    val isKaraoke: Boolean = false,
    val guestName: String? = null,
    val dedication: String? = null
)

data class TvDuel(
    val duelId: String,
    val titleA: String,
    val artistA: String,
    val votesA: Int,
    val titleB: String,
    val artistB: String,
    val votesB: Int,
    val durationSeconds: Int = 30
)

data class TvRouletteCandidate(
    val id: String,
    val title: String,
    val artist: String,
    val guestName: String? = null
)

data class TvRoulette(
    val spinId: String,
    val candidates: List<TvRouletteCandidate>,
    val winnerTitle: String,
    val winnerArtist: String,
    val winnerGuestName: String? = null
)

data class TvSkipVote(
    val trackId: String,
    val title: String,
    val votes: Int,
    val threshold: Int
)

data class TvFeed(
    val ok: Boolean,
    val venue: TvVenue,
    val isOpen: Boolean,
    val playback: TvPlayback,
    val nowPlaying: TvTrack?,
    val queue: List<TvTrack>,
    val proposals: List<TvProposal>,
    val activeDuel: TvDuel? = null,
    val activeRoulette: TvRoulette? = null,
    val activeSkipVote: TvSkipVote? = null,
    val clientUrl: String,
    val serverTime: String
)

data class TvPairingInfo(
    val ok: Boolean,
    val code: String,
    val pairUrl: String,
    val expiresInSeconds: Int,
    val error: String? = null
)

data class TvPairingCheck(
    val ok: Boolean,
    val paired: Boolean,
    val slug: String? = null,
    val token: String? = null,
    val deviceId: String? = null,
    val error: String? = null
)

object TvFeedParser {
    private fun optNullableString(obj: JSONObject, key: String): String? {
        if (obj.isNull(key)) return null
        val v = obj.optString(key, "").trim()
        return if (v.isEmpty() || v == "null") null else v
    }

    fun parse(jsonString: String): TvFeed {
        val root = JSONObject(jsonString)
        val venueObj = root.optJSONObject("venue") ?: JSONObject()
        val partyCfgObj = root.optJSONObject("partyConfig")
        val resolvedVenueType = venueObj.optString(
            "venueType",
            partyCfgObj?.optString("venueType", "bar") ?: "bar"
        )
        val venue = TvVenue(
            id = venueObj.optString("id", ""),
            name = venueObj.optString("name", "Salón Principal"),
            slug = venueObj.optString("slug", ""),
            venueType = if (resolvedVenueType == "party") "party" else "bar"
        )

        val playObj = root.optJSONObject("playback") ?: JSONObject()
        val cfgObj = playObj.optJSONObject("displayConfig")
        val tvMutedFlag = if (playObj.has("tvMuted")) {
            playObj.optBoolean("tvMuted", false)
        } else {
            cfgObj?.optBoolean("tvMuted", false) ?: false
        }
        val playback = TvPlayback(
            isPaused = playObj.optBoolean("isPaused", false),
            volume = playObj.optInt("volume", 85),
            isMuted = playObj.optBoolean("isMuted", false),
            tvMuted = tvMutedFlag,
            karaokeMode = playObj.optBoolean("karaokeMode", false),
            lastCommand = if (playObj.isNull("lastCommand")) null else playObj.optString("lastCommand"),
            commandSeq = playObj.optLong("commandSeq", 0L),
            positionSeconds = playObj.optDouble("positionSeconds", 0.0).toFloat(),
            displayConfigJson = cfgObj?.toString()
        )

        val nowObj = root.optJSONObject("nowPlaying")
        val nowPlaying = if (nowObj != null && !nowObj.isNull("title")) {
            TvTrack(
                id = nowObj.optString("id", ""),
                title = nowObj.optString("title", "Sin título"),
                artist = nowObj.optString("artist", "Desconocido"),
                youtubeVideoId = optNullableString(nowObj, "youtubeVideoId"),
                thumbnailUrl = optNullableString(nowObj, "thumbnailUrl"),
                durationSeconds = nowObj.optInt("durationSeconds", 210),
                voteCount = nowObj.optInt("voteCount", 0),
                isKaraoke = nowObj.optBoolean("isKaraoke", false),
                guestName = optNullableString(nowObj, "guestName"),
                dedication = optNullableString(nowObj, "dedication")
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
                        youtubeVideoId = optNullableString(item, "youtubeVideoId"),
                        thumbnailUrl = optNullableString(item, "thumbnailUrl"),
                        durationSeconds = item.optInt("durationSeconds", 210),
                        voteCount = item.optInt("voteCount", 0),
                        position = item.optInt("position", i + 1),
                        isKaraoke = item.optBoolean("isKaraoke", false),
                        guestName = optNullableString(item, "guestName"),
                        dedication = optNullableString(item, "dedication")
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
                        youtubeVideoId = optNullableString(item, "youtubeVideoId"),
                        thumbnailUrl = optNullableString(item, "thumbnailUrl"),
                        voteCount = item.optInt("voteCount", 0),
                        neededVotes = item.optInt("neededVotes", 5),
                        isKaraoke = item.optBoolean("isKaraoke", false),
                        guestName = optNullableString(item, "guestName"),
                        dedication = optNullableString(item, "dedication")
                    )
                )
            }
        }

        // Parse activeDuel
        val duelObj = root.optJSONObject("activeDuel") ?: partyCfgObj?.optJSONObject("activeDuel")
        val activeDuel = if (duelObj != null) {
            val tA = duelObj.optJSONObject("trackA")
            val tB = duelObj.optJSONObject("trackB")
            if (tA != null && tB != null) {
                TvDuel(
                    duelId = duelObj.optString("duelId", ""),
                    titleA = tA.optString("title", ""),
                    artistA = tA.optString("artist", ""),
                    votesA = duelObj.optInt("votesA", 0),
                    titleB = tB.optString("title", ""),
                    artistB = tB.optString("artist", ""),
                    votesB = duelObj.optInt("votesB", 0),
                    durationSeconds = duelObj.optInt("durationSeconds", 30)
                )
            } else null
        } else null

        // Parse activeRoulette
        val roulObj = root.optJSONObject("activeRoulette") ?: partyCfgObj?.optJSONObject("activeRoulette")
        val activeRoulette = if (roulObj != null) {
            val winObj = roulObj.optJSONObject("winner")
            val candArr = roulObj.optJSONArray("candidates")
            val cands = mutableListOf<TvRouletteCandidate>()
            if (candArr != null) {
                for (i in 0 until candArr.length()) {
                    val c = candArr.getJSONObject(i)
                    cands.add(
                        TvRouletteCandidate(
                            id = c.optString("id", ""),
                            title = c.optString("title", ""),
                            artist = c.optString("artist", ""),
                            guestName = optNullableString(c, "guestName")
                        )
                    )
                }
            }
            if (winObj != null) {
                TvRoulette(
                    spinId = roulObj.optString("spinId", ""),
                    candidates = cands,
                    winnerTitle = winObj.optString("title", ""),
                    winnerArtist = winObj.optString("artist", ""),
                    winnerGuestName = optNullableString(winObj, "guestName")
                )
            } else null
        } else null

        // Parse activeSkipVote
        val skipObj = root.optJSONObject("activeSkipVote") ?: partyCfgObj?.optJSONObject("activeSkipVote")
        val activeSkipVote = if (skipObj != null && skipObj.optInt("votes", 0) > 0) {
            TvSkipVote(
                trackId = skipObj.optString("trackId", ""),
                title = skipObj.optString("title", ""),
                votes = skipObj.optInt("votes", 0),
                threshold = skipObj.optInt("threshold", 3)
            )
        } else null

        return TvFeed(
            ok = root.optBoolean("ok", true),
            venue = venue,
            isOpen = root.optBoolean("isOpen", true),
            playback = playback,
            nowPlaying = nowPlaying,
            queue = queueList,
            proposals = proposalList,
            activeDuel = activeDuel,
            activeRoulette = activeRoulette,
            activeSkipVote = activeSkipVote,
            clientUrl = root.optString("clientUrl", "https://poneleplay.netlify.app"),
            serverTime = root.optString("serverTime", "")
        )
    }
}
