import { Song } from '../types/jukebox';

const SPOTIFY_VERIFIER_KEY = 'poneleplay_spotify_pkce_verifier';
const SPOTIFY_CLIENT_KEY = 'poneleplay_spotify_client_id';
const SPOTIFY_TOKEN_KEY = 'poneleplay_spotify_access_token';
const SPOTIFY_EXPIRES_KEY = 'poneleplay_spotify_expires_at';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomVerifier(length = 64): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}

async function computeS256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function getConfiguredSpotifyClientId(): string | null {
  const envId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (envId && envId !== 'YOUR_SPOTIFY_CLIENT_ID') return envId;
  try {
    const localId = window.localStorage.getItem(SPOTIFY_CLIENT_KEY);
    if (localId && localId.trim().length > 10) return localId.trim();
  } catch {
    // ignore storage errors
  }
  return null;
}

export function saveSpotifyClientId(clientId: string): void {
  try {
    window.localStorage.setItem(SPOTIFY_CLIENT_KEY, clientId.trim());
  } catch {
    // ignore
  }
}

export function getSpotifyAccessToken(): string | null {
  try {
    const token = window.localStorage.getItem(SPOTIFY_TOKEN_KEY);
    const expiresAt = Number(window.localStorage.getItem(SPOTIFY_EXPIRES_KEY) || '0');
    if (token && (!expiresAt || Date.now() < expiresAt)) {
      return token;
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearSpotifyToken(): void {
  try {
    window.localStorage.removeItem(SPOTIFY_TOKEN_KEY);
    window.localStorage.removeItem(SPOTIFY_EXPIRES_KEY);
  } catch {
    // ignore
  }
}

export async function startSpotifyPkceLogin(overrideClientId?: string): Promise<boolean> {
  const clientId = overrideClientId?.trim() || getConfiguredSpotifyClientId();
  if (!clientId) return false;
  if (overrideClientId) saveSpotifyClientId(clientId);

  const verifier = generateRandomVerifier(64);
  const challenge = await computeS256Challenge(verifier);
  try {
    window.sessionStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier);
  } catch {
    // ignore
  }

  const redirectUri = `${window.location.origin}/`;
  const scopes = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'playlist-modify-public',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: scopes,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  return true;
}

export async function completeSpotifyPkceCallback(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const clientId = getConfiguredSpotifyClientId();
  let verifier: string | null = null;
  try {
    verifier = window.sessionStorage.getItem(SPOTIFY_VERIFIER_KEY);
  } catch {
    verifier = null;
  }

  if (!code || !verifier || !clientId) return false;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${window.location.origin}/`,
      code_verifier: verifier,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) return false;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return false;

    window.localStorage.setItem(SPOTIFY_TOKEN_KEY, data.access_token);
    window.localStorage.setItem(
      SPOTIFY_EXPIRES_KEY,
      String(Date.now() + Number(data.expires_in || 3600) * 1000)
    );
    window.sessionStorage.removeItem(SPOTIFY_VERIFIER_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  } catch {
    return false;
  }
}

export async function createSpotifyPlaylistFromTracks(
  roomName: string,
  tracks: Song[]
): Promise<{ ok: boolean; url?: string }> {
  const token = getSpotifyAccessToken();
  if (!token) return { ok: false };

  try {
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return { ok: false };
    const me = (await meRes.json()) as { id: string };

    const createRes = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(me.id)}/playlists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `PonelePlay · ${roomName}`,
        description: 'Playlist generada en vivo con PonelePlay V2.',
        public: true,
      }),
    });
    if (!createRes.ok) return { ok: false };
    const playlist = (await createRes.json()) as { id: string; external_urls?: { spotify?: string } };

    const uris = tracks
      .map((t) => t.spotifyTrackId)
      .filter((id): id is string => Boolean(id && /^[A-Za-z0-9]{22}$/.test(id)))
      .map((id) => `spotify:track:${id}`);

    if (uris.length > 0) {
      await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris }),
      });
    }

    return { ok: true, url: playlist.external_urls?.spotify };
  } catch {
    return { ok: false };
  }
}

export function downloadM3u8Playlist(roomCode: string, roomName: string, tracks: Song[]): void {
  const lines = ['#EXTM3U', `#PLAYLIST:PonelePlay ${roomCode} - ${roomName}`];
  for (const track of tracks) {
    const sec = Math.max(0, Math.round(track.durationMs / 1000));
    lines.push(`#EXTINF:${sec},${track.artist} - ${track.title}`);
    lines.push(track.youtubeVideoId?.startsWith('http') ? track.youtubeVideoId : `https://www.youtube.com/watch?v=${track.youtubeVideoId ?? ''}`);
  }

  const blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `poneleplay-${roomCode.toLowerCase()}.m3u8`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
