-- Migration: 20261112173000_sync_voting_rounds_and_party_schema.sql
-- Description: Synchronize voting rounds, Party Mode columns/RPCs, TV display controls,
-- and track deletion safely against the live schema and nightStateSchema Zod contract.

-- 1. Ensure enum and columns exist cleanly
alter type public.queue_status add value if not exists 'proposed';

alter table public.participants
  add column if not exists last_proposed_at timestamptz;

alter table public.venue_settings
  add column if not exists voting_round_seconds integer not null default 180
    check (voting_round_seconds between 30 and 1800),
  add column if not exists voting_rounds_enabled boolean not null default true,
  add column if not exists venue_type text not null default 'bar'
    check (venue_type in ('bar', 'party')),
  add column if not exists party_mode text not null default 'hybrid_turbo'
    check (party_mode in ('democratic', 'hybrid_turbo', 'party_games')),
  add column if not exists party_votes_per_guest integer not null default 0,
  add column if not exists party_min_votes_to_queue integer not null default 1,
  add column if not exists allow_dedications boolean not null default true,
  add column if not exists allow_guest_karaoke boolean not null default true,
  add column if not exists turbo_cooldown_seconds integer not null default 180;

alter table public.night_sessions
  add column if not exists current_round_started_at timestamptz not null default now(),
  add column if not exists current_round_number integer not null default 1;

alter table public.player_devices
  add column if not exists display_config jsonb default '{"mode":"VIDEO","showQueue":true,"showProposals":true,"theme":"neon","scale":"normal"}'::jsonb;

alter table public.queue_items
  add column if not exists guest_name text,
  add column if not exists dedication text,
  add column if not exists is_karaoke boolean not null default false;

-- Backfill venue_settings Party Mode columns from authoritative __party_config__ if present
update public.venue_settings vs
set
  venue_type = case when (vp.description::jsonb ->> 'venueType') = 'party' then 'party' else vs.venue_type end,
  party_mode = case when (vp.description::jsonb ->> 'partyMode') in ('democratic', 'hybrid_turbo', 'party_games') then (vp.description::jsonb ->> 'partyMode') else vs.party_mode end,
  party_votes_per_guest = greatest(0, coalesce((vp.description::jsonb ->> 'votesPerGuest')::int, vs.party_votes_per_guest)),
  party_min_votes_to_queue = greatest(1, coalesce((vp.description::jsonb ->> 'minVotesToQueue')::int, vs.party_min_votes_to_queue)),
  allow_dedications = coalesce((vp.description::jsonb ->> 'allowDedications')::boolean, vs.allow_dedications),
  allow_guest_karaoke = coalesce((vp.description::jsonb ->> 'allowGuestKaraoke')::boolean, vs.allow_guest_karaoke),
  turbo_cooldown_seconds = greatest(30, coalesce((vp.description::jsonb ->> 'turboCooldownSeconds')::int, vs.turbo_cooldown_seconds))
from public.venue_playlists vp
where vp.venue_id = vs.venue_id
  and vp.name = '__party_config__'
  and vp.description is not null
  and vp.description like '{%';

