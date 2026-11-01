-- Propose Track RPC and Proposal Logic

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
begin
  select
    p.id,
    p.venue_id,
    p.proposals_used
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
    coalesce(max_queue_size, 30) as max_queue_size,
    coalesce(max_proposals_per_participant, 3) as max_proposals_per_participant
  into v_settings
  from public.venue_settings
  where venue_id = v_participant.venue_id;

  if not v_settings.proposals_enabled then
    return jsonb_build_object('error', 'proposals_disabled');
  end if;

  if v_participant.proposals_used >= v_settings.max_proposals_per_participant then
    return jsonb_build_object('error', 'proposal_limit');
  end if;

  select count(*)::int into v_queue_size
  from public.queue_items
  where night_session_id = p_night_session_id and status = 'queued';

  if v_queue_size >= v_settings.max_queue_size then
    return jsonb_build_object('error', 'queue_full');
  end if;

  v_title := p_track ->> 'title';
  v_artist := coalesce(p_track ->> 'artist', '');
  v_duration := (p_track ->> 'durationSeconds')::int;
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

  -- Check active duplicate in queue
  if exists (
    select 1 from public.queue_items
    where night_session_id = p_night_session_id
      and track_id = v_track_id
      and status in ('queued', 'playing')
  ) then
    return jsonb_build_object('error', 'duplicate_active', 'trackId', v_track_id);
  end if;

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
    'queued',
    0,
    v_participant.id,
    now()
  )
  returning id into v_queue_item_id;

  update public.participants
  set proposals_used = proposals_used + 1,
      last_seen_at = now()
  where id = v_participant.id;

  insert into public.staff_actions (
    venue_id,
    night_session_id,
    actor_kind,
    actor_id,
    action,
    payload
  )
  values (
    v_participant.venue_id,
    p_night_session_id,
    'system',
    null,
    'propose_track',
    jsonb_build_object(
      'participantId', v_participant.id,
      'trackId', v_track_id,
      'queueItemId', v_queue_item_id,
      'title', v_title
    )
  );

  return jsonb_build_object(
    'itemId', v_queue_item_id,
    'trackId', v_track_id,
    'duplicate', false,
    'voteCount', 0
  );
end;
$$;

revoke all on function public.propose_track_internal(uuid, uuid, jsonb) from public;
grant execute on function public.propose_track_internal(uuid, uuid, jsonb) to authenticated, anon;


create or replace function public.propose_track(p_track jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_participant record;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'night_closed');
  end if;

  select
    p.id,
    p.night_session_id
  into v_participant
  from public.participants p
  join public.night_sessions ns on ns.id = p.night_session_id
  where p.auth_user_id = auth.uid() and ns.status = 'open'
  order by p.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('error', 'night_closed');
  end if;

  return public.propose_track_internal(
    v_participant.id,
    v_participant.night_session_id,
    p_track
  );
end;
$$;

revoke all on function public.propose_track(jsonb) from public;
grant execute on function public.propose_track(jsonb) to authenticated, anon;

