-- Optimize database writes and Supabase Realtime WAL churn from TV polling/state RPCs.
-- 1. Throttle player_devices.last_seen_at updates inside player_state() to at most once every 60s.
-- 2. Throttle player_devices.last_seen_at updates inside player_event() to at most once every 30s.
-- 3. Remove public.player_devices from supabase_realtime publication (if explicitly published) so heartbeats never trigger WAL broadcast scans.

create or replace function public.player_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token_hash text;
  v_device record;
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
  where pd.token_hash = v_token_hash
    and pd.revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- Throttle last_seen_at writes to once per minute per TV device to prevent excessive WAL churn
  if v_device.last_seen_at is null or v_device.last_seen_at < now() - interval '60 seconds' then
    update public.player_devices
    set last_seen_at = now()
    where id = v_device.id;
  end if;

  -- Find open night
  select * into v_night
  from public.night_sessions
  where venue_id = v_device.venue_id and status = 'open'
  order by opened_at desc
  limit 1;

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
      limit 10
    ) qi
    join public.tracks t on t.id = qi.track_id;
  else
    v_now_playing := null;
    v_queue := '[]'::jsonb;
  end if;

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
    'nightStatus', case when v_night.id is not null then 'active' else 'closed' end,
    'nowPlaying', v_now_playing,
    'queue', coalesce(v_queue, '[]'::jsonb),
    'fallback', coalesce(v_fallback, '[]'::jsonb),
    'serverTime', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

revoke all on function public.player_state(text) from public;
grant execute on function public.player_state(text) to anon, authenticated, service_role;

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

  if v_device.last_seen_at is null or v_device.last_seen_at < now() - interval '30 seconds' then
    update public.player_devices
    set last_seen_at = now()
    where id = v_device.id;
  end if;

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

do $$
begin
  if exists (
    select 1
    from pg_publication p
    join pg_publication_tables pt on pt.pubname = p.pubname
    where p.pubname = 'supabase_realtime'
      and p.puballtables = false
      and pt.schemaname = 'public'
      and pt.tablename = 'player_devices'
  ) then
    execute 'alter publication supabase_realtime drop table public.player_devices';
  end if;
end
$$;

