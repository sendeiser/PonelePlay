-- Migration: 20261031250000_player.sql
-- Description: Player device pairing, state retrieval, heartbeat, and playback event RPCs

-- 1. Owner Pair Player Device
create or replace function public.owner_pair_player(
  p_venue_id uuid,
  p_name text default 'PC del bar'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_owner_id uuid;
  v_venue record;
  v_raw_token text;
  v_token_hash text;
  v_device_id uuid;
  v_clean_name text;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_venue
  from public.venues
  where id = p_venue_id and owner_id = v_owner_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_clean_name := coalesce(nullif(trim(p_name), ''), 'PC del bar');
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  insert into public.player_devices (
    venue_id,
    name,
    token_hash,
    paired_by_owner_id,
    last_seen_at
  ) values (
    v_venue.id,
    v_clean_name,
    v_token_hash,
    v_owner_id,
    now()
  )
  returning id into v_device_id;

  -- Record audit
  insert into public.staff_actions (
    venue_id,
    actor_kind,
    actor_id,
    action,
    payload
  ) values (
    v_venue.id,
    'owner',
    v_owner_id,
    'pair_player',
    jsonb_build_object('device_id', v_device_id, 'name', v_clean_name)
  );

  return jsonb_build_object(
    'ok', true,
    'deviceId', v_device_id,
    'name', v_clean_name,
    'token', v_raw_token
  );
end;
$$;

revoke all on function public.owner_pair_player(uuid, text) from public, anon;
grant execute on function public.owner_pair_player(uuid, text) to authenticated;

-- 2. Owner Revoke Player Device
create or replace function public.owner_revoke_player(
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_owner_id uuid;
  v_device record;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select pd.*, v.id as venue_id into v_device
  from public.player_devices pd
  join public.venues v on v.id = pd.venue_id
  where pd.id = p_device_id and v.owner_id = v_owner_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.player_devices
  set revoked_at = now()
  where id = p_device_id;

  insert into public.staff_actions (
    venue_id,
    actor_kind,
    actor_id,
    action,
    payload
  ) values (
    v_device.venue_id,
    'owner',
    v_owner_id,
    'revoke_player',
    jsonb_build_object('device_id', p_device_id)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.owner_revoke_player(uuid) from public, anon;
grant execute on function public.owner_revoke_player(uuid) to authenticated;

-- 3. Player State RPC
create or replace function public.player_state(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token_hash text;
  v_device record;
  v_venue record;
  v_night record;
  v_now_playing jsonb;
  v_queue jsonb;
  v_fallback jsonb;
begin
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  select pd.*, v.name as venue_name, v.slug as venue_slug
  into v_device
  from public.player_devices pd
  join public.venues v on v.id = pd.venue_id
  where pd.token_hash = v_token_hash and pd.revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- Heartbeat update
  update public.player_devices
  set last_seen_at = now()
  where id = v_device.id;

  -- Find active night
  select * into v_night
  from public.night_sessions
  where venue_id = v_device.venue_id and status = 'active'
  order by opened_at desc
  limit 1;

  -- Now playing track
  if v_night.id is not null then
    select jsonb_build_object(
      'itemId', qi.id,
      'trackId', t.id,
      'title', t.title,
      'artist', t.artist,
      'source', t.source,
      'durationSeconds', t.duration_seconds,
      'youtubeVideoId', t.youtube_video_id,
      'storagePath', t.storage_path,
      'thumbnailUrl', t.thumbnail_url,
      'voteCount', qi.vote_count,
      'startedAt', qi.started_at
    ) into v_now_playing
    from public.queue_items qi
    join public.tracks t on t.id = qi.track_id
    where qi.night_session_id = v_night.id and qi.status = 'playing'
    limit 1;

    -- Queued tracks (top 5 by votes then created_at)
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'itemId', qi.id,
          'trackId', t.id,
          'title', t.title,
          'artist', t.artist,
          'source', t.source,
          'durationSeconds', t.duration_seconds,
          'youtubeVideoId', t.youtube_video_id,
          'storagePath', t.storage_path,
          'thumbnailUrl', t.thumbnail_url,
          'voteCount', qi.vote_count,
          'createdAt', qi.created_at
        ) order by qi.vote_count desc, qi.created_at asc
      ),
      '[]'::jsonb
    ) into v_queue
    from (
      select qi.*
      from public.queue_items qi
      where qi.night_session_id = v_night.id and qi.status = 'queued'
      order by qi.vote_count desc, qi.created_at asc
      limit 5
    ) qi
    join public.tracks t on t.id = qi.track_id;
  else
    v_now_playing := null;
    v_queue := '[]'::jsonb;
  end if;

  -- Fallback tracks
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'itemId', 'fallback-' || ft.id::text,
        'trackId', t.id,
        'title', t.title,
        'artist', t.artist,
        'source', t.source,
        'durationSeconds', t.duration_seconds,
        'youtubeVideoId', t.youtube_video_id,
        'storagePath', t.storage_path,
        'thumbnailUrl', t.thumbnail_url,
        'voteCount', 0,
        'position', ft.position
      ) order by ft.position asc
    ),
    '[]'::jsonb
  ) into v_fallback
  from public.fallback_tracks ft
  join public.tracks t on t.id = ft.track_id
  where ft.venue_id = v_device.venue_id;

  return jsonb_build_object(
    'ok', true,
    'deviceId', v_device.id,
    'venue', jsonb_build_object(
      'id', v_device.venue_id,
      'name', v_device.venue_name,
      'slug', v_device.venue_slug
    ),
    'nightId', v_night.id,
    'nightStatus', coalesce(v_night.status, 'closed'),
    'nowPlaying', v_now_playing,
    'queue', v_queue,
    'fallback', v_fallback,
    'serverTime', now()
  );
end;
$$;

revoke all on function public.player_state(text) from public;
grant execute on function public.player_state(text) to anon, authenticated, service_role;

-- 4. Player Event RPC
create or replace function public.player_event(
  p_token text,
  p_action text,
  p_item_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token_hash text;
  v_device record;
  v_item record;
begin
  if p_action not in ('started', 'finished', 'failed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_device
  from public.player_devices
  where token_hash = v_token_hash and revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  update public.player_devices
  set last_seen_at = now()
  where id = v_device.id;

  select * into v_item
  from public.queue_items
  where id = p_item_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_action = 'started' then
    -- Finish any previously playing item in this night
    update public.queue_items
    set status = 'played',
        ended_at = now()
    where night_session_id = v_item.night_session_id
      and status = 'playing'
      and id <> p_item_id;

    -- Set target item playing
    update public.queue_items
    set status = 'playing',
        started_at = now()
    where id = p_item_id;

  elsif p_action = 'finished' then
    update public.queue_items
    set status = 'played',
        ended_at = now()
    where id = p_item_id and status = 'playing';

  elsif p_action = 'failed' then
    update public.queue_items
    set status = 'failed',
        ended_at = now()
    where id = p_item_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.player_event(text, text, uuid, text) from public;
grant execute on function public.player_event(text, text, uuid, text) to anon, authenticated, service_role;

