-- Migration: 20261031290000_master_control_and_karaoke.sql
-- Description: Master playback control table, karaoke mode setting, and remote player RPCs

create table if not exists public.venue_playback_state (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  is_paused boolean not null default false,
  volume integer not null default 85 check (volume between 0 and 100),
  is_muted boolean not null default false,
  karaoke_mode boolean not null default false,
  current_track jsonb default null,
  last_command text default null,
  command_seq bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.venue_playback_state enable row level security;

drop policy if exists venue_playback_state_select on public.venue_playback_state;
create policy venue_playback_state_select on public.venue_playback_state
  for select using (true);

drop policy if exists venue_playback_state_modify on public.venue_playback_state;
create policy venue_playback_state_modify on public.venue_playback_state
  for all using (true) with check (true);

grant all on public.venue_playback_state to authenticated, anon, service_role;

-- 1. Send Playback Command RPC
create or replace function public.send_playback_command(
  p_venue_slug text,
  p_command text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue record;
  v_state record;
  v_night record;
  v_track_id uuid;
  v_item_id uuid;
  v_track jsonb;
  v_new_paused boolean;
  v_new_volume int;
  v_new_muted boolean;
  v_new_karaoke boolean;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  select * into v_state from public.venue_playback_state where venue_id = v_venue.id for update;
  if not found then
    insert into public.venue_playback_state (venue_id) values (v_venue.id)
    returning * into v_state;
  end if;

  v_new_paused := v_state.is_paused;
  v_new_volume := v_state.volume;
  v_new_muted := v_state.is_muted;
  v_new_karaoke := v_state.karaoke_mode;

  if p_command = 'pause' then
    v_new_paused := true;
  elsif p_command = 'resume' then
    v_new_paused := false;
  elsif p_command = 'toggle_pause' then
    v_new_paused := not v_state.is_paused;
  elsif p_command = 'set_volume' then
    v_new_volume := greatest(0, least(100, coalesce((p_payload->>'volume')::int, v_state.volume)));
    v_new_muted := false;
  elsif p_command = 'mute' then
    v_new_muted := true;
  elsif p_command = 'unmute' then
    v_new_muted := false;
  elsif p_command = 'toggle_mute' then
    v_new_muted := not v_state.is_muted;
  elsif p_command = 'set_karaoke_mode' then
    v_new_karaoke := coalesce((p_payload->>'enabled')::boolean, not v_state.karaoke_mode);
  elsif p_command = 'play_now' then
    v_new_paused := false;
    v_track := p_payload->'track';
    if v_track is not null and (v_track->>'title') is not null then
      select id into v_track_id from public.tracks
      where (youtube_video_id is not null and youtube_video_id = v_track->>'youtubeVideoId')
         or (lower(title) = lower(v_track->>'title') and lower(artist) = lower(v_track->>'artist'))
      limit 1;

      if v_track_id is null then
        insert into public.tracks (
          venue_id, source, title, artist, duration_seconds, thumbnail_url, youtube_video_id, dedupe_key, created_by_kind
        ) values (
          v_venue.id,
          'youtube',
          trim(v_track->>'title'),
          trim(coalesce(v_track->>'artist', 'YouTube')),
          coalesce((v_track->>'durationSeconds')::int, 210),
          v_track->>'thumbnailUrl',
          v_track->>'youtubeVideoId',
          'yt:' || coalesce(v_track->>'youtubeVideoId', gen_random_uuid()::text),
          'owner'
        )
        returning id into v_track_id;
      end if;

      select * into v_night from public.night_sessions
      where venue_id = v_venue.id and status = 'open'
      order by opened_at desc limit 1;

      if v_night.id is not null then
        update public.queue_items set status = 'skipped', ended_at = now()
        where night_session_id = v_night.id and status = 'playing';

        insert into public.queue_items (venue_id, night_session_id, track_id, proposed_by_participant_id, status, vote_count, started_at)
        values (v_venue.id, v_night.id, v_track_id, null, 'playing', 99999, now())
        returning id into v_item_id;
      end if;
    end if;
  elsif p_command = 'enqueue_top' then
    v_track := p_payload->'track';
    if v_track is not null and (v_track->>'title') is not null then
      select id into v_track_id from public.tracks
      where (youtube_video_id is not null and youtube_video_id = v_track->>'youtubeVideoId')
         or (lower(title) = lower(v_track->>'title') and lower(artist) = lower(v_track->>'artist'))
      limit 1;

      if v_track_id is null then
        insert into public.tracks (
          venue_id, source, title, artist, duration_seconds, thumbnail_url, youtube_video_id, dedupe_key, created_by_kind
        ) values (
          v_venue.id,
          'youtube',
          trim(v_track->>'title'),
          trim(coalesce(v_track->>'artist', 'YouTube')),
          coalesce((v_track->>'durationSeconds')::int, 210),
          v_track->>'thumbnailUrl',
          v_track->>'youtubeVideoId',
          'yt:' || coalesce(v_track->>'youtubeVideoId', gen_random_uuid()::text),
          'owner'
        )
        returning id into v_track_id;
      end if;

      select * into v_night from public.night_sessions
      where venue_id = v_venue.id and status = 'open'
      order by opened_at desc limit 1;

      if v_night.id is not null then
        insert into public.queue_items (venue_id, night_session_id, track_id, proposed_by_participant_id, status, vote_count)
        values (v_venue.id, v_night.id, v_track_id, null, 'queued', 99999)
        returning id into v_item_id;
      end if;
    end if;
  elsif p_command = 'skip' then
    select * into v_night from public.night_sessions
    where venue_id = v_venue.id and status = 'open'
    order by opened_at desc limit 1;

    if v_night.id is not null then
      update public.queue_items set status = 'skipped', ended_at = now()
      where night_session_id = v_night.id and status = 'playing';
    end if;
  end if;

  update public.venue_playback_state
  set is_paused = v_new_paused,
      volume = v_new_volume,
      is_muted = v_new_muted,
      karaoke_mode = v_new_karaoke,
      current_track = coalesce(p_payload->'track', v_state.current_track),
      last_command = p_command,
      command_seq = v_state.command_seq + 1,
      updated_at = now()
  where venue_id = v_venue.id
  returning * into v_state;

  return jsonb_build_object(
    'ok', true,
    'command', p_command,
    'isPaused', v_state.is_paused,
    'volume', v_state.volume,
    'isMuted', v_state.is_muted,
    'karaokeMode', v_state.karaoke_mode,
    'commandSeq', v_state.command_seq,
    'currentTrack', v_state.current_track
  );
end;
$$;

grant execute on function public.send_playback_command(text, text, jsonb) to authenticated, anon, service_role;

-- 2. Get Playback State RPC
create or replace function public.get_playback_state(p_venue_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue record;
  v_state record;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  select * into v_state from public.venue_playback_state where venue_id = v_venue.id;
  if not found then
    insert into public.venue_playback_state (venue_id) values (v_venue.id)
    returning * into v_state;
  end if;

  return jsonb_build_object(
    'ok', true,
    'venueId', v_venue.id,
    'isPaused', v_state.is_paused,
    'volume', v_state.volume,
    'isMuted', v_state.is_muted,
    'karaokeMode', v_state.karaoke_mode,
    'currentTrack', v_state.current_track,
    'lastCommand', v_state.last_command,
    'commandSeq', v_state.command_seq
  );
end;
$$;

grant execute on function public.get_playback_state(text) to authenticated, anon, service_role;
