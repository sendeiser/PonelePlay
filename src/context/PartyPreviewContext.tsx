import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Database } from '../types/database.types';
import {
  INITIAL_BLOCKED_SONG_IDS,
  INITIAL_NOW_PLAYING,
  INITIAL_PARTICIPANTS,
  INITIAL_PLAYED,
  INITIAL_QUEUE,
  INITIAL_ROOM,
  RECENT_ROOMS_MOCK,
  SEARCH_CATALOG_MOCK,
} from '../data/mockPartyData';
import {
  ensurePartyUser,
  getOrCreateLocalUserId,
  getSavedPartyProfile,
  supabase,
} from '../lib/supabase';
import {
  AudioOutput,
  AudioProvider,
  FloatingReaction,
  JoinEdgeState,
  Participant,
  QueueItem,
  QueueStatus,
  ReactionEmoji,
  RecentRoom,
  RoomSettings,
  Song,
  UserRole,
  VoteValue,
} from '../types/jukebox';

type ThemeMode = 'dark' | 'light';

interface CreateRoomInput {
  name: string;
  activeProvider: AudioProvider;
  maxPendingPerUser: number;
  cooldownSeconds: number;
  fallbackGenre: string;
}

interface PartyPreviewContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  demoRole: UserRole;
  setDemoRole: (role: UserRole) => void;
  queueEmptyPreview: boolean;
  setQueueEmptyPreview: (empty: boolean) => void;
  room: RoomSettings;
  recentRooms: RecentRoom[];
  currentUserId: string;
  updateRoom: (patch: Partial<RoomSettings>) => void;
  createRoom: (input: CreateRoomInput) => Promise<string>;
  joinRoom: (code: string, nickname: string, avatar: string) => Promise<JoinEdgeState>;
  loadRoomByCode: (code: string) => Promise<JoinEdgeState>;
  searchCatalog: (query: string) => Promise<Song[]>;
  nowPlaying: QueueItem | null;
  queue: QueueItem[];
  played: QueueItem[];
  participants: Participant[];
  blockedSongIds: string[];
  floatingReactions: FloatingReaction[];
  reactionCounts: Record<ReactionEmoji, number>;
  cooldownRemaining: number;
  pwaInstallReady: boolean;
  triggerPwaInstall: () => void;
  voteItem: (itemId: string, direction: 1 | -1) => void;
  togglePinItem: (itemId: string) => void;
  playNowItem: (itemId: string) => void;
  blockItem: (itemId: string) => void;
  skipCurrentTrack: () => void;
  proposeSong: (song: Song) => 'proposed' | 'upvoted_existing' | 'already_playing' | 'blocked' | 'limit';
  sendReaction: (emoji: ReactionEmoji) => void;
  toggleBanParticipant: (participantId: string) => void;
}

const PartyPreviewContext = createContext<PartyPreviewContextValue | null>(null);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PLAY42_UUID = '30000000-0000-4000-8000-000000000042';
const DEFAULT_HOST_UUID = '10000000-0000-4000-8000-000000000001';

