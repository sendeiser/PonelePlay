-- Migration: 2-minute free proposal cooldown and 5-vote threshold for queue promotion

-- 1. Ensure 'proposed' exists in public.queue_status enum
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.queue_status'::regtype
      and enumlabel = 'proposed'
  ) then
    alter type public.queue_status add value 'proposed';
  end if;
end $$;

-- 2. Add last_proposed_at column to participants if not exists
alter table public.participants
add column if not exists last_proposed_at timestamptz;

-- 3. Update propose_track_internal to enforce 2-minute cooldown per participant and insert as 'proposed' with 1 vote
create or replace function public.propose_track_internal(
  p_participant_id uuid,
  p_night_session_id uuid,
  p_track jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_participant record;
  v_night record;
  v_settings record;
  v_queue_size int;
  v_dedupe_key text;
  v_track_id uuid;
  v_queue_item_id uuid;
  v_title text;
  v_artist text;
  v_duration int;
  v_thumbnail text;
  v_video_id text;
  v_elapsed_seconds int;
begin
  select
    p.id,
    p.venue_id,
    p.proposals_used,
    p.last_proposed_at
  into v_participant
  from public.participants p
  where p.id = p_participant_id and p.night_session_id = p_night_session_id
  for update;

  if not found then
    return jsonb_build_object('error', 'night_closed');
  end if;

  select id, status into v_night
  from public.night_sessions
  where id = p_night_session_id;

  if not found or v_night.status <> 'open' then
    return jsonb_build_object('error', 'night_closed');
  end if;

  select
    coalesce(proposals_enabled, true) as proposals_enabled,
    coalesce(max_queue_size, 50) as max_queue_size
  into v_settings
  from public.venue_settings
  where venue_id = v_participant.venue_id;

  if not v_settings.proposals_enabled then
    return jsonb_build_object('error', 'proposals_disabled');
  end if;

  -- 2-Minute Cooldown Check (120 seconds between proposals)
  if v_participant.last_proposed_at is not null then
    v_elapsed_seconds := extract(epoch from (now() - v_participant.last_proposed_at))::int;
    if v_elapsed_seconds < 120 then
      return jsonb_build_object(
        'error', 'cooldown_active',
        'remainingSeconds', (120 - v_elapsed_seconds)
      );
    end if;
  end if;

  v_title := trim(p_track ->> 'title');
  v_artist := trim(coalesce(p_track ->> 'artist', ''));
  v_duration := coalesce((p_track ->> 'durationSeconds')::int, 210);
  v_thumbnail := p_track ->> 'thumbnailUrl';
  v_video_id := p_track ->> 'youtubeVideoId';
  v_dedupe_key := coalesce(p_track ->> 'dedupeKey', 'yt:' || coalesce(v_video_id, v_title));

  -- Get or insert track
  select id into v_track_id
  from public.tracks
  where venue_id = v_participant.venue_id and dedupe_key = v_dedupe_key
  limit 1;

  if not found then
    insert into public.tracks (
      venue_id,
      source,
      title,
      artist,
      duration_seconds,
      thumbnail_url,
      youtube_video_id,
      dedupe_key,
      created_by_kind,
      created_by_participant_id
    )
    values (
      v_participant.venue_id,
      'youtube',
      v_title,
      v_artist,
      v_duration,
      v_thumbnail,
      v_video_id,
      v_dedupe_key,
      'client',
      v_participant.id
    )
    returning id into v_track_id;
  end if;

  -- Check if already active in queue or candidates
  if exists (
    select 1 from public.queue_items
    where night_session_id = p_night_session_id
      and track_id = v_track_id
      and status in ('queued', 'playing', 'proposed')
  ) then
    return jsonb_build_object('error', 'duplicate_active', 'trackId', v_track_id);
  end if;

  -- Insert as 'proposed' with initial vote_count = 1
  insert into public.queue_items (
    venue_id,
    night_session_id,
    track_id,
    status,
    vote_count,
    proposed_by_participant_id,
    created_at
  )
  values (
    v_participant.venue_id,
    p_night_session_id,
    v_track_id,
    'proposed',
    1,
    v_participant.id,
    now()
  )
  returning id into v_queue_item_id;

  -- Register proposer's initial vote
  insert into public.votes (
    venue_id,
    night_session_id,
    participant_id,
    queue_item_id,
    track_id,
    created_at
  )
  values (
    v_participant.venue_id,
    p_night_session_id,
    v_participant.id,
    v_queue_item_id,
    v_track_id,
    now()
  );

  -- Update participant cooldown and count
  update public.participants
  set proposals_used = proposals_used + 1,
      last_proposed_at = now(),
      last_seen_at = now()
  where id = v_participant.id;

  return jsonb_build_object(
    'itemId', v_queue_item_id,
    'trackId', v_track_id,
    'duplicate', false,
    'voteCount', 1,
    'status', 'proposed'
  );
end;
$$;

-- 4. Update cast_vote to support 'proposed' items and promote to 'queued' when reaching 5 votes
create or replace function public.cast_vote(p_queue_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_participant record;
  v_item record;
  v_new_balance int;
  v_new_votes int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'night_closed');
  end if;

  select
    p.id,
    p.venue_id,
    p.night_session_id,
    p.credits_balance
  into v_participant
  from public.participants p
  join public.night_sessions ns on ns.id = p.night_session_id
  where p.auth_user_id = auth.uid() and ns.status = 'open'
  order by p.created_at desc
  limit 1
  for update of p;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'night_closed');
  end if;

  if v_participant.credits_balance < 1 then
    return jsonb_build_object('ok', false, 'error', 'no_credits');
  end if;

  select
    qi.id,
    qi.track_id,
    qi.status,
    qi.vote_count,
    qi.night_session_id
  into v_item
  from public.queue_items qi
  where qi.id = p_queue_item_id and qi.night_session_id = v_participant.night_session_id
  for update of qi;

  if not found or v_item.status not in ('queued', 'proposed') then
    return jsonb_build_object('ok', false, 'error', 'item_closed');
  end if;

  if exists (
    select 1
    from public.votes
    where night_session_id = v_participant.night_session_id
      and participant_id = v_participant.id
      and track_id = v_item.track_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  insert into public.votes (
    venue_id,
    night_session_id,
    participant_id,
    queue_item_id,
    track_id,
    created_at
  )
  values (
    v_participant.venue_id,
    v_participant.night_session_id,
    v_participant.id,
    v_item.id,
    v_item.track_id,
    now()
  );

  v_new_balance := v_participant.credits_balance - 1;
  update public.participants
  set credits_balance = v_new_balance,
      last_seen_at = now()
  where id = v_participant.id;

  v_new_votes := v_item.vote_count + 1;

  -- 5-Vote Threshold: When reaching 5 votes, promote to active playback queue
  if v_item.status = 'proposed' and v_new_votes >= 5 then
    update public.queue_items
    set vote_count = v_new_votes,
        status = 'queued'
    where id = v_item.id;
  else
    update public.queue_items
    set vote_count = v_new_votes
    where id = v_item.id;
  end if;

  insert into public.credit_transactions (
    participant_id,
    delta,
    balance_after,
    reason,
    queue_item_id
  )
  values (
    v_participant.id,
    -1,
    v_new_balance,
    'vote',
    v_item.id
  );

  return jsonb_build_object(
    'ok', true,
    'voteCount', v_new_votes,
    'balance', v_new_balance,
    'promoted', (v_item.status = 'proposed' and v_new_votes >= 5)
  );
end;
$$;

-- 5. Update get_night_state to return both active queue (queued & 5+ votes) and candidates (proposed)
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
  v_candidates jsonb;
  v_me jsonb;
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

  v_me := null;
  if found and auth.uid() is not null then
    select id, credits_balance, proposals_used into v_participant
    from public.participants
    where night_session_id = v_night.id and auth_user_id = auth.uid()
    limit 1;

    if found then
      v_participant_id := v_participant.id;
      v_me := jsonb_build_object(
        'participantId', v_participant.id,
        'credits', v_participant.credits_balance,
        'proposalsUsed', v_participant.proposals_used
      );
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
      'youtubeVideoId', t.youtube_video_id,
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

    -- Active Playback Queue: only items with status = 'queued'
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', qi.id,
        'trackId', t.id,
        'title', t.title,
        'artist', t.artist,
        'source', t.source,
        'durationSeconds', t.duration_seconds,
        'youtubeVideoId', t.youtube_video_id,
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

    -- Candidate Proposals List: items with status = 'proposed' (< 5 votes)
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', qi.id,
        'trackId', t.id,
        'title', t.title,
        'artist', t.artist,
        'source', t.source,
        'durationSeconds', t.duration_seconds,
        'youtubeVideoId', t.youtube_video_id,
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
    into v_candidates
    from public.queue_items qi
    join public.tracks t on t.id = qi.track_id
    where qi.night_session_id = v_night.id and qi.status = 'proposed';
  else
    v_now_playing := null;
    v_queue := '[]'::jsonb;
    v_candidates := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'venue', jsonb_build_object(
      'id', v_venue.id,
      'slug', v_venue.slug,
      'name', v_venue.name,
      'accentColor', coalesce(v_venue.accent_color, '#6366F1'),
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
    'candidates', v_candidates,
    'me', v_me,
    'settings', jsonb_build_object(
      'proposalsEnabled', v_settings.proposals_enabled,
      'explicitFilterEnabled', v_settings.explicit_filter_enabled,
      'maxQueueSize', v_settings.max_queue_size,
      'maxProposalsPerParticipant', v_settings.max_proposals_per_participant,
      'maxSongDurationSeconds', v_settings.max_song_duration_seconds,
      'defaultCreditsPerCode', v_settings.default_credits_per_code,
      'maxCreditsPerCode', v_settings.max_credits_per_code
    ),
    'serverTime', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

