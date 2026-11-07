import { createBrowserSupabase } from "./supabase/browser";
import type { PlayerTrack } from "./player";

export interface PlaybackState {
  ok: boolean;
  venueId?: string;
  isPaused: boolean;
  volume: number;
  isMuted: boolean;
  karaokeMode: boolean;
  currentTrack: PlayerTrack | null;
  lastCommand: string | null;
  commandSeq: number;
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
  | "play_now"
  | "enqueue_top"
  | "play_playlist"
  | "enqueue_playlist"
  | "activate_playlist"
  | "reload"
  | "set_karaoke_mode"
  | "seek"
  | "toggle_fullscreen"
  | "set_fullscreen"
  | "toggle_video_mode"
  | "set_video_mode"
  | "set_tv_mute";

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
  const isTestEnv = typeof process !== "undefined" && process.env?.NODE_ENV === "test";

  let res: PlaybackState | null = null;

  // 1. In production browser runtime, use the authoritative server route (/api/playback/command)
  // which atomically persists positionSeconds, anchorTimestampMs, seekSeq, tvMuted, and fallback rotation.
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

  // 2. Fallback to Supabase RPC (also used by unit tests mocking supabase.rpc)
  if (!res) {
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

  // 3. Broadcast via realtime channel for sub-30ms instant TV reaction
  try {
    const channels = typeof supabase.getChannels === "function" ? supabase.getChannels() : [];
    const existing = channels.find(
      (c) =>
        c.topic === `realtime:playback-control:${slug}` ||
        c.topic === `playback-control:${slug}`,
    );
    const msgPayload = {
      command,
      payload,
      state: res,
      timestamp: Date.now(),
    };
    if (existing && existing.state === "joined") {
      void existing.send({
        type: "broadcast",
        event: "playback_command",
        payload: msgPayload,
      });
    } else {
      const channel = existing ?? supabase.channel(`playback-control:${slug}`);
      if (channel.state === "joined") {
        void channel.send({
          type: "broadcast",
          event: "playback_command",
          payload: msgPayload,
        });
      } else {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void channel.send({
              type: "broadcast",
              event: "playback_command",
              payload: msgPayload,
            });
          }
        });
      }
    }
  } catch {
    // Non-blocking broadcast fallback
  }

  // 4. Notify same-tab listeners (e.g. PanelPlaybackFooter & useNightState when triggered from PlaylistManager/CatalogManager)
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("poneleplay:playback-command", {
          detail: { slug, command, payload, state: res },
        }),
      );
      if (
        command === "play_now" ||
        command === "enqueue_top" ||
        command === "play_playlist" ||
        command === "enqueue_playlist" ||
        command === "activate_playlist" ||
        command === "skip"
      ) {
        window.dispatchEvent(
          new CustomEvent("poneleplay:queue-updated", {
            detail: { slug, command },
          }),
        );
      }
    } catch {
      // Non-blocking window event
    }
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
    trackId?: string;
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
    trackId?: string;
    title: string;
    artist: string;
    youtubeVideoId: string;
    durationSeconds?: number;
    thumbnailUrl?: string | null;
    isKaraoke?: boolean;
  },
  options?: { asPlaylistTrack?: boolean },
): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "enqueue_top", {
    asPlaylistTrack: Boolean(options?.asPlaylistTrack),
    track: {
      ...track,
      itemId: `vip-${Date.now()}`,
      source: "youtube",
      voteCount: options?.asPlaylistTrack ? 0 : 5,
    },
  });
}


export async function toggleVideoModePlayback(slug: string): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "toggle_video_mode");
}

export async function setVideoModePlayback(slug: string, enabled: boolean): Promise<PlaybackState> {
  return sendPlaybackCommand(slug, "set_video_mode", { enabled });
}
