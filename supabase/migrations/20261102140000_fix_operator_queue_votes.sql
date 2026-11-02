-- Migration: 20261102140000_fix_operator_queue_votes.sql
-- Description:
-- 1. Reset any queue items with fake 99999 votes to 0
-- 2. Update dispatch_playback_command so play_now and enqueue_top never assign 99999 votes
-- 3. Order queue items so house/operator tracks (proposed_by_participant_id is null) take priority cleanly
--    without requiring fake 99999 votes, followed by client proposals ordered by vote_count desc

-- Step 1: Clean up any existing rows with fake 99999 votes
update public.queue_items
set vote_count = 0
where vote_count >= 9999;

-- Step 2: Redefine dispatch_playback_command with clean vote counts
create or replace function public.dispatch_playback_command(
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
  v_night record;
  v_state record;
  v_new_paused boolean;
  v_new_volume integer;
  v_new_muted boolean;
  v_new_karaoke boolean;
  v_new_current_track jsonb;
  v_track jsonb;
  v_track_id uuid;
  v_item_id uuid;
  v_next_track record;
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
        -- Skip any other playing tracks
        update public.queue_items set status = 'skipped', ended_at = now()
        where night_session_id = v_night.id and status = 'playing' and track_id != v_track_id;

        -- Check if this track is already in queue
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

      -- Start next queued track if available (house tracks first, then client proposals by votes)
      select qi.id, t.id as track_id, t.title, t.artist, t.duration_seconds, t.thumbnail_url, t.youtube_video_id
      into v_next_track
      from public.queue_items qi
      join public.tracks t on t.id = qi.track_id
      where qi.night_session_id = v_night.id and qi.status = 'queued'
      order by (qi.proposed_by_participant_id is null) desc, qi.vote_count desc, qi.created_at asc
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
          'voteCount', 0
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
  where venue_id = v_venue.id;

  return jsonb_build_object(
    'ok', true,
    'venueId', v_venue.id,
    'isPaused', v_new_paused,
    'volume', v_new_volume,
    'isMuted', v_new_muted,
    'karaokeMode', v_new_karaoke,
    'currentTrack', v_new_current_track,
    'lastCommand', p_command,
    'commandSeq', v_state.command_seq + 1
  );
end;
$$;

-- Step 3: Update get_night_state to order queue items with house tracks first, followed by votes
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

    -- If no playing item in queue_items, check venue_playback_state
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

    -- Active Playback Queue: only items with status = 'queued'
    -- House tracks (proposed_by_participant_id is null) first, then client proposals by vote count
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
      'requireModeration', coalesce(v_settings.require_moderation, false)
    ),
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


-- Step 4: Allow owner to delete tracks cleanly without foreign key constraint violations
create or replace function public.owner_delete_track(p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue_id uuid;
begin
  select venue_id into v_venue_id from public.tracks where id = p_track_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'track_not_found');
  end if;

  -- Delete from queue_items first if any exist
  delete from public.queue_items where track_id = p_track_id;
  -- Delete from fallback_tracks
  delete from public.fallback_tracks where track_id = p_track_id;
  -- Delete from playlist_tracks
  delete from public.playlist_tracks where track_id = p_track_id;
  -- Delete from votes
  delete from public.votes where track_id = p_track_id;
  -- Delete the track itself
  delete from public.tracks where id = p_track_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.owner_delete_track(uuid) to authenticated, anon, service_role;
