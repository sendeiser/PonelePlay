async function run() {
  const sql = `
  -- 1. Fix send_playback_command
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
          'voteCount', 99999,
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
            set status = 'playing', started_at = coalesce(started_at, now()), ended_at = null, vote_count = 99999
            where id = v_item_id;
          else
            insert into public.queue_items (venue_id, night_session_id, track_id, proposed_by_participant_id, status, vote_count, started_at)
            values (v_venue.id, v_night.id, v_track_id, null, 'playing', 99999, now())
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
            set vote_count = greatest(vote_count, 99999)
            where id = v_item_id;
          else
            insert into public.queue_items (venue_id, night_session_id, track_id, proposed_by_participant_id, status, vote_count)
            values (v_venue.id, v_night.id, v_track_id, null, 'queued', 99999)
            returning id into v_item_id;
          end if;
        end if;
      end if;
      -- Notice: v_new_current_track remains unchanged for enqueue_top!
    elsif p_command = 'skip' then
      select * into v_night from public.night_sessions
      where venue_id = v_venue.id and status = 'open'
      order by opened_at desc limit 1;

      if v_night.id is not null then
        update public.queue_items set status = 'skipped', ended_at = now()
        where night_session_id = v_night.id and status = 'playing';

        -- Start next queued track if available
        select qi.id, t.id as track_id, t.title, t.artist, t.duration_seconds, t.thumbnail_url, t.youtube_video_id
        into v_next_track
        from public.queue_items qi
        join public.tracks t on t.id = qi.track_id
        where qi.night_session_id = v_night.id and qi.status = 'queued'
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
    where venue_id = v_venue.id
    returning * into v_state;

    return jsonb_build_object(
      'ok', true,
      'command', p_command,
      'isPaused', v_state.is_paused,
      'volume', v_state.volume,
      'isMuted', v_state.is_muted,
      'karaokeMode', v_state.karaoke_mode,
      'commandSeq', v_state.command_seq,
      'currentTrack', v_state.current_track
    );
  end;
  $$;

  -- 2. Fix get_night_state to include youtubeVideoId
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

      -- queue (only queued status, ordered by vote_count desc, created_at asc)
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
    else
      v_now_playing := null;
      v_queue := '[]'::jsonb;
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
      'me', v_me,
      'settings', jsonb_build_object(
        'explicitFilterEnabled', v_settings.explicit_filter_enabled,
        'maxSongDurationSeconds', v_settings.max_song_duration_seconds,
        'maxProposalsPerParticipant', v_settings.max_proposals_per_participant,
        'defaultCreditsPerCode', v_settings.default_credits_per_code,
        'maxCreditsPerCode', v_settings.max_credits_per_code,
        'maxQueueSize', v_settings.max_queue_size,
        'proposalsEnabled', v_settings.proposals_enabled
      ),
      'player', null,
      'serverTime', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end;
  $$;

  -- 3. Fix player_state to search status = 'open'
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

    update public.player_devices
    set last_seen_at = now()
    where id = v_device.id;

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

  -- 4. Unpause venue playback state
  update public.venue_playback_state
  set is_paused = false, volume = 85
  where venue_id in (select id from public.venues where slug = 'billar-aurora');
  `;

  const res = await fetch('https://api.supabase.com/v1/projects/kbeljbnrnyxfjwmdpaew/database/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_SUPABASE_ACCESS_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Result:', data);
}

run().catch(console.error);
