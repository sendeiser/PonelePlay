export type AudioProvider = 'youtube_music' | 'spotify';
export type AudioOutput = 'host_device' | 'tv';
export type UserRole = 'host' | 'guest';
export type QueueStatus = 'pending' | 'playing' | 'played' | 'blocked';
export type VoteValue = 1 | -1 | 0;
export type ReactionEmoji = '🔥' | '❤️' | '🕺' | '👎';
export type JoinEdgeState = 'active' | 'ended' | 'banned' | 'not_found';

export interface Song {
  id: string;
  spotifyTrackId: string | null;
  youtubeVideoId: string | null;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  imageUrl: string;
  cached?: boolean;
}

export interface QueueItem {
  id: string;
  roomId: string;
  song: Song;
  proposedById: string;
  proposedByName: string;
  proposedByAvatar: string;
  upvotesCount: number;
  downvotesCount: number;
  netScore: number;
  userVote: VoteValue;
  isPinned: boolean;
  status: QueueStatus;
  createdAt: string;
  playedAt?: string;
}

export interface Participant {
  id: string;
  displayName: string;
  avatarEmoji: string;
  role: UserRole;
  isBanned: boolean;
  djPoints: number;
  pendingCount: number;
  isLinkedAccount: boolean;
}

export interface RoomSettings {
  id: string;
  code: string;
  name: string;
  hostId?: string;
  hostName: string;
  isActive: boolean;
  activeProvider: AudioProvider;
  audioOutput: AudioOutput;
  maxPendingPerUser: number;
  cooldownSeconds: number;
  fallbackGenre: string;
  isPlaying: boolean;
  progressMs: number;
  volumePercent: number;
  wakeLockActive: boolean;
  spotifyConnected: boolean;
}

export interface FloatingReaction {
  id: string;
  emoji: ReactionEmoji;
  senderName: string;
  xPercent: number;
}

export interface RecentRoom {
  code: string;
  name: string;
  hostName: string;
  isActive: boolean;
  provider: AudioProvider;
  participantsCount: number;
  songsPlayed: number;
}
