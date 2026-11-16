import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  INITIAL_BLOCKED_SONG_IDS,
  INITIAL_NOW_PLAYING,
  INITIAL_PARTICIPANTS,
  INITIAL_PLAYED,
  INITIAL_QUEUE,
  INITIAL_ROOM,
} from '../data/mockPartyData';
import {
  FloatingReaction,
  Participant,
  QueueItem,
  ReactionEmoji,
  RoomSettings,
  Song,
  UserRole,
} from '../types/jukebox';

type ThemeMode = 'dark' | 'light';

interface PartyPreviewContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  demoRole: UserRole;
  setDemoRole: (role: UserRole) => void;
  queueEmptyPreview: boolean;
  setQueueEmptyPreview: (empty: boolean) => void;
  room: RoomSettings;
  updateRoom: (patch: Partial<RoomSettings>) => void;
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

function sortQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (b.netScore !== a.netScore) return b.netScore - a.netScore;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export const PartyPreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [demoRole, setDemoRole] = useState<UserRole>('host');
  const [queueEmptyPreview, setQueueEmptyPreview] = useState(false);
  const [room, setRoom] = useState<RoomSettings>(INITIAL_ROOM);
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

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const updateRoom = (patch: Partial<RoomSettings>) => {
    setRoom((prev) => ({ ...prev, ...patch }));
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
  };

  const togglePinItem = (itemId: string) => {
    setQueue((prev) =>
      sortQueue(
        prev.map((item) => (item.id === itemId ? { ...item, isPinned: !item.isPinned } : item))
      )
    );
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
    toast.success(`Sonando ahora: ${target.song.title}`);
  };

  const blockItem = (itemId: string) => {
    const target = queue.find((q) => q.id === itemId);
    if (!target) return;
    setBlockedSongIds((prev) => Array.from(new Set([...prev, target.song.id])));
    setQueue((prev) => prev.filter((q) => q.id !== itemId));
    toast.warning(`"${target.song.title}" fue bloqueada en esta sala`);
  };

  const skipCurrentTrack = () => {
    if (queue.length === 0 || queueEmptyPreview) {
      toast.info('Cola vacía: reproduciendo pista de Autoplay de respaldo');
      return;
    }
    const [next, ...rest] = queue;
    if (nowPlaying) {
      setPlayed((prev) => [{ ...nowPlaying, status: 'played', playedAt: new Date().toISOString() }, ...prev]);
    }
    setNowPlaying({ ...next, status: 'playing', isPinned: false });
    setQueue(rest);
    setRoom((prev) => ({ ...prev, progressMs: 0, isPlaying: true }));
    toast.success(`Siguiente tema: ${next.song.title}`);
  };

  const proposeSong = (song: Song) => {
    if (blockedSongIds.includes(song.id)) {
      toast.error('El anfitrión ha bloqueado esta canción en esta sala');
      return 'blocked';
    }
    if (nowPlaying && nowPlaying.song.id === song.id) {
      toast.info('¡Esta canción está sonando ahora mismo!');
      return 'already_playing';
    }
    const existing = queue.find((q) => q.song.id === song.id);
    if (existing) {
      if (existing.userVote !== 1) {
        voteItem(existing.id, 1);
        toast.success('¡Esta canción ya está en la cola! Sumamos tu voto (+1)');
      } else {
        toast.info('Esta canción ya está en la cola y ya tiene tu voto');
      }
      return 'upvoted_existing';
    }

    const myPending = queue.filter((q) => q.proposedById === 'u-guest-you').length;
    if (demoRole === 'guest' && myPending >= room.maxPendingPerUser) {
      toast.error(`Alcanzaste el límite de ${room.maxPendingPerUser} canciones pendientes`);
      return 'limit';
    }

    const newItem: QueueItem = {
      id: `qi-${Date.now()}`,
      roomId: room.id,
      song,
      proposedById: demoRole === 'host' ? 'u-host' : 'u-guest-you',
      proposedByName: demoRole === 'host' ? 'Tincho' : 'luqui',
      proposedByAvatar: demoRole === 'host' ? '👑' : '⚡',
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
    toast.success(`"${song.title}" agregada a la cola`);
    return 'proposed';
  };

  const sendReaction = (emoji: ReactionEmoji) => {
    setReactionCounts((prev) => ({ ...prev, [emoji]: prev[emoji] + 1 }));
    const id = `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const xPercent = 18 + Math.floor(Math.random() * 64);
    setFloatingReactions((prev) => [...prev.slice(-8), { id, emoji, senderName: demoRole === 'host' ? 'Tincho' : 'luqui', xPercent }]);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2300);
  };

  const toggleBanParticipant = (participantId: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === participantId ? { ...p, isBanned: !p.isBanned } : p))
    );
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
        updateRoom,
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