function isUuid(val: string | null | undefined): val is string {
  return Boolean(val && UUID_REGEX.test(val));
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function extractYoutubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '').split('/')[0] || null;
    }
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v');
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function extractSpotifyTrackId(raw: string): string | null {
  const m = raw.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

function sortQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (b.netScore !== a.netScore) return b.netScore - a.netScore;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function parseVoteValue(v: number | undefined): VoteValue {
  if (v === 1) return 1;
  if (v === -1) return -1;
  return 0;
}

export const PartyPreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [demoRole, setDemoRole] = useState<UserRole>('host');
  const [queueEmptyPreview, setQueueEmptyPreview] = useState(false);
  const [room, setRoom] = useState<RoomSettings>({ ...INITIAL_ROOM, id: DEFAULT_PLAY42_UUID });
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>(RECENT_ROOMS_MOCK);
  const [currentUserId, setCurrentUserId] = useState<string>(() => getOrCreateLocalUserId());
  const [nowPlaying, setNowPlaying] = useState<QueueItem | null>(INITIAL_NOW_PLAYING);
  const [queue, setQueue] = useState<QueueItem[]>(() => sortQueue(INITIAL_QUEUE));
  const [played, setPlayed] = useState<QueueItem[]>(INITIAL_PLAYED);
  const [participants, setParticipants] = useState<Participant[]>(INITIAL_PARTICIPANTS);
  const [blockedSongIds, setBlockedSongIds] = useState<string[]>(INITIAL_BLOCKED_SONG_IDS);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([
    { id: 'r-init-1', emoji: '🔥', senderName: 'gonza', xPercent: 22 },
    { id: 'r-init-2', emoji: '🕺', senderName: 'martina', xPercent: 68 },
  ]);
  const [reactionCounts, setReactionCounts] = useState<Record<ReactionEmoji, number>>({
    '🔥': 14,
    '❤️': 9,
    '🕺': 6,
    '👎': 2,
  });
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  const clientTabIdRef = useRef<string>(Math.random().toString(36).slice(2, 10));
  const activeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const loadedRoomIdRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const t = window.setTimeout(() => setCooldownRemaining((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldownRemaining]);

  useEffect(() => {
    let active = true;
    void ensurePartyUser().then((u) => {
      if (active) setCurrentUserId(u.id);
    });
    return () => {
      active = false;
    };
  }, []);

  const hydrateRoomStateFromDb = useCallback(
    async (roomId: string, uid: string): Promise<JoinEdgeState> => {
      const { data: roomRow, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (roomErr || !roomRow) return 'not_found';

      const [itemsRes, participantsRes, votesRes, hostRes] = await Promise.all([
        supabase
          .from('queue_items')
          .select('*, song:songs(*), proposer:users(*)')
          .eq('room_id', roomId),
        supabase
          .from('room_participants')
          .select('*, user:users(*)')
          .eq('room_id', roomId),
        supabase
          .from('votes')
          .select('queue_item_id, vote_type')
          .eq('room_id', roomId)
          .eq('user_id', uid),
        supabase
          .from('users')
          .select('display_name')
          .eq('id', roomRow.host_id)
          .maybeSingle(),
      ]);

      const voteMap = new Map<string, VoteValue>();
      for (const v of votesRes.data ?? []) {
        voteMap.set(v.queue_item_id, parseVoteValue(v.vote_type));
      }

      const mappedItems: QueueItem[] = (itemsRes.data ?? []).map((row) => {
        const songData = row.song;
        const proposerData = row.proposer;
        return {
          id: row.id,
          roomId: row.room_id,
          song: {
            id: songData?.id ?? row.song_id,
            spotifyTrackId: songData?.spotify_track_id ?? null,
            youtubeVideoId: songData?.youtube_video_id ?? null,
            title: songData?.title ?? 'Pista sin título',
            artist: songData?.artist ?? 'Artista',
            album: songData?.album ?? '',
            durationMs: songData?.duration_ms ?? 190_000,
            imageUrl: songData?.image_url ?? '/covers/cover-synthwave.png',
            cached: true,
          },
          proposedById: row.proposed_by,
          proposedByName: proposerData?.display_name ?? 'invitado',
          proposedByAvatar: proposerData?.avatar_emoji ?? '🎧',
          upvotesCount: row.upvotes_count,
          downvotesCount: row.downvotes_count,
          netScore: row.net_score ?? row.upvotes_count - row.downvotes_count,
          userVote: voteMap.get(row.id) ?? 0,
          isPinned: row.is_pinned,
          status: row.status as QueueStatus,
          createdAt: row.created_at,
          playedAt: row.played_at ?? undefined,
        };
      });

      const playingItem = mappedItems.find((i) => i.status === 'playing') ?? null;
      const pendingItems = sortQueue(mappedItems.filter((i) => i.status === 'pending'));
      const playedItems = mappedItems
        .filter((i) => i.status === 'played')
        .sort((a, b) => new Date(b.playedAt ?? b.createdAt).getTime() - new Date(a.playedAt ?? a.createdAt).getTime());
      const blockedIds = mappedItems
        .filter((i) => i.status === 'blocked')
        .flatMap((i) => [i.song.id, i.song.spotifyTrackId, i.song.youtubeVideoId].filter(Boolean) as string[]);

      const mappedParticipants: Participant[] = (participantsRes.data ?? []).map((p) => {
        const u = p.user;
        const userPoints = mappedItems
          .filter((i) => i.proposedById === p.user_id && i.status !== 'blocked')
          .reduce((acc, i) => acc + Math.max(0, i.netScore), 0);
        const pendingCount = pendingItems.filter((i) => i.proposedById === p.user_id).length;
        return {
          id: p.user_id,
          displayName: u?.display_name ?? 'invitado',
          avatarEmoji: u?.avatar_emoji ?? '🎧',
          role: (p.role as UserRole) || 'guest',
          isBanned: p.is_banned,
          djPoints: userPoints,
          pendingCount,
          isLinkedAccount: u ? !u.is_anonymous : false,
        };
      });

      const pb = (roomRow.playback_state ?? {}) as Record<string, unknown>;
      const audioOutput: AudioOutput = pb.audio_output === 'tv' ? 'tv' : 'host_device';

      setRoom({
        id: roomRow.id,
        code: roomRow.code,
        name: roomRow.name,
        hostName: hostRes.data?.display_name ?? 'Host',
        isActive: roomRow.is_active,
        activeProvider: (roomRow.active_provider as AudioProvider) || 'youtube_music',
        audioOutput,
        maxPendingPerUser: roomRow.max_pending_per_user,
        cooldownSeconds: roomRow.cooldown_seconds,
        fallbackGenre: roomRow.fallback_genre,
        isPlaying: typeof pb.is_playing === 'boolean' ? pb.is_playing : true,
        progressMs: typeof pb.progress_ms === 'number' ? pb.progress_ms : 0,
        volumePercent: typeof pb.volume_percent === 'number' ? pb.volume_percent : 82,
        wakeLockActive: Boolean(pb.is_playing ?? true),
        spotifyConnected: false,
      });

      setNowPlaying(playingItem);
      setQueue(pendingItems);
      setPlayed(playedItems);
      setBlockedSongIds(blockedIds);
      if (mappedParticipants.length > 0) {
        setParticipants(mappedParticipants);
      }

      const selfParticipant = mappedParticipants.find((p) => p.id === uid);
      if (selfParticipant?.isBanned) return 'banned';
      return roomRow.is_active ? 'active' : 'ended';
    },
    []
  );

  const subscribeToRoomChannel = useCallback(
    (roomId: string, uid: string) => {
      if (loadedRoomIdRef.current === roomId && activeChannelRef.current) {
        return;
      }

      if (activeChannelRef.current) {
        void supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }

      loadedRoomIdRef.current = roomId;

      const scheduleRefresh = () => {
        if (refreshTimerRef.current) {
          window.clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = window.setTimeout(() => {
          void hydrateRoomStateFromDb(roomId, uid);
        }, 120);
      };

      const channel = supabase
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          scheduleRefresh
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` },
          scheduleRefresh
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` },
          scheduleRefresh
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${roomId}` },
          scheduleRefresh
        )
        .on('broadcast', { event: 'reaction' }, ({ payload }) => {
          const data = payload as { emoji?: ReactionEmoji; senderName?: string; clientId?: string } | null;
          if (!data?.emoji || data.clientId === clientTabIdRef.current) return;
          const emoji = data.emoji;
          setReactionCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }));
          const id = `react-rt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const xPercent = 18 + Math.floor(Math.random() * 64);
          setFloatingReactions((prev) => [
            ...prev.slice(-8),
            { id, emoji, senderName: data.senderName || 'invitado', xPercent },
          ]);
          window.setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
          }, 2300);
        })
        .subscribe();

      activeChannelRef.current = channel;
    },
    [hydrateRoomStateFromDb]
  );

  useEffect(() => {
    return () => {
      if (activeChannelRef.current) {
        void supabase.removeChannel(activeChannelRef.current);
      }
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const loadRoomByCode = useCallback(
    async (rawCode: string): Promise<JoinEdgeState> => {
      const cleanCode = rawCode.trim().toUpperCase();
      if (!cleanCode) return 'not_found';

      const uid = currentUserId || getOrCreateLocalUserId();
      try {
        const { data: roomRow } = await supabase
          .from('rooms')
          .select('id, code, is_active')
          .eq('code', cleanCode)
          .maybeSingle();

        if (!roomRow) {
          return 'not_found';
        }

        const state = await hydrateRoomStateFromDb(roomRow.id, uid);
        subscribeToRoomChannel(roomRow.id, uid);
        return state;
      } catch {
        return cleanCode === 'PLAY42' ? 'active' : 'not_found';
      }
    },
    [currentUserId, hydrateRoomStateFromDb, subscribeToRoomChannel]
  );

  const createRoom = useCallback(
    async (input: CreateRoomInput): Promise<string> => {
      const cleanName = input.name.trim();
      const newCode = generateRoomCode();
      const hostProfile = await ensurePartyUser(getSavedPartyProfile().displayName || 'Tincho', '👑');
      setCurrentUserId(hostProfile.id);

      const initialPlayback = {
        is_playing: true,
        progress_ms: 0,
        audio_output: 'host_device' as AudioOutput,
        volume_percent: 82,
        is_autoplay: false,
        autoplay_track: null,
      };

      let createdRoomId = DEFAULT_PLAY42_UUID;
      try {
        const { data: insertedRoom, error: roomError } = await supabase
          .from('rooms')
          .insert({
            code: newCode,
            name: cleanName,
            host_id: hostProfile.id,
            is_active: true,
            active_provider: input.activeProvider,
            max_pending_per_user: input.maxPendingPerUser,
            cooldown_seconds: input.cooldownSeconds,
            fallback_genre: input.fallbackGenre,
            playback_state: initialPlayback,
          })
          .select()
          .single();

        if (roomError || !insertedRoom) {
          throw roomError ?? new Error('Room insert failed');
        }

        createdRoomId = insertedRoom.id;

        await supabase.from('room_participants').upsert(
          {
            room_id: createdRoomId,
            user_id: hostProfile.id,
            role: 'host',
            is_banned: false,
          },
          { onConflict: 'room_id,user_id' }
        );

        const defaultTrack = INITIAL_NOW_PLAYING.song;
        const { data: songRow } = await supabase
          .from('songs')
          .select('id')
          .eq('spotify_track_id', defaultTrack.spotifyTrackId ?? 'sp_neon_pulse')
          .maybeSingle();

        if (songRow?.id) {
          const { data: playingRow } = await supabase
            .from('queue_items')
            .insert({
              room_id: createdRoomId,
              song_id: songRow.id,
              proposed_by: hostProfile.id,
              upvotes_count: 1,
              downvotes_count: 0,
              status: 'playing',
            })
            .select()
            .single();

          if (playingRow?.id) {
            await supabase
              .from('rooms')
              .update({ current_queue_item_id: playingRow.id })
              .eq('id', createdRoomId);
          }
        }

        await hydrateRoomStateFromDb(createdRoomId, hostProfile.id);
        subscribeToRoomChannel(createdRoomId, hostProfile.id);
      } catch {
        setRoom({
          id: createdRoomId,
          code: newCode,
          name: cleanName,
          hostName: hostProfile.displayName,
          isActive: true,
          activeProvider: input.activeProvider,
          audioOutput: 'host_device',
          maxPendingPerUser: input.maxPendingPerUser,
          cooldownSeconds: input.cooldownSeconds,
          fallbackGenre: input.fallbackGenre,
          isPlaying: true,
          progressMs: 0,
          volumePercent: 82,
          wakeLockActive: true,
          spotifyConnected: false,
        });
      }

      setDemoRole('host');
      setRecentRooms((prev) => [
        {
          code: newCode,
          name: cleanName,
          hostName: hostProfile.displayName,
          isActive: true,
          provider: input.activeProvider,
          participantsCount: 1,
          songsPlayed: 0,
        },
        ...prev.filter((r) => r.code !== newCode),
      ]);

      return newCode;
    },
    [hydrateRoomStateFromDb, subscribeToRoomChannel]
  );

  const joinRoom = useCallback(
    async (rawCode: string, nickname: string, avatar: string): Promise<JoinEdgeState> => {
      const cleanCode = rawCode.trim().toUpperCase();
      const user = await ensurePartyUser(nickname, avatar);
      setCurrentUserId(user.id);

      const { data: roomRow } = await supabase
        .from('rooms')
        .select('id, is_active')
        .eq('code', cleanCode)
        .maybeSingle();

      if (!roomRow) {
        if (cleanCode === 'PLAY42') {
          setDemoRole('guest');
          return 'active';
        }
        return 'not_found';
      }

      if (!roomRow.is_active) {
        return 'ended';
      }

      const { data: existingParticipant } = await supabase
        .from('room_participants')
        .select('id, role, is_banned')
        .eq('room_id', roomRow.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingParticipant?.is_banned) {
        return 'banned';
      }

      if (!existingParticipant) {
        await supabase.from('room_participants').insert({
          room_id: roomRow.id,
          user_id: user.id,
          role: 'guest',
          is_banned: false,
        });
      }

      setDemoRole('guest');
      const status = await hydrateRoomStateFromDb(roomRow.id, user.id);
      subscribeToRoomChannel(roomRow.id, user.id);
      return status;
    },
    [hydrateRoomStateFromDb, subscribeToRoomChannel]
  );

  const searchCatalog = useCallback(async (rawQuery: string): Promise<Song[]> => {
    const query = rawQuery.trim();
    const ytId = extractYoutubeId(query);
    if (ytId) {
      let title = `Pista YouTube (${ytId})`;
      let artist = 'YouTube Music Audio';
      let imageUrl = '/covers/cover-synthwave.png';
      try {
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
          if (data.title) title = data.title;
          if (data.author_name) artist = data.author_name;
          if (data.thumbnail_url) imageUrl = data.thumbnail_url;
        }
      } catch {
        // use clean fallback
      }

      const resolved: Song = {
        id: `yt-${ytId}`,
        spotifyTrackId: null,
        youtubeVideoId: ytId,
        title,
        artist,
        album: 'YouTube Music',
        durationMs: 202_000,
        imageUrl,
        cached: true,
      };

      const { data: savedRow } = await supabase
        .from('songs')
        .upsert(
          {
            youtube_video_id: ytId,
            title,
            artist,
            album: 'YouTube Music',
            duration_ms: 202_000,
            image_url: imageUrl,
          },
          { onConflict: 'youtube_video_id' }
        )
        .select('id')
        .maybeSingle();

      if (savedRow?.id) resolved.id = savedRow.id;
      return [resolved];
    }

    const spId = extractSpotifyTrackId(query);
    if (spId) {
      let title = `Track Spotify (${spId})`;
      let artist = 'Spotify Track';
      let imageUrl = '/covers/cover-urban.jpg';
      try {
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
          if (data.title) title = data.title;
          if (data.author_name) artist = data.author_name;
          if (data.thumbnail_url) imageUrl = data.thumbnail_url;
        }
      } catch {
        // use clean fallback
      }

      const resolved: Song = {
        id: `sp-${spId}`,
        spotifyTrackId: spId,
        youtubeVideoId: `yt_${spId}`,
        title,
        artist,
        album: 'Spotify',
        durationMs: 205_000,
        imageUrl,
        cached: true,
      };

      const { data: savedRow } = await supabase
        .from('songs')
        .upsert(
          {
            spotify_track_id: spId,
            youtube_video_id: `yt_${spId}`,
            title,
            artist,
            album: 'Spotify',
            duration_ms: 205_000,
            image_url: imageUrl,
          },
          { onConflict: 'spotify_track_id' }
        )
        .select('id')
        .maybeSingle();

      if (savedRow?.id) resolved.id = savedRow.id;
      return [resolved];
    }

    let dbSongs: Song[] = [];
    try {
      const builder = supabase
        .from('songs')
        .select('id, spotify_track_id, youtube_video_id, title, artist, album, duration_ms, image_url')
        .limit(20);
      const { data } = query
        ? await builder.or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
        : await builder;

      dbSongs = (data ?? []).map((r) => ({
        id: r.id,
        spotifyTrackId: r.spotify_track_id,
        youtubeVideoId: r.youtube_video_id,
        title: r.title,
        artist: r.artist,
        album: r.album ?? '',
        durationMs: r.duration_ms,
        imageUrl: r.image_url,
        cached: true,
      }));
    } catch {
      dbSongs = [];
    }

    const qLower = query.toLowerCase();
    const localFiltered = SEARCH_CATALOG_MOCK.filter((song) => {
      if (!qLower) return true;
      return song.title.toLowerCase().includes(qLower) || song.artist.toLowerCase().includes(qLower);
    });

    const seenKeys = new Set<string>();
    const combined: Song[] = [];
    for (const s of [...dbSongs, ...localFiltered]) {
      const key = s.spotifyTrackId || s.youtubeVideoId || s.title.toLowerCase();
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      combined.push(s);
    }
    return combined;
  }, []);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const updateRoom = (patch: Partial<RoomSettings>) => {
    setRoom((prev) => {
      const next = { ...prev, ...patch };
      if (isUuid(next.id)) {
        const dbPatch: Database['public']['Tables']['rooms']['Update'] = {
          playback_state: {
            is_playing: next.isPlaying,
            progress_ms: next.progressMs,
            audio_output: next.audioOutput,
            volume_percent: next.volumePercent,
            is_autoplay: queue.length === 0,
            autoplay_track: null,
          },
        };
        if (patch.name !== undefined) dbPatch.name = next.name;
        if (patch.isActive !== undefined) {
          dbPatch.is_active = next.isActive;
          if (!next.isActive) dbPatch.ended_at = new Date().toISOString();
        }
        if (patch.activeProvider !== undefined) dbPatch.active_provider = next.activeProvider;
        if (patch.maxPendingPerUser !== undefined) dbPatch.max_pending_per_user = next.maxPendingPerUser;
        if (patch.cooldownSeconds !== undefined) dbPatch.cooldown_seconds = next.cooldownSeconds;
        if (patch.fallbackGenre !== undefined) dbPatch.fallback_genre = next.fallbackGenre;

        void supabase.from('rooms').update(dbPatch).eq('id', next.id);
      }
      return next;
    });
  };

  const triggerPwaInstall = async () => {
    const promptEvent = deferredPrompt as (Event & { prompt?: () => Promise<void> }) | null;
    if (promptEvent?.prompt) {
      await promptEvent.prompt();
      setDeferredPrompt(null);
      return;
    }
    toast.info('PWA lista: en tu navegador pulsa "Agregar a pantalla de inicio" para instalar PonelePlay.');
  };

  const voteItem = (itemId: string, direction: 1 | -1) => {
    setQueue((prev) =>
      sortQueue(
        prev.map((item) => {
          if (item.id !== itemId) return item;
          const nextVote = item.userVote === direction ? 0 : direction;
          let up = item.upvotesCount;
          let down = item.downvotesCount;
          if (item.userVote === 1) up = Math.max(0, up - 1);
          if (item.userVote === -1) down = Math.max(0, down - 1);
          if (nextVote === 1) up += 1;
          if (nextVote === -1) down += 1;
          return {
            ...item,
            userVote: nextVote,
            upvotesCount: up,
            downvotesCount: down,
            netScore: up - down,
          };
        })
      )
    );

    if (isUuid(itemId)) {
      const voterId = demoRole === 'host' && room.code === 'PLAY42' ? DEFAULT_HOST_UUID : currentUserId;
      void supabase.rpc('cast_queue_vote', {
        p_queue_item_id: itemId,
        p_user_id: voterId,
        p_direction: direction,
      });
    }
  };

  const togglePinItem = (itemId: string) => {
    let nextPinned = false;
    setQueue((prev) =>
      sortQueue(
        prev.map((item) => {
          if (item.id !== itemId) return item;
          nextPinned = !item.isPinned;
          return { ...item, isPinned: nextPinned };
        })
      )
    );
    if (isUuid(itemId)) {
      void supabase.from('queue_items').update({ is_pinned: nextPinned }).eq('id', itemId);
    }
    toast.success('Prioridad de canción actualizada');
  };

  const playNowItem = (itemId: string) => {
    const target = queue.find((q) => q.id === itemId);
    if (!target) return;
    if (nowPlaying) {
      setPlayed((prev) => [{ ...nowPlaying, status: 'played', playedAt: new Date().toISOString() }, ...prev]);
    }
    setQueue((prev) => prev.filter((q) => q.id !== itemId));
    setNowPlaying({ ...target, status: 'playing', isPinned: false });
    setRoom((prev) => ({ ...prev, progressMs: 0, isPlaying: true }));
    if (isUuid(room.id) && isUuid(itemId)) {
      void supabase.rpc('advance_room_playback', {
        p_room_id: room.id,
        p_next_queue_item_id: itemId,
      });
    }
    toast.success(`Sonando ahora: ${target.song.title}`);
  };

  const blockItem = (itemId: string) => {
    const target = queue.find((q) => q.id === itemId);
    if (!target) return;
    setBlockedSongIds((prev) => Array.from(new Set([...prev, target.song.id])));
    setQueue((prev) => prev.filter((q) => q.id !== itemId));
    if (isUuid(itemId)) {
      void supabase.from('queue_items').update({ status: 'blocked' }).eq('id', itemId);
    }
    toast.warning(`"${target.song.title}" fue bloqueada en esta sala`);
  };

  const skipCurrentTrack = () => {
    if (queue.length === 0 || queueEmptyPreview) {
      toast.info('Cola vacía: reproduciendo pista de Autoplay de respaldo');
      if (isUuid(room.id)) {
        void supabase.rpc('advance_room_playback', { p_room_id: room.id });
      }
      return;
    }
    const [next, ...rest] = queue;
    if (nowPlaying) {
      setPlayed((prev) => [{ ...nowPlaying, status: 'played', playedAt: new Date().toISOString() }, ...prev]);
    }
    setNowPlaying({ ...next, status: 'playing', isPinned: false });
    setQueue(rest);
    setRoom((prev) => ({ ...prev, progressMs: 0, isPlaying: true }));
    if (isUuid(room.id)) {
      void supabase.rpc('advance_room_playback', { p_room_id: room.id });
    }
    toast.success(`Siguiente tema: ${next.song.title}`);
  };

  const proposeSong = (song: Song) => {
    if (
      blockedSongIds.includes(song.id) ||
      (song.spotifyTrackId && blockedSongIds.includes(song.spotifyTrackId)) ||
      (song.youtubeVideoId && blockedSongIds.includes(song.youtubeVideoId))
    ) {
      toast.error('El anfitrión ha bloqueado esta canción en esta sala');
      return 'blocked';
    }
    if (
      nowPlaying &&
      (nowPlaying.song.id === song.id ||
        (song.spotifyTrackId && nowPlaying.song.spotifyTrackId === song.spotifyTrackId) ||
        (song.youtubeVideoId && nowPlaying.song.youtubeVideoId === song.youtubeVideoId))
    ) {
      toast.info('¡Esta canción está sonando ahora mismo!');
      return 'already_playing';
    }
    const existing = queue.find(
      (q) =>
        q.song.id === song.id ||
        (song.spotifyTrackId && q.song.spotifyTrackId === song.spotifyTrackId) ||
        (song.youtubeVideoId && q.song.youtubeVideoId === song.youtubeVideoId)
    );
    if (existing) {
      if (existing.userVote !== 1) {
        voteItem(existing.id, 1);
        toast.success('¡Esta canción ya está en la cola! Sumamos tu voto (+1)');
      } else {
        toast.info('Esta canción ya está en la cola y ya tiene tu voto');
      }
      return 'upvoted_existing';
    }

    const activeUserId = currentUserId || 'u-guest-you';
    const myPending = queue.filter(
      (q) => q.proposedById === activeUserId || q.proposedById === 'u-guest-you'
    ).length;
    if (demoRole === 'guest' && myPending >= room.maxPendingPerUser) {
      toast.error(`Alcanzaste el límite de ${room.maxPendingPerUser} canciones pendientes`);
      return 'limit';
    }

    const saved = getSavedPartyProfile();
    const proposerName = demoRole === 'host' ? room.hostName || 'Tincho' : saved.displayName || 'luqui';
    const proposerAvatar = demoRole === 'host' ? '👑' : saved.avatarEmoji || '⚡';

    const tempId = `qi-${Date.now()}`;
    const newItem: QueueItem = {
      id: tempId,
      roomId: room.id,
      song,
      proposedById: activeUserId,
      proposedByName: proposerName,
      proposedByAvatar: proposerAvatar,
      upvotesCount: 1,
      downvotesCount: 0,
      netScore: 1,
      userVote: 1,
      isPinned: false,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setQueueEmptyPreview(false);
    setQueue((prev) => sortQueue([...prev, newItem]));
    if (demoRole === 'guest') {
      setCooldownRemaining(room.cooldownSeconds);
    }

    if (isUuid(room.id)) {
      void supabase
        .rpc('propose_or_upvote_song', {
          p_room_id: room.id,
          p_user_id: activeUserId,
          p_spotify_track_id: (song.spotifyTrackId ?? null) as unknown as string,
          p_youtube_video_id: (song.youtubeVideoId ?? null) as unknown as string,
          p_title: song.title,
          p_artist: song.artist,
          p_album: song.album ?? '',
          p_duration_ms: song.durationMs,
          p_image_url: song.imageUrl,
        })
        .then(() => {
          void hydrateRoomStateFromDb(room.id, activeUserId);
        });
    }

    toast.success(`"${song.title}" agregada a la cola`);
    return 'proposed';
  };

  const sendReaction = (emoji: ReactionEmoji) => {
    const saved = getSavedPartyProfile();
    const senderName = demoRole === 'host' ? room.hostName || 'Tincho' : saved.displayName || 'luqui';
    setReactionCounts((prev) => ({ ...prev, [emoji]: prev[emoji] + 1 }));
    const id = `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const xPercent = 18 + Math.floor(Math.random() * 64);
    setFloatingReactions((prev) => [...prev.slice(-8), { id, emoji, senderName, xPercent }]);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2300);

    if (activeChannelRef.current) {
      void activeChannelRef.current.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { emoji, senderName, clientId: clientTabIdRef.current },
      });
    }
  };

  const toggleBanParticipant = (participantId: string) => {
    let nextBanned = false;
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id !== participantId) return p;
        nextBanned = !p.isBanned;
        return { ...p, isBanned: nextBanned };
      })
    );
    if (isUuid(room.id) && isUuid(participantId)) {
      void supabase
        .from('room_participants')
        .update({ is_banned: nextBanned })
        .eq('room_id', room.id)
        .eq('user_id', participantId);
    }
    toast.info('Estado de acceso del participante actualizado');
  };

  return (
    <PartyPreviewContext.Provider
      value={{
        theme,
        toggleTheme,
        demoRole,
        setDemoRole,
        queueEmptyPreview,
        setQueueEmptyPreview,
        room,
        recentRooms,
        currentUserId,
        updateRoom,
        createRoom,
        joinRoom,
        loadRoomByCode,
        searchCatalog,
        nowPlaying,
        queue: queueEmptyPreview ? [] : queue,
        played,
        participants,
        blockedSongIds,
        floatingReactions,
        reactionCounts,
        cooldownRemaining,
        pwaInstallReady: Boolean(deferredPrompt),
        triggerPwaInstall,
        voteItem,
        togglePinItem,
        playNowItem,
        blockItem,
        skipCurrentTrack,
        proposeSong,
        sendReaction,
        toggleBanParticipant,
      }}
    >
      {children}
    </PartyPreviewContext.Provider>
  );
};

export function usePartyPreview() {
  const ctx = useContext(PartyPreviewContext);
  if (!ctx) throw new Error('usePartyPreview must be used inside PartyPreviewProvider');
  return ctx;
}