-- 2. Helper to resolve the effective vote threshold identically to resolveEffectiveQueueThreshold
create or replace function public.get_effective_vote_threshold(p_venue_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_cfg_text text;
  v_cfg jsonb := null;
  v_venue_type text := 'bar';
  v_min_votes int := 5;
begin
  select venue_type, party_min_votes_to_queue
  into v_settings
  from public.venue_settings
  where venue_id = p_venue_id
  limit 1;

  select description into v_cfg_text
  from public.venue_playlists
  where venue_id = p_venue_id and name = '__party_config__'
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if v_cfg_text is not null and v_cfg_text <> '' then
    begin
      v_cfg := v_cfg_text::jsonb;
    exception when others then
      v_cfg := null;
    end;
  end if;

  v_venue_type := coalesce(nullif(v_cfg ->> 'venueType', ''), v_settings.venue_type, 'bar');

  if v_venue_type <> 'party' then
    return 5;
  end if;

  begin
    v_min_votes := coalesce((v_cfg ->> 'minVotesToQueue')::int, v_settings.party_min_votes_to_queue, 1);
  exception when others then
    v_min_votes := coalesce(v_settings.party_min_votes_to_queue, 1);
  end;

  return greatest(1, v_min_votes);
end;
$$;

-- 3. Stored procedure to resolve a voting round (called manually via "Resolver Ronda" or automatically when expired)
create or replace function public.resolve_voting_round(
  p_venue_slug text,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue record;
  v_night record;
  v_settings record;
  v_top_candidate record;
  v_elapsed_seconds int;
  v_round_duration int;
  v_threshold int;
  v_promoted_votes int;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  -- Lock the active night session row to avoid double-promotion under concurrent polling
  select * into v_night from public.night_sessions
  where venue_id = v_venue.id and status = 'open'
  order by opened_at desc limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_active_night');
  end if;

  select * into v_settings from public.venue_settings where venue_id = v_venue.id;
  v_round_duration := coalesce(v_settings.voting_round_seconds, 180);
  v_threshold := public.get_effective_vote_threshold(v_venue.id);

  v_elapsed_seconds := extract(epoch from (now() - coalesce(v_night.current_round_started_at, v_night.opened_at, now())))::int;

  if not p_force and v_elapsed_seconds < v_round_duration then
    return jsonb_build_object(
      'ok', true,
      'resolved', false,
      'roundNumber', coalesce(v_night.current_round_number, 1),
      'remainingSeconds', greatest(0, v_round_duration - v_elapsed_seconds)
    );
  end if;

  -- Pick top pending candidate across both 'proposed' and pre-queue ('queued' with 0 < vote_count < threshold)
  select qi.*, t.title, t.artist
  into v_top_candidate
  from public.queue_items qi
  join public.tracks t on t.id = qi.track_id
  where qi.night_session_id = v_night.id
    and (
      qi.status::text = 'proposed'
      or (qi.status = 'queued' and qi.vote_count > 0 and qi.vote_count < v_threshold)
    )
  order by qi.vote_count desc, qi.created_at asc
  limit 1
  for update of qi;

  if found then
    v_promoted_votes := greatest(v_top_candidate.vote_count, v_threshold);

    update public.queue_items
    set status = 'queued',
        vote_count = v_promoted_votes
    where id = v_top_candidate.id;

    update public.night_sessions
    set current_round_started_at = now(),
        current_round_number = coalesce(current_round_number, 1) + 1
    where id = v_night.id;

    return jsonb_build_object(
      'ok', true,
      'resolved', true,
      'promoted', true,
      'promotedItem', jsonb_build_object(
        'id', v_top_candidate.id,
        'title', v_top_candidate.title,
        'artist', v_top_candidate.artist,
        'voteCount', v_promoted_votes
      ),
      'nextRoundNumber', coalesce(v_night.current_round_number, 1) + 1,
      'durationSeconds', v_round_duration
    );
  else
    update public.night_sessions
    set current_round_started_at = now()
    where id = v_night.id;

    return jsonb_build_object(
      'ok', true,
      'resolved', true,
      'promoted', false,
      'reason', 'no_candidates',
      'roundNumber', coalesce(v_night.current_round_number, 1),
      'durationSeconds', v_round_duration
    );
  end if;
end;
$$;

grant execute on function public.resolve_voting_round(text, boolean) to anon, authenticated, service_role;

-- 4. Update get_night_state matching nightStateSchema Zod contract and real columns
create or replace function public.get_night_state(p_venue_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue record;
  v_night record;
  v_settings record;
  v_participant_id uuid := null;
  v_participant record;
  v_me jsonb := null;
  v_now_playing jsonb := null;
  v_queue jsonb := '[]'::jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_player_last_seen timestamptz := null;
  v_playback record;
  v_round_duration int := 180;
  v_round_elapsed int := 0;
  v_threshold int := 5;
  v_top_cand_id uuid := null;
  v_cand_count int := 0;
begin
  select id, slug, name, accent_color, logo_url, join_message
  into v_venue
  from public.venues
  where slug = p_venue_slug
  limit 1;

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
    coalesce(proposals_enabled, true) as proposals_enabled,
    coalesce(voting_round_seconds, 180) as voting_round_seconds,
    coalesce(voting_rounds_enabled, true) as voting_rounds_enabled
  into v_settings
  from public.venue_settings
  where venue_id = v_venue.id
  limit 1;

  select * into v_night
  from public.night_sessions
  where venue_id = v_venue.id and status = 'open'
  order by opened_at desc
  limit 1;

  select max(last_seen_at) into v_player_last_seen
  from public.player_devices
  where venue_id = v_venue.id and revoked_at is null;

  select * into v_playback
  from public.venue_playback_state
  where venue_id = v_venue.id
  limit 1;

  v_threshold := public.get_effective_vote_threshold(v_venue.id);

  if v_night.id is not null then
    v_round_duration := coalesce(v_settings.voting_round_seconds, 180);
    v_round_elapsed := extract(epoch from (now() - coalesce(v_night.current_round_started_at, v_night.opened_at, now())))::int;

    if coalesce(v_settings.voting_rounds_enabled, true) and v_round_elapsed >= v_round_duration then
      perform public.resolve_voting_round(p_venue_slug, false);
      select * into v_night from public.night_sessions where id = v_night.id;
      v_round_elapsed := extract(epoch from (now() - coalesce(v_night.current_round_started_at, v_night.opened_at, now())))::int;
    end if;

    if auth.uid() is not null then
      select id, credits_balance, proposals_used, last_proposed_at
      into v_participant
      from public.participants
      where night_session_id = v_night.id and auth_user_id = auth.uid()
      limit 1;

      if found then
        v_participant_id := v_participant.id;
        v_me := jsonb_build_object(
          'participantId', v_participant.id,
          'credits', v_participant.credits_balance,
          'proposalsUsed', v_participant.proposals_used,
          'lastProposedAt', case
            when v_participant.last_proposed_at is not null
            then to_char(v_participant.last_proposed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            else null
          end
        );
      end if;
    end if;

    -- Currently playing item
    select jsonb_build_object(
      'id', qi.id,
      'trackId', t.id,
      'title', t.title,
      'artist', t.artist,
      'source', t.source,
      'durationSeconds', t.duration_seconds,
      'youtubeVideoId', t.youtube_video_id,
      'thumbnailUrl', t.thumbnail_url,
      'voteCount', greatest(0, case when qi.vote_count >= 9999 then 0 else qi.vote_count end),
      'createdAt', to_char(coalesce(qi.started_at, qi.created_at, now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', qi.status,
      'guestName', qi.guest_name,
      'dedication', qi.dedication,
      'isKaraoke', coalesce(qi.is_karaoke, false),
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

    if v_now_playing is null and v_playback.current_track is not null and nullif(v_playback.current_track ->> 'title', '') is not null then
      v_now_playing := jsonb_build_object(
        'id', coalesce(v_playback.current_track ->> 'itemId', 'now-playing-manual'),
        'trackId', coalesce(v_playback.current_track ->> 'trackId', '00000000-0000-0000-0000-000000000000'),
        'title', v_playback.current_track ->> 'title',
        'artist', coalesce(v_playback.current_track ->> 'artist', 'YouTube'),
        'source', case
          when (v_playback.current_track ->> 'source') in ('youtube', 'upload', 'spotify')
          then (v_playback.current_track ->> 'source')
          else 'youtube'
        end,
        'durationSeconds', coalesce((v_playback.current_track ->> 'durationSeconds')::int, 210),
        'youtubeVideoId', v_playback.current_track ->> 'youtubeVideoId',
        'thumbnailUrl', v_playback.current_track ->> 'thumbnailUrl',
        'voteCount', greatest(0, case
          when coalesce((v_playback.current_track ->> 'voteCount')::int, 0) >= 9999 then 0
          else coalesce((v_playback.current_track ->> 'voteCount')::int, 0)
        end),
        'createdAt', to_char(coalesce(v_playback.updated_at, now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'status', 'playing',
        'myVote', false
      );
    end if;

    -- Queued items (partitioned on client/server cleanly by partitionQueueAndProposals)
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
        'voteCount', greatest(0, case when qi.vote_count >= 9999 then 0 else qi.vote_count end),
        'createdAt', to_char(qi.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'status', qi.status,
        'guestName', qi.guest_name,
        'dedication', qi.dedication,
        'isKaraoke', coalesce(qi.is_karaoke, false),
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

    -- Proposed candidate items
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
        'voteCount', greatest(0, qi.vote_count),
        'createdAt', to_char(qi.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'status', qi.status,
        'guestName', qi.guest_name,
        'dedication', qi.dedication,
        'isKaraoke', coalesce(qi.is_karaoke, false),
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
    where qi.night_session_id = v_night.id and qi.status::text = 'proposed';

    select qi.id
    into v_top_cand_id
    from public.queue_items qi
    where qi.night_session_id = v_night.id
      and (
        qi.status::text = 'proposed'
        or (qi.status = 'queued' and qi.vote_count > 0 and qi.vote_count < v_threshold)
      )
    order by qi.vote_count desc, qi.created_at asc
    limit 1;

    select count(*)::int
    into v_cand_count
    from public.queue_items qi
    where qi.night_session_id = v_night.id
      and (
        qi.status::text = 'proposed'
        or (qi.status = 'queued' and qi.vote_count > 0 and qi.vote_count < v_threshold)
      );
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
    'queue', coalesce(v_queue, '[]'::jsonb),
    'candidates', coalesce(v_candidates, '[]'::jsonb),
    'votingRound', case
      when v_night.id is not null then jsonb_build_object(
        'enabled', coalesce(v_settings.voting_rounds_enabled, true),
        'durationSeconds', v_round_duration,
        'roundNumber', greatest(1, coalesce(v_night.current_round_number, 1)),
        'startedAt', to_char(coalesce(v_night.current_round_started_at, v_night.opened_at, now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'remainingSeconds', greatest(0, v_round_duration - v_round_elapsed),
        'topCandidateId', v_top_cand_id,
        'totalCandidates', coalesce(v_cand_count, 0)
      )
      else null
    end,
    'me', v_me,
    'settings', jsonb_build_object(
      'proposalsEnabled', coalesce(v_settings.proposals_enabled, true),
      'explicitFilterEnabled', coalesce(v_settings.explicit_filter_enabled, true),
      'maxQueueSize', greatest(1, coalesce(v_settings.max_queue_size, 30)),
      'maxProposalsPerParticipant', greatest(0, coalesce(v_settings.max_proposals_per_participant, 3)),
      'maxSongDurationSeconds', greatest(1, coalesce(v_settings.max_song_duration_seconds, 480)),
      'defaultCreditsPerCode', greatest(1, coalesce(v_settings.default_credits_per_code, 5)),
      'maxCreditsPerCode', greatest(1, coalesce(v_settings.max_credits_per_code, 50))
    ),
    'player', case
      when v_player_last_seen is not null then jsonb_build_object(
        'lastSeenAt', to_char(v_player_last_seen, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      else null
    end,
    'serverTime', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

revoke all on function public.get_night_state(text) from public;
grant execute on function public.get_night_state(text) to authenticated, anon, service_role;

-- 5. Update Party Mode RPCs & vote/proposal RPCs safely
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

  if v_settings.venue_type = 'party' then
    update public.queue_items
    set status = 'queued'
    where venue_id = v_venue.id
      and status::text = 'proposed'
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
    set credits_balance = v_new_credits
    where night_session_id = v_night.id;
  end if;

  return jsonb_build_object('ok', true, 'creditsResetTo', v_new_credits);
end;
$$;

grant execute on function public.reset_party_guest_votes(text) to authenticated, anon, service_role;

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
  v_threshold int;
  v_base_votes int;
  v_new_status text;
  v_new_votes int;
begin
  select * into v_item from public.queue_items where id = p_queue_item_id for update;
  if not found then
    return jsonb_build_object('error', 'item_not_found');
  end if;

  v_threshold := public.get_effective_vote_threshold(v_item.venue_id);
  v_base_votes := case when v_item.vote_count >= 9999 or v_item.vote_count < 0 then 0 else v_item.vote_count end;
  v_new_votes := v_base_votes + 3;
  v_new_status := case
    when v_item.status::text = 'proposed' and v_new_votes >= v_threshold then 'queued'
    else v_item.status::text
  end;

  update public.queue_items
  set vote_count = v_new_votes,
      status = v_new_status::public.queue_status
  where id = p_queue_item_id;

  return jsonb_build_object(
    'itemId', v_item.id,
    'voteCount', v_new_votes,
    'status', v_new_status,
    'promotedToQueue', (v_item.status::text = 'proposed' and v_new_status = 'queued')
  );
end;
$$;

grant execute on function public.cast_party_turbo_vote(uuid) to authenticated, anon, service_role;

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
  v_base_votes int;
  v_threshold int;
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

  if not found or v_item.status::text not in ('queued', 'proposed') then
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

  v_threshold := public.get_effective_vote_threshold(v_participant.venue_id);
  v_base_votes := case when v_item.vote_count >= 9999 or v_item.vote_count < 0 then 0 else v_item.vote_count end;
  v_new_votes := v_base_votes + 1;

  if v_item.status::text = 'proposed' and v_new_votes >= v_threshold then
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
    'promoted', (v_item.status::text = 'proposed' and v_new_votes >= v_threshold)
  );
end;
$$;

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
    coalesce(venue_type, 'bar') as venue_type
  into v_settings
  from public.venue_settings
  where venue_id = v_participant.venue_id;

  v_min_votes := public.get_effective_vote_threshold(v_participant.venue_id);
  v_is_party := (v_settings.venue_type = 'party');

  if not v_settings.proposals_enabled and not v_is_party then
    return jsonb_build_object('error', 'proposals_disabled');
  end if;

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
      and status::text in ('queued', 'playing', 'proposed')
  ) then
    return jsonb_build_object('error', 'duplicate_active', 'trackId', v_track_id);
  end if;

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
    v_initial_status::public.queue_status,
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

-- 6. TV Display Controls RPCs + Owner Delete Track RPC
create or replace function public.list_venue_player_devices(
  p_venue_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue record;
  v_devices jsonb;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pd.id,
        'name', pd.name,
        'createdAt', pd.created_at,
        'lastSeenAt', pd.last_seen_at,
        'revokedAt', pd.revoked_at,
        'isOnline', case when pd.last_seen_at > now() - interval '2 minutes' then true else false end,
        'displayConfig', coalesce(pd.display_config, '{"mode":"VIDEO","showQueue":true,"showProposals":true,"theme":"neon","scale":"normal"}'::jsonb)
      ) order by pd.created_at desc
    ),
    '[]'::jsonb
  ) into v_devices
  from public.player_devices pd
  where pd.venue_id = v_venue.id and pd.revoked_at is null;

  return jsonb_build_object(
    'ok', true,
    'devices', v_devices
  );
end;
$$;

grant execute on function public.list_venue_player_devices(text) to authenticated, anon, service_role;

create or replace function public.update_tv_device_display(
  p_venue_slug text,
  p_device_id uuid default null,
  p_display_config jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue record;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  if p_device_id is not null then
    update public.player_devices
    set display_config = coalesce(display_config, '{}'::jsonb) || p_display_config
    where venue_id = v_venue.id and id = p_device_id;
  else
    update public.player_devices
    set display_config = coalesce(display_config, '{}'::jsonb) || p_display_config
    where venue_id = v_venue.id and revoked_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deviceId', p_device_id,
    'displayConfig', p_display_config
  );
end;
$$;

grant execute on function public.update_tv_device_display(text, uuid, jsonb) to authenticated, anon, service_role;

create or replace function public.owner_delete_track(p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_track record;
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  select t.id, t.venue_id, v.owner_id
  into v_track
  from public.tracks t
  join public.venues v on v.id = t.venue_id
  where t.id = p_track_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'track_not_found');
  end if;

  if v_role <> 'service_role' and (auth.uid() is null or auth.uid() <> v_track.owner_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  delete from public.queue_items where track_id = p_track_id;
  delete from public.fallback_tracks where track_id = p_track_id;
  delete from public.playlist_tracks where track_id = p_track_id;
  delete from public.votes where track_id = p_track_id;
  delete from public.tracks where id = p_track_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.owner_delete_track(uuid) to authenticated, service_role;

-- 7. Clean up legacy 99999 votes and keep send_playback_command consistent with threshold filtering
update public.queue_items
set vote_count = 0
where vote_count >= 9999;

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
  v_new_paused boolean;
  v_new_volume int;
  v_new_muted boolean;
  v_new_karaoke boolean;
  v_new_current_track jsonb;
  v_track jsonb;
  v_track_id uuid;
  v_item_id uuid;
  v_next_track record;
  v_threshold int;
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
  v_new_current_track := v_state.current_track;

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
      where venue_id = v_venue.id
        and ((youtube_video_id is not null and youtube_video_id = v_track->>'youtubeVideoId')
          or (lower(title) = lower(v_track->>'title') and lower(artist) = lower(coalesce(v_track->>'artist', ''))))
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

      v_new_current_track := jsonb_build_object(
        'itemId', 'manual-' || extract(epoch from now())::text,
        'trackId', v_track_id,
        'title', v_track->>'title',
        'artist', coalesce(v_track->>'artist', 'YouTube'),
        'source', 'youtube',
        'durationSeconds', coalesce((v_track->>'durationSeconds')::int, 210),
        'youtubeVideoId', v_track->>'youtubeVideoId',
        'thumbnailUrl', v_track->>'thumbnailUrl',
        'voteCount', 0,
        'isKaraoke', coalesce((v_track->>'isKaraoke')::boolean, false)
      );

      select * into v_night from public.night_sessions
      where venue_id = v_venue.id and status = 'open'
      order by opened_at desc limit 1;

      if v_night.id is not null then
        update public.queue_items set status = 'skipped', ended_at = now()
        where night_session_id = v_night.id and status = 'playing' and track_id != v_track_id;

        select id into v_item_id from public.queue_items
        where night_session_id = v_night.id and track_id = v_track_id and status in ('queued', 'playing')
        limit 1;

        if v_item_id is not null then
          update public.queue_items
          set status = 'playing', started_at = coalesce(started_at, now()), ended_at = null,
              vote_count = case when vote_count >= 9999 then 0 else vote_count end
          where id = v_item_id;
        else
          insert into public.queue_items (venue_id, night_session_id, track_id, proposed_by_participant_id, status, vote_count, started_at)
          values (v_venue.id, v_night.id, v_track_id, null, 'playing', 0, now())
          returning id into v_item_id;
        end if;
      end if;
    end if;
  elsif p_command = 'enqueue_top' then
    v_track := p_payload->'track';
    if v_track is not null and (v_track->>'title') is not null then
      select id into v_track_id from public.tracks
      where venue_id = v_venue.id
        and ((youtube_video_id is not null and youtube_video_id = v_track->>'youtubeVideoId')
          or (lower(title) = lower(v_track->>'title') and lower(artist) = lower(coalesce(v_track->>'artist', ''))))
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
        select id into v_item_id from public.queue_items
        where night_session_id = v_night.id and track_id = v_track_id and status in ('queued', 'playing')
        limit 1;

        if v_item_id is not null then
          update public.queue_items
          set status = 'queued',
              vote_count = case when vote_count >= 9999 then 0 else vote_count end
          where id = v_item_id;
        else
          insert into public.queue_items (venue_id, night_session_id, track_id, proposed_by_participant_id, status, vote_count)
          values (v_venue.id, v_night.id, v_track_id, null, 'queued', 0)
          returning id into v_item_id;
        end if;
      end if;
    end if;
  elsif p_command = 'skip' then
    select * into v_night from public.night_sessions
    where venue_id = v_venue.id and status = 'open'
    order by opened_at desc limit 1;

    if v_night.id is not null then
      update public.queue_items set status = 'skipped', ended_at = now()
      where night_session_id = v_night.id and status = 'playing';

      v_threshold := public.get_effective_vote_threshold(v_venue.id);

      select qi.id, t.id as track_id, t.title, t.artist, t.duration_seconds, t.thumbnail_url, t.youtube_video_id, qi.vote_count
      into v_next_track
      from public.queue_items qi
      join public.tracks t on t.id = qi.track_id
      where qi.night_session_id = v_night.id
        and qi.status = 'queued'
        and (qi.vote_count = 0 or qi.vote_count >= v_threshold)
      order by qi.vote_count desc, qi.created_at asc
      limit 1;

      if v_next_track.id is not null then
        update public.queue_items set status = 'playing', started_at = now()
        where id = v_next_track.id;

        v_new_current_track := jsonb_build_object(
          'itemId', v_next_track.id,
          'trackId', v_next_track.track_id,
          'title', v_next_track.title,
          'artist', v_next_track.artist,
          'source', 'youtube',
          'durationSeconds', coalesce(v_next_track.duration_seconds, 210),
          'youtubeVideoId', v_next_track.youtube_video_id,
          'thumbnailUrl', v_next_track.thumbnail_url,
          'voteCount', coalesce(v_next_track.vote_count, 0)
        );
      else
        v_new_current_track := null;
      end if;
    else
      v_new_current_track := null;
    end if;
  end if;

  update public.venue_playback_state
  set is_paused = v_new_paused,
      volume = v_new_volume,
      is_muted = v_new_muted,
      karaoke_mode = v_new_karaoke,
      current_track = v_new_current_track,
      last_command = p_command,
      command_seq = v_state.command_seq + 1,
      updated_at = now()
  where venue_id = v_venue.id
  returning * into v_state;

  return jsonb_build_object(
    'ok', true,
    'venueId', v_venue.id,
    'command', p_command,
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

grant execute on function public.send_playback_command(text, text, jsonb) to authenticated, anon, service_role;

-- Reload PostgREST schema cache so all new/updated RPCs take effect immediately
notify pgrst, 'reload schema';

