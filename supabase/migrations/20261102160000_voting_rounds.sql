-- Migration: 20261102160000_voting_rounds.sql
-- Description: Implement voting rounds for proposals that do not reach 5 votes.
-- At the end of each round (configurable seconds), the most voted candidate (or first proposed on tie)
-- automatically promotes to 'queued'.

-- 1. Add round settings to venue_settings
alter table public.venue_settings
add column if not exists voting_round_seconds integer not null default 180
  check (voting_round_seconds between 30 and 1800);

alter table public.venue_settings
add column if not exists voting_rounds_enabled boolean not null default true;

-- 2. Add round state tracking to night_sessions
alter table public.night_sessions
add column if not exists current_round_started_at timestamptz not null default now();

alter table public.night_sessions
add column if not exists current_round_number integer not null default 1;

-- 3. Stored procedure to resolve a voting round
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
  v_track record;
  v_elapsed_seconds int;
  v_round_duration int;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  select * into v_night from public.night_sessions
  where venue_id = v_venue.id and status = 'open'
  order by opened_at desc limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_active_night');
  end if;

  select * into v_settings from public.venue_settings where venue_id = v_venue.id;
  v_round_duration := coalesce(v_settings.voting_round_seconds, 180);

  v_elapsed_seconds := extract(epoch from (now() - coalesce(v_night.current_round_started_at, v_night.opened_at, now())))::int;

  -- If not forced and timer has not expired yet, return current status
  if not p_force and v_elapsed_seconds < v_round_duration then
    return jsonb_build_object(
      'ok', true,
      'resolved', false,
      'roundNumber', coalesce(v_night.current_round_number, 1),
      'remainingSeconds', greatest(0, v_round_duration - v_elapsed_seconds)
    );
  end if;

  -- Find the top candidate: most voted first, then earliest created on tie
  select qi.*, t.title, t.artist
  into v_top_candidate
  from public.queue_items qi
  join public.tracks t on t.id = qi.track_id
  where qi.night_session_id = v_night.id and qi.status = 'proposed'
  order by qi.vote_count desc, qi.created_at asc
  limit 1;

  if found then
    -- Promote top candidate to queued status
    update public.queue_items
    set status = 'queued'
    where id = v_top_candidate.id;

    -- Advance to next round
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
        'voteCount', v_top_candidate.vote_count
      ),
      'nextRoundNumber', coalesce(v_night.current_round_number, 1) + 1,
      'durationSeconds', v_round_duration
    );
  else
    -- No candidates currently waiting; reset round timer for next interval
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

