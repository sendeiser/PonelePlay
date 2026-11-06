import { createBrowserSupabase } from "./supabase/browser";
import type { PlayerTrack } from "./player";

export interface PlaybackState {
  ok: boolean;
  venueId?: string;
  isPaused: boolean;
  volume: number;
  isMuted: boolean;
  cabinaMuted?: boolean;
  tvMuted?: boolean;
  audioRouting?: "BOTH" | "CABINA_ONLY" | "TV_ONLY";
  karaokeMode: boolean;
  currentTrack: PlayerTrack | null;
  lastCommand: string | null;
  commandSeq: number;
  positionSeconds?: number;
  startedAtMs?: number;
  alreadyAdvanced?: boolean;
  error?: string;
}

export type PlaybackCommand =
  | "pause"
  | "resume"
  | "toggle_pause"
  | "set_volume"
  | "mute"
  | "unmute"
  | "toggle_mute"
  | "skip"
  | "track_ended"
  | "play_now"
  | "enqueue_top"
  | "reload"
  | "set_karaoke_mode"
  | "seek"
  | "toggle_fullscreen"
  | "set_fullscreen"
  | "toggle_video_mode"
  | "set_video_mode"
  | "set_tv_mute"
  | "set_audio_routing"
  | "set_tv_display";

export async function fetchPlaybackState(slug: string): Promise<PlaybackState> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("get_playback_state" as never, {
    p_venue_slug: slug,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const res = data as PlaybackState;
  if (!res.ok) {
    throw new Error(res.error || "Error al obtener estado del reproductor");
  }

  return res;
}

export async function sendPlaybackCommand(
  slug: string,
  command: PlaybackCommand,
  payload: Record<string, unknown> = {},
): Promise<PlaybackState> {
  const supabase = createBrowserSupabase();
  let res: PlaybackState | null = null;

  // 1. Primary path in browser runtime: Authoritative Server API (/api/playback/command)
  const isTestEnv = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
  if (!isTestEnv && typeof fetch === "function") {
    try {
      const apiRes = await fetch("/api/playback/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, command, payload }),
      });
      if (apiRes.ok) {
        const json = (await apiRes.json()) as PlaybackState;
        if (json?.ok) {
          res = json;
        }
      }
    } catch {
      // Fallback to RPC below
    }
  }

  // 2. Fallback / Unit Test path: Supabase RPC
  if (!res) {
    if (command === "seek" && typeof payload.seconds === "number") {
      try {
        const { data: v } = await supabase
          .from("venues")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (v?.id) {
          const { data: cur } = await supabase
            .from("venue_playback_state")
            .select("current_track")
            .eq("venue_id", v.id)
            .maybeSingle();
          const updatedTrack = {
            ...((cur?.current_track as Record<string, unknown>) || {}),
            positionSeconds: payload.seconds,
            startedAtMs: Date.now(),
          };
          await supabase
            .from("venue_playback_state")
            .update({ current_track: updatedTrack })
            .eq("venue_id", v.id);
        }
      } catch {
        // Non-blocking fallback
      }
    }

    const { data, error } = await supabase.rpc("send_playback_command" as never, {
      p_venue_slug: slug,
      p_command: command,
      p_payload: payload,
    } as never);

    if (error) {
      throw new Error(error.message);
    }

    res = data as PlaybackState;
    if (!res.ok) {
      throw new Error(res.error || "Error al enviar comando al reproductor");
    }
  }

  // 3. Also broadcast via local realtime channel for sub-30ms instant TV reaction
  try {
    const channels = supabase.getChannels();
    const existing = channels.find(
      (c) =>
        c.topic === `realtime:playback-control:${slug}` ||
        c.topic === `playback-control:${slug}`,
    );
    const effectiveCmd =
      (command === "skip" || command === "track_ended") && res.currentTrack
        ? "play_now"
        : command;
    const broadcastPayload = {
      command: effectiveCmd,
      payload: {
        ...payload,
        ...(res.currentTrack ? { track: res.currentTrack } : {}),
        ...(typeof res.positionSeconds === "number" ? { positionSeconds: res.positionSeconds, seconds: res.positionSeconds } : {}),
        ...(typeof res.startedAtMs === "number" ? { startedAtMs: res.startedAtMs } : {}),
        ...(typeof res.cabinaMuted === "boolean" ? { cabinaMuted: res.cabinaMuted } : {}),
        ...(typeof res.tvMuted === "boolean" ? { tvMuted: res.tvMuted } : {}),
        ...(res.audioRouting ? { audioRouting: res.audioRouting } : {}),
      },
      state: res,
      commandSeq: res.commandSeq,
      timestamp: Date.now(),
    };
    if (existing && existing.state === "joined") {
      void existing.send({
        type: "broadcast",
        event: "playback_command",
        payload: broadcastPayload,
      });
    } else {
      const channel = existing ?? supabase.channel(`playback-control:${slug}`);
      if (channel.state === "joined") {
        void channel.send({
          type: "broadcast",
          event: "playback_command",
          payload: broadcastPayload,
        });
      } else {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void channel.send({
              type: "broadcast",
              event: "playback_command",
              payload: broadcastPayload,
            });
          }
        });
      }
    }
  } catch {
    // Non-blocking broadcast fallback
  }

  return res;
}

export async function pausePlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "pause");
}

export async function resumePlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "resume");
}

export async function togglePausePlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "toggle_pause");
}

export async function setPlaybackVolume(
  slug: string,
  volume: number,
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "set_volume", { volume });
}

export async function mutePlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "mute");
}

export async function unmutePlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "unmute");
}

export async function toggleMutePlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "toggle_mute");
}

export async function skipPlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "skip");
}

export async function reloadPlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "reload");
}

export async function setKaraokeMode(
  slug: string,
  enabled: boolean,
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "set_karaoke_mode", { enabled });
}

export async function seekPlayback(
  slug: string,
  seconds: number,
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "seek", { seconds });
}

export async function toggleFullscreenPlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "toggle_fullscreen");
}

export async function setFullscreenPlayback(
  slug: string,
  isFullscreen: boolean,
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "set_fullscreen", { isFullscreen });
}

export async function playTrackNow(
  slug: string,
  track: {
    title: string;
    artist: string;
    youtubeVideoId: string;
    durationSeconds?: number;
    thumbnailUrl?: string | null;
    isKaraoke?: boolean;
  },
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "play_now", {
    track: {
      ...track,
      itemId: `manual-${Date.now()}`,
      source: "youtube",
      voteCount: 0,
    },
  });
}

export async function enqueueTrackTop(
  slug: string,
  track: {
    title: string;
    artist: string;
    youtubeVideoId: string;
    durationSeconds?: number;
    thumbnailUrl?: string | null;
    isKaraoke?: boolean;
  },
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "enqueue_top", {
    track: {
      ...track,
      itemId: `vip-${Date.now()}`,
      source: "youtube",
      voteCount: 5,
    },
  });
}


export async function toggleVideoModePlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "toggle_video_mode");
}

export async function setVideoModePlayback(slug: string, enabled: boolean): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "set_video_mode", { enabled });
}

export async function setAudioRoutingPlayback(
  slug: string,
  routing: "BOTH" | "CABINA_ONLY" | "TV_ONLY",
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "set_audio_routing", { routing });
}

export async function reportTrackEndedPlayback(
  slug: string,
  endedTrackKey: string,
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "track_ended", { endedTrackKey });
}
