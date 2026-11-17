import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ydoviusjpgmjsxpspexu.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkb3ZpdXNqcGdtanN4cHNwZXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxODc0ODgsImV4cCI6MjEwOTc2MzQ4OH0.zG3dniHtMfwqdx0sf6IcueNMWLoUVfr9zgz5zmXC-6Y';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

const LOCAL_USER_ID_KEY = 'poneleplay_party_user_id';
const LOCAL_USER_NAME_KEY = 'poneleplay_party_user_name';
const LOCAL_USER_AVATAR_KEY = 'poneleplay_party_user_avatar';

export function getOrCreateLocalUserId(): string {
  try {
    const existing = window.localStorage.getItem(LOCAL_USER_ID_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '10000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
    window.localStorage.setItem(LOCAL_USER_ID_KEY, generated);
    return generated;
  } catch {
    return '10000000-0000-4000-8000-000000000099';
  }
}

export function getSavedPartyProfile(): { displayName: string; avatarEmoji: string } {
  try {
    return {
      displayName: window.localStorage.getItem(LOCAL_USER_NAME_KEY) || 'Tincho',
      avatarEmoji: window.localStorage.getItem(LOCAL_USER_AVATAR_KEY) || '👑',
    };
  } catch {
    return { displayName: 'Tincho', avatarEmoji: '👑' };
  }
}

export function savePartyProfile(displayName: string, avatarEmoji: string): void {
  try {
    window.localStorage.setItem(LOCAL_USER_NAME_KEY, displayName);
    window.localStorage.setItem(LOCAL_USER_AVATAR_KEY, avatarEmoji);
  } catch {
    // ignore storage errors
  }
}

export async function ensurePartyUser(
  displayName?: string,
  avatarEmoji?: string
): Promise<{ id: string; displayName: string; avatarEmoji: string; isAnonymous: boolean }> {
  const saved = getSavedPartyProfile();
  const cleanName = (displayName || saved.displayName || 'Invitado').trim().slice(0, 24) || 'Invitado';
  const cleanAvatar = avatarEmoji || saved.avatarEmoji || '🎧';
  savePartyProfile(cleanName, cleanAvatar);

  let userId = getOrCreateLocalUserId();
  let isAnonymous = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    let authUser = sessionData.session?.user ?? null;

    if (!authUser) {
      const { data: anonData } = await supabase.auth.signInAnonymously();
      authUser = anonData.user ?? null;
    }

    if (authUser?.id) {
      userId = authUser.id;
      isAnonymous = Boolean(authUser.is_anonymous ?? true);
      window.localStorage.setItem(LOCAL_USER_ID_KEY, userId);
    }
  } catch {
    // Fallback to deterministic localStorage UUID when anonymous sign-in is disabled
  }

  try {
    await supabase.rpc('upsert_party_user', {
      p_user_id: userId,
      p_display_name: cleanName,
      p_avatar_emoji: cleanAvatar,
      p_is_anonymous: isAnonymous,
    });
  } catch {
    // Keep client session operable even if network is offline
  }

  return { id: userId, displayName: cleanName, avatarEmoji: cleanAvatar, isAnonymous };
}