-- 4. Update get_night_state to automatically resolve expired rounds & return votingRound info
create or replace function public.get_night_state(p_venue_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue record;
  v_night record;
  v_settings record;
  v_participant_id uuid;
  v_participant_token text;
  v_participant record;
  v_now_playing jsonb;
  v_queue jsonb;
  v_candidates jsonb;
  v_player record;
  v_user_role text := 'anon';
  v_user_id uuid;
  v_playback record;
  v_round_duration int := 180;
  v_round_elapsed int := 0;
  v_top_cand_id uuid := null;
  v_cand_count int := 0;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  select * into v_night from public.night_sessions
  where venue_id = v_venue.id and status = 'open'
  order by opened_at desc limit 1;

  select * into v_settings from public.venue_settings where venue_id = v_venue.id;
  select * into v_player from public.tv_players where venue_id = v_venue.id;
  select * into v_playback from public.venue_playback_state where venue_id = v_venue.id;

  v_user_id := auth.uid();
  if v_user_id is not null and v_user_id = v_venue.owner_id then
    v_user_role := 'owner';
  end if;

  begin
    v_participant_token := current_setting('request.headers', true)::json->>'x-participant-token';
  exception when others then
    v_participant_token := null;
  end;

  if v_participant_token is not null and v_participant_token <> '' and v_night.id is not null then
    select * into v_participant from public.participants
    where session_token = v_participant_token and night_session_id = v_night.id limit 1;
    if found then
      v_participant_id := v_participant.id;
    end if;
  end if;

  if v_night.id is not null then
    v_round_duration := coalesce(v_settings.voting_round_seconds, 180);
    v_round_elapsed := extract(epoch from (now() - coalesce(v_night.current_round_started_at, v_night.opened_at, now())))::int;

    -- If auto rounds enabled and time elapsed, automatically resolve the round!
    if coalesce(v_settings.voting_rounds_enabled, true) and v_round_elapsed >= v_round_duration then
      perform public.resolve_voting_round(p_venue_slug, false);
      -- Re-fetch updated night session after round resolution
      select * into v_night from public.night_sessions where id = v_night.id;
      v_round_elapsed := extract(epoch from (now() - coalesce(v_night.current_round_started_at, now())))::int;
    end if;

    -- Now playing
    select jsonb_build_object(
      'id', qi.id,
      'trackId', t.id,
      'title', t.title,
      'artist', t.artist,
      'source', t.source,
      'durationSeconds', t.duration_seconds,
      'youtubeVideoId', t.youtube_video_id,
      'thumbnailUrl', t.thumbnail_url,
      'voteCount', case when qi.vote_count >= 9999 then 0 else qi.vote_count end,
      'startedAt', to_char(coalesce(qi.started_at, now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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

    -- Fallback from venue_playback_state if needed
    if v_now_playing is null and v_playback.current_track is not null then
      v_now_playing := jsonb_build_object(
        'id', coalesce(v_playback.current_track->>'itemId', 'now-playing-manual'),
        'trackId', coalesce(v_playback.current_track->>'trackId', '00000000-0000-0000-0000-000000000000'),
        'title', v_playback.current_track->>'title',
        'artist', coalesce(v_playback.current_track->>'artist', 'YouTube'),
        'source', 'youtube',
        'durationSeconds', coalesce((v_playback.current_track->>'durationSeconds')::int, 210),
        'youtubeVideoId', v_playback.current_track->>'youtubeVideoId',
        'thumbnailUrl', v_playback.current_track->>'thumbnailUrl',
        'voteCount', case
          when coalesce((v_playback.current_track->>'voteCount')::int, 0) >= 9999 then 0
          else coalesce((v_playback.current_track->>'voteCount')::int, 0)
        end,
        'startedAt', to_char(coalesce(v_playback.updated_at, now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'myVote', false
      );
    end if;

    -- Active Playback Queue: items with status = 'queued'
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
        'voteCount', case when qi.vote_count >= 9999 then 0 else qi.vote_count end,
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
      order by (qi.proposed_by_participant_id is null) desc, qi.vote_count desc, qi.created_at asc
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

    -- Find top candidate ID and total candidate count
    select id into v_top_cand_id
    from public.queue_items
    where night_session_id = v_night.id and status = 'proposed'
    order by vote_count desc, created_at asc
    limit 1;

    select count(*) into v_cand_count
    from public.queue_items
    where night_session_id = v_night.id and status = 'proposed';

  else
    v_now_playing := null;
    v_queue := '[]'::jsonb;
    v_candidates := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'venue', jsonb_build_object(
      'id', v_venue.id,
      'name', v_venue.name,
      'slug', v_venue.slug,
      'accentColor', v_venue.accent_color,
      'joinMessage', v_venue.join_message
    ),
    'night', case when v_night.id is not null then jsonb_build_object(
      'id', v_night.id,
      'status', v_night.status,
      'openedAt', to_char(v_night.opened_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) else null end,
    'settings', jsonb_build_object(
      'defaultCreditsPerCode', coalesce(v_settings.default_credits_per_code, 3),
      'maxActiveSongsPerUser', coalesce(v_settings.max_active_songs_per_user, 2),
      'explicitFilterLevel', coalesce(v_settings.explicit_filter_level, 'none'),
      'requireModeration', coalesce(v_settings.require_moderation, false),
      'votingRoundSeconds', coalesce(v_settings.voting_round_seconds, 180),
      'votingRoundsEnabled', coalesce(v_settings.voting_rounds_enabled, true)
    ),
    'votingRound', case when v_night.id is not null then jsonb_build_object(
      'enabled', coalesce(v_settings.voting_rounds_enabled, true),
      'durationSeconds', v_round_duration,
      'roundNumber', coalesce(v_night.current_round_number, 1),
      'startedAt', to_char(coalesce(v_night.current_round_started_at, v_night.opened_at, now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'remainingSeconds', greatest(0, v_round_duration - v_round_elapsed),
      'topCandidateId', v_top_cand_id,
      'totalCandidates', v_cand_count
    ) else null end,
    'participant', case when v_participant.id is not null then jsonb_build_object(
      'id', v_participant.id,
      'nickname', v_participant.nickname,
      'creditsBalance', v_participant.credits_balance
    ) else null end,
    'userRole', v_user_role,
    'nowPlaying', v_now_playing,
    'queue', v_queue,
    'candidates', v_candidates,
    'player', case when v_player.id is not null then jsonb_build_object(
      'lastSeenAt', to_char(v_player.last_seen_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'isLive', (v_player.last_seen_at is not null and v_player.last_seen_at > now() - interval '30 seconds')
    ) else null end
  );
end;
$$;
