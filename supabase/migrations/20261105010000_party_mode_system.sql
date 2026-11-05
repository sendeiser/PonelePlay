-- =============================================================================
-- Migration: Party Mode System (Fiestas, Jodas, Reuniones y Cumpleaños)
-- Adds venue_type ('bar' | 'party'), party_mode ('democratic' | 'hybrid_turbo' | 'party_games'),
-- configurable vote limits and queue thresholds, guest dedications and karaoke requests.
-- =============================================================================

-- 1. Extend venue_settings with Party Mode configuration columns
alter table public.venue_settings
  add column if not exists venue_type text not null default 'bar' check (venue_type in ('bar', 'party')),
  add column if not exists party_mode text not null default 'hybrid_turbo' check (party_mode in ('democratic', 'hybrid_turbo', 'party_games')),
  add column if not exists party_votes_per_guest integer not null default 0,
  add column if not exists party_min_votes_to_queue integer not null default 1,
  add column if not exists allow_dedications boolean not null default true,
  add column if not exists allow_guest_karaoke boolean not null default true,
  add column if not exists turbo_cooldown_seconds integer not null default 180;

-- 2. Extend queue_items with guest metadata (guest_name, dedication, is_karaoke)
alter table public.queue_items
  add column if not exists guest_name text,
  add column if not exists dedication text,
  add column if not exists is_karaoke boolean not null default false;

