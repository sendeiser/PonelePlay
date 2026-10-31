-- Night Lifecycle RPCs: join_night, get_night_state, owner_open_night, owner_close_night

-- 1. join_night
create or replace function public.join_night(p_venue_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue record;
  v_night record;
  v_auth_uid uuid;
  v_participant record;
begin
  select id, name, slug into v_venue
  from public.venues
  where slug = p_venue_slug;

  if not found then
    raise exception 'venue_not_found';
  end if;

  select id into v_night
  from public.night_sessions
  where venue_id = v_venue.id and status = 'open'
  limit 1;

  if not found then
    raise exception 'night_closed';
  end if;

  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.participants (
    venue_id,
    night_session_id,
    auth_user_id,
    credits_balance,
    proposals_used,
    last_seen_at
  )
  values (
    v_venue.id,
    v_night.id,
    v_auth_uid,
    0,
    0,
    now()
  )
  on conflict (night_session_id, auth_user_id) do update
  set last_seen_at = now()
  returning id, credits_balance, proposals_used into v_participant;

  return jsonb_build_object(
    'participantId', v_participant.id,
    'credits', v_participant.credits_balance,
    'proposalsUsed', v_participant.proposals_used
  );
end;
$$;

revoke all on function public.join_night(text) from public;
grant execute on function public.join_night(text) to authenticated, anon;


-- 2. get_night_state
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
  v_participant_id uuid;
  v_participant record;
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
    select id, credits_balance, proposals_used into v_participant
    from public.participants
    where night_session_id = v_night.id and auth_user_id = auth.uid()
    limit 1;

    if found then
      v_participant_id := v_participant.id;
    end if;
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
      when v_participant.id is not null then jsonb_build_object(
        'participantId', v_participant.id,
        'credits', v_participant.credits_balance,
        'proposalsUsed', v_participant.proposals_used
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


-- 3. owner_open_night
create or replace function public.owner_open_night()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue_id uuid;
  v_night_id uuid;
begin
  select id into v_venue_id
  from public.venues
  where owner_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'venue_not_found';
  end if;

  if exists (
    select 1 from public.night_sessions
    where venue_id = v_venue_id and status = 'open'
  ) then
    raise exception 'night_already_open';
  end if;

  insert into public.night_sessions (
    venue_id,
    status,
    opened_by_kind,
    opened_by_id,
    opened_at
  )
  values (
    v_venue_id,
    'open',
    'owner',
    auth.uid(),
    now()
  )
  returning id into v_night_id;

  insert into public.staff_actions (
    venue_id,
    night_session_id,
    actor_kind,
    actor_id,
    action,
    payload
  )
  values (
    v_venue_id,
    v_night_id,
    'owner',
    auth.uid(),
    'open_night',
    jsonb_build_object('nightId', v_night_id)
  );

  return jsonb_build_object(
    'nightId', v_night_id,
    'status', 'open'
  );
end;
$$;

revoke all on function public.owner_open_night() from public;
grant execute on function public.owner_open_night() to authenticated;


-- 4. owner_close_night
create or replace function public.owner_close_night()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue_id uuid;
  v_night_id uuid;
begin
  select id into v_venue_id
  from public.venues
  where owner_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'venue_not_found';
  end if;

  select id into v_night_id
  from public.night_sessions
  where venue_id = v_venue_id and status = 'open'
  for update;

  if not found then
    raise exception 'night_not_open';
  end if;

  update public.night_sessions
  set status = 'closed',
      closed_at = now()
  where id = v_night_id;

  update public.vote_codes
  set status = 'expired'
  where night_session_id = v_night_id and status = 'active';

  insert into public.credit_transactions (
    participant_id,
    delta,
    balance_after,
    reason
  )
  select
    id,
    -credits_balance,
    0,
    'night_close'::public.credit_reason
  from public.participants
  where night_session_id = v_night_id and credits_balance > 0;

  update public.participants
  set credits_balance = 0
  where night_session_id = v_night_id and credits_balance > 0;

  insert into public.staff_actions (
    venue_id,
    night_session_id,
    actor_kind,
    actor_id,
    action,
    payload
  )
  values (
    v_venue_id,
    v_night_id,
    'owner',
    auth.uid(),
    'close_night',
    jsonb_build_object('nightId', v_night_id)
  );

  return jsonb_build_object(
    'nightId', v_night_id,
    'status', 'closed'
  );
end;
$$;

revoke all on function public.owner_close_night() from public;
grant execute on function public.owner_close_night() to authenticated;

