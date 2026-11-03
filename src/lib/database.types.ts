export type TableDefinition<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      venues: TableDefinition<{
        id: string;
        owner_id: string;
        name: string;
        slug: string;
        accent_color: string;
        logo_url: string | null;
        join_message: string | null;
        created_at: string;
      }>;
      venue_settings: TableDefinition<{
        venue_id: string;
        explicit_filter_enabled: boolean;
        explicit_keywords: string[];
        max_song_duration_seconds: number;
        max_proposals_per_participant: number;
        default_credits_per_code: number;
        max_credits_per_code: number;
        max_queue_size: number;
        proposals_enabled: boolean;
        voting_rounds_enabled?: boolean;
        voting_round_seconds?: number;
        updated_at: string;
      }>;
      night_sessions: TableDefinition<{
        id: string;
        venue_id: string;
        status: "open" | "closed";
        opened_by_kind: "owner" | "staff" | "system";
        opened_by_id: string;
        opened_at: string;
        closed_at: string | null;
        current_round_started_at?: string;
        current_round_number?: number;
      }>;
      participants: TableDefinition<{
        id: string;
        venue_id: string;
        night_session_id: string;
        auth_user_id: string;
        credits_balance: number;
        proposals_used: number;
        created_at: string;
        last_seen_at: string;
      }>;
      staff_members: TableDefinition<{
        id: string;
        venue_id: string;
        name: string;
        pin_hash: string;
        active: boolean;
        failed_attempts: number;
        locked_until: string | null;
        created_at: string;
        last_login_at: string | null;
      }>;
      tracks: TableDefinition<{
        id: string;
        venue_id: string;
        source: "youtube" | "upload" | "spotify";
        title: string;
        artist: string;
        duration_seconds: number;
        thumbnail_url: string | null;
        youtube_video_id: string | null;
        storage_path: string | null;
        spotify_uri: string | null;
        is_explicit: boolean;
        status: "active" | "archived";
        dedupe_key: string;
        created_by_kind: "owner" | "client";
        created_at: string;
      }>;
      queue_items: TableDefinition<{
        id: string;
        venue_id: string;
        night_session_id: string;
        track_id: string;
        status: "queued" | "playing" | "played" | "skipped" | "vetoed" | "failed";
        vote_count: number;
        proposed_by_participant_id: string | null;
        created_at: string;
        started_at: string | null;
        ended_at: string | null;
      }>;
      votes: TableDefinition<{
        id: string;
        venue_id: string;
        night_session_id: string;
        participant_id: string;
        queue_item_id: string;
        track_id: string;
        created_at: string;
      }>;
      vote_codes: TableDefinition<{
        id: string;
        venue_id: string;
        night_session_id: string;
        code: string;
        credits: number;
        status: "active" | "redeemed" | "expired";
        created_by_kind: "owner" | "staff" | "system";
        created_by_owner_id: string | null;
        created_by_staff_id: string | null;
        redeemed_by_participant_id: string | null;
        printed_count: number;
        created_at: string;
        redeemed_at: string | null;
      }>;
      fallback_tracks: TableDefinition<{
        id: string;
        venue_id: string;
        track_id: string;
        position: number;
      }>;
      player_devices: TableDefinition<{
        id: string;
        venue_id: string;
        name: string;
        token_hash: string;
        paired_by_owner_id: string;
        last_seen_at: string | null;
        revoked_at: string | null;
        display_config?: Record<string, unknown> | null;
        created_at: string;
      }>;
      venue_playlists: TableDefinition<{
        id: string;
        venue_id: string;
        name: string;
        description: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      playlist_tracks: TableDefinition<{
        id: string;
        playlist_id: string;
        track_id: string;
        position: number;
        created_at: string;
      }>;
      venue_playback_state: TableDefinition<{
        venue_id: string;
        is_paused: boolean;
        volume: number;
        is_muted: boolean;
        karaoke_mode: boolean;
        current_track: Record<string, unknown> | null;
        last_command: string | null;
        command_seq: number;
        updated_at: string;
      }>;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