-- 3. RPC to update Party Mode configuration from Cabina / Ajustes
create or replace function public.update_party_settings(
  p_venue_slug text,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue record;
  v_settings record;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  update public.venue_settings
  set
    venue_type = coalesce(p_patch ->> 'venueType', venue_type),
    party_mode = coalesce(p_patch ->> 'partyMode', party_mode),
    party_votes_per_guest = greatest(0, coalesce((p_patch ->> 'votesPerGuest')::int, party_votes_per_guest)),
    party_min_votes_to_queue = greatest(1, coalesce((p_patch ->> 'minVotesToQueue')::int, party_min_votes_to_queue)),
    allow_dedications = coalesce((p_patch ->> 'allowDedications')::boolean, allow_dedications),
    allow_guest_karaoke = coalesce((p_patch ->> 'allowGuestKaraoke')::boolean, allow_guest_karaoke),
    turbo_cooldown_seconds = greatest(30, coalesce((p_patch ->> 'turboCooldownSeconds')::int, turbo_cooldown_seconds))
  where venue_id = v_venue.id
  returning * into v_settings;

  -- If party_min_votes_to_queue was lowered, promote any proposed items that now meet the threshold!
  if v_settings.venue_type = 'party' then
    update public.queue_items
    set status = 'queued'
    where venue_id = v_venue.id
      and status = 'proposed'
      and vote_count >= greatest(1, v_settings.party_min_votes_to_queue);
  end if;

  return jsonb_build_object(
    'ok', true,
    'partyConfig', jsonb_build_object(
      'venueType', v_settings.venue_type,
      'partyMode', v_settings.party_mode,
      'votesPerGuest', v_settings.party_votes_per_guest,
      'minVotesToQueue', v_settings.party_min_votes_to_queue,
      'allowDedications', v_settings.allow_dedications,
      'allowGuestKaraoke', v_settings.allow_guest_karaoke,
      'turboCooldownSeconds', v_settings.turbo_cooldown_seconds
    )
  );
end;
$$;

grant execute on function public.update_party_settings(text, jsonb) to authenticated, anon, service_role;

-- 4. RPC to reload/reset all guest votes in a Party session
create or replace function public.reset_party_guest_votes(
  p_venue_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue record;
  v_night record;
  v_settings record;
  v_new_credits int;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  select * into v_settings from public.venue_settings where venue_id = v_venue.id;
  select * into v_night from public.night_sessions
  where venue_id = v_venue.id and status = 'open'
  order by opened_at desc limit 1;

  v_new_credits := case
    when coalesce(v_settings.party_votes_per_guest, 0) > 0 then v_settings.party_votes_per_guest
    else 99999
  end;

  if v_night.id is not null then
    update public.participants
    set credits = v_new_credits
    where night_session_id = v_night.id;
  end if;

  return jsonb_build_object('ok', true, 'creditsResetTo', v_new_credits);
end;
$$;

grant execute on function public.reset_party_guest_votes(text) to authenticated, anon, service_role;

-- 5. RPC for Party Hybrid Mode Turbo Vote (+3 votes)
create or replace function public.cast_party_turbo_vote(
  p_queue_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_item record;
  v_settings record;
  v_threshold int;
  v_new_status text;
  v_new_votes int;
begin
  select * into v_item from public.queue_items where id = p_queue_item_id for update;
  if not found then
    return jsonb_build_object('error', 'item_not_found');
  end if;

  select * into v_settings from public.venue_settings where venue_id = v_item.venue_id;
  v_threshold := case
    when coalesce(v_settings.venue_type, 'bar') = 'party' then greatest(1, coalesce(v_settings.party_min_votes_to_queue, 1))
    else 5
  end;

  v_new_votes := v_item.vote_count + 3;
  v_new_status := case
    when v_item.status = 'proposed' and v_new_votes >= v_threshold then 'queued'
    else v_item.status
  end;

  update public.queue_items
  set vote_count = v_new_votes,
      status = v_new_status
  where id = p_queue_item_id;

  return jsonb_build_object(
    'itemId', v_item.id,
    'voteCount', v_new_votes,
    'status', v_new_status,
    'promotedToQueue', (v_item.status = 'proposed' and v_new_status = 'queued')
  );
end;
$$;

grant execute on function public.cast_party_turbo_vote(uuid) to authenticated, anon, service_role;

-- 6. Update propose_track_internal to support Party Mode (no cooldown, dynamic threshold, guest_name, dedication, is_karaoke)
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
  v_dedupe_key text;
  v_track_id uuid;
  v_queue_item_id uuid;
  v_title text;
  v_artist text;
  v_duration int;
  v_thumbnail text;
  v_video_id text;
  v_guest_name text;
  v_dedication text;
  v_is_karaoke boolean;
  v_elapsed_seconds int;
  v_is_party boolean;
  v_min_votes int;
  v_initial_status text;
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
    coalesce(max_queue_size, 50) as max_queue_size,
    coalesce(venue_type, 'bar') as venue_type,
    coalesce(party_min_votes_to_queue, 1) as party_min_votes_to_queue
  into v_settings
  from public.venue_settings
  where venue_id = v_participant.venue_id;

  v_is_party := (v_settings.venue_type = 'party');

  if not v_settings.proposals_enabled and not v_is_party then
    return jsonb_build_object('error', 'proposals_disabled');
  end if;

  -- Cooldown check ONLY applies in Bar mode (Party mode is unlocked)
  if not v_is_party and v_participant.last_proposed_at is not null then
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
  v_guest_name := nullif(trim(coalesce(p_track ->> 'guestName', '')), '');
  v_dedication := nullif(left(trim(coalesce(p_track ->> 'dedication', '')), 120), '');
  v_is_karaoke := coalesce((p_track ->> 'isKaraoke')::boolean, false);

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

  if exists (
    select 1 from public.queue_items
    where night_session_id = p_night_session_id
      and track_id = v_track_id
      and status in ('queued', 'playing', 'proposed')
  ) then
    return jsonb_build_object('error', 'duplicate_active', 'trackId', v_track_id);
  end if;

  v_min_votes := case when v_is_party then greatest(1, v_settings.party_min_votes_to_queue) else 5 end;
  v_initial_status := case when v_min_votes <= 1 then 'queued' else 'proposed' end;

  insert into public.queue_items (
    venue_id,
    night_session_id,
    track_id,
    status,
    vote_count,
    proposed_by_participant_id,
    guest_name,
    dedication,
    is_karaoke,
    created_at
  )
  values (
    v_participant.venue_id,
    p_night_session_id,
    v_track_id,
    v_initial_status,
    1,
    v_participant.id,
    v_guest_name,
    v_dedication,
    v_is_karaoke,
    now()
  )
  returning id into v_queue_item_id;

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
    'status', v_initial_status
  );
end;
$$;
