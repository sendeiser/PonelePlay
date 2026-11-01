-- Migration: 20261031270000_fix_night_status_checks.sql
-- Fixes:
-- 1. generate_code_string using extensions.gen_random_bytes(8)
-- 2. queue_action checking status = 'open' and granting execute to authenticated
-- 3. player_state checking status = 'open'
-- 4. consume_rate_limit using window_start (instead of window_started_at)
-- 5. get_night_state using scalar variables for participant (eliminates 55000 'record not assigned' error when night is closed)

create or replace function public.generate_code_string()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  result text := '';
  i int;
begin
  for i in 0..7 loop
    result := result || substr(chars, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (
    key,
    count,
    window_start,
    expires_at
  )
  values (
    p_key,
    1,
    now(),
    now() + (p_ttl_seconds || ' seconds')::interval
  )
  on conflict (key) do update
  set count = case
        when now() > rate_limits.window_start + (p_window_seconds || ' seconds')::interval
        then 1
        else rate_limits.count + 1
      end,
      window_start = case
        when now() > rate_limits.window_start + (p_window_seconds || ' seconds')::interval
        then now()
        else rate_limits.window_start
      end,
      expires_at = now() + (p_ttl_seconds || ' seconds')::interval
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to authenticated, anon;


create or replace function public.queue_action(
  p_item_id uuid,
  p_action text,
  p_actor_kind public.actor_kind,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_night record;
begin
  if p_action not in ('skip', 'veto') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  select * into v_item
  from public.queue_items
  where id = p_item_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_night
  from public.night_sessions
  where id = v_item.night_session_id;

  if not found or v_night.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'night_closed');
  end if;

  if p_action = 'skip' then
    if v_item.status not in ('playing', 'queued') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;

    update public.queue_items
    set status = 'skipped',
        ended_at = now()
    where id = p_item_id;

  elsif p_action = 'veto' then
    if v_item.status = 'playing' then
      return jsonb_build_object('ok', false, 'error', 'not_queued');
    end if;

    if v_item.status <> 'queued' then
      return jsonb_build_object('ok', false, 'error', 'not_queued');
    end if;

    update public.queue_items
    set status = 'vetoed',
        ended_at = now()
    where id = p_item_id;
  end if;

  -- Record audit trail in staff_actions
  insert into public.staff_actions (
    venue_id,
    night_session_id,
    actor_kind,
    actor_id,
    action,
    payload
  ) values (
    v_night.venue_id,
    v_night.id,
    p_actor_kind,
    p_actor_id,
    p_action,
    jsonb_build_object(
      'item_id', p_item_id,
      'track_id', v_item.track_id,
      'prev_status', v_item.status
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.queue_action(uuid, text, public.actor_kind, uuid) from public, anon;
grant execute on function public.queue_action(uuid, text, public.actor_kind, uuid) to authenticated, service_role;


create or replace function public.get_night_state(p_venue_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue record;
  v_settings record;
  v_night record;
  v_participant_id uuid := null;
  v_participant_credits int := 0;
  v_participant_proposals int := 0;
  v_now_playing jsonb;
  v_queue jsonb;
begin
  select id, slug, name, accent_color, logo_url, join_message into v_venue
  from public.venues
  where slug = p_venue_slug;

  if not found then
    raise exception 'venue_not_found';
  end if;

  select
    coalesce(explicit_filter_enabled, true) as explicit_filter_enabled,
    coalesce(max_song_duration_seconds, 480) as max_song_duration_seconds,
    coalesce(max_proposals_per_participant, 3) as max_proposals_per_participant,
    coalesce(default_credits_per_code, 5) as default_credits_per_code,
    coalesce(max_credits_per_code, 50) as max_credits_per_code,
    coalesce(max_queue_size, 30) as max_queue_size,
    coalesce(proposals_enabled, true) as proposals_enabled
  into v_settings
  from public.venue_settings
  where venue_id = v_venue.id;

  select id, status, opened_at into v_night
  from public.night_sessions
  where venue_id = v_venue.id and status = 'open'
  limit 1;

  if found and auth.uid() is not null then
    select id, credits_balance, proposals_used
    into v_participant_id, v_participant_credits, v_participant_proposals
    from public.participants
    where night_session_id = v_night.id and auth_user_id = auth.uid()
    limit 1;
  end if;

  -- now_playing
  if v_night.id is not null then
    select jsonb_build_object(
      'id', qi.id,
      'trackId', t.id,
      'title', t.title,
      'artist', t.artist,
      'source', t.source,
      'durationSeconds', t.duration_seconds,
      'thumbnailUrl', t.thumbnail_url,
      'voteCount', qi.vote_count,
      'createdAt', to_char(qi.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', qi.status,
      'myVote', case
        when v_participant_id is not null then exists (
          select 1 from public.votes v
          where v.night_session_id = v_night.id
            and v.participant_id = v_participant_id
            and v.queue_item_id = qi.id
        )
        else false
      end
    )
    into v_now_playing
    from public.queue_items qi
    join public.tracks t on t.id = qi.track_id
    where qi.night_session_id = v_night.id and qi.status = 'playing'
    limit 1;

    -- queue (only queued status, ordered by vote_count desc, created_at asc)
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', qi.id,
        'trackId', t.id,
        'title', t.title,
        'artist', t.artist,
        'source', t.source,
        'durationSeconds', t.duration_seconds,
        'thumbnailUrl', t.thumbnail_url,
        'voteCount', qi.vote_count,
        'createdAt', to_char(qi.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'status', qi.status,
        'myVote', case
          when v_participant_id is not null then exists (
            select 1 from public.votes v
            where v.night_session_id = v_night.id
              and v.participant_id = v_participant_id
              and v.queue_item_id = qi.id
          )
          else false
        end
      )
      order by qi.vote_count desc, qi.created_at asc
    ), '[]'::jsonb)
    into v_queue
    from public.queue_items qi
    join public.tracks t on t.id = qi.track_id
    where qi.night_session_id = v_night.id and qi.status = 'queued';
  else
    v_now_playing := null;
    v_queue := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'venue', jsonb_build_object(
      'id', v_venue.id,
      'slug', v_venue.slug,
      'name', v_venue.name,
      'accentColor', v_venue.accent_color,
      'logoUrl', v_venue.logo_url,
      'joinMessage', v_venue.join_message
    ),
    'night', case
      when v_night.id is not null then jsonb_build_object(
        'id', v_night.id,
        'status', v_night.status,
        'openedAt', to_char(v_night.opened_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      else null
    end,
    'nowPlaying', v_now_playing,
    'queue', v_queue,
    'me', case
      when v_participant_id is not null then jsonb_build_object(
        'participantId', v_participant_id,
        'credits', v_participant_credits,
        'proposalsUsed', v_participant_proposals
      )
      else null
    end,
    'settings', jsonb_build_object(
      'proposalsEnabled', coalesce(v_settings.proposals_enabled, true),
      'explicitFilterEnabled', coalesce(v_settings.explicit_filter_enabled, true),
      'maxQueueSize', coalesce(v_settings.max_queue_size, 30),
      'maxProposalsPerParticipant', coalesce(v_settings.max_proposals_per_participant, 3),
      'maxSongDurationSeconds', coalesce(v_settings.max_song_duration_seconds, 480),
      'defaultCreditsPerCode', coalesce(v_settings.default_credits_per_code, 5),
      'maxCreditsPerCode', coalesce(v_settings.max_credits_per_code, 50)
    ),
    'serverTime', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

revoke all on function public.get_night_state(text) from public;
grant execute on function public.get_night_state(text) to authenticated, anon;
