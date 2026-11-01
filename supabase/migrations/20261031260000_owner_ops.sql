-- Migration: 20261031260000_owner_ops.sql
-- Description: Owner staff management, night summary, and secure staff listing

-- 1. Create Staff Member RPC
create or replace function public.owner_create_staff(
  p_venue_id uuid,
  p_name text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_owner_id uuid;
  v_venue record;
  v_staff_id uuid;
  v_clean_name text;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_venue
  from public.venues
  where id = p_venue_id and owner_id = v_owner_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_pin !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_pin');
  end if;

  v_clean_name := trim(p_name);
  if length(v_clean_name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'name_too_short');
  end if;

  insert into public.staff_members (
    venue_id,
    name,
    pin_hash,
    active
  ) values (
    p_venue_id,
    v_clean_name,
    crypt(p_pin, gen_salt('bf', 10)),
    true
  )
  returning id into v_staff_id;

  -- Audit log
  insert into public.staff_actions (
    venue_id,
    actor_kind,
    actor_id,
    action,
    payload
  ) values (
    p_venue_id,
    'owner',
    v_owner_id,
    'create_staff',
    jsonb_build_object('staff_id', v_staff_id, 'name', v_clean_name)
  );

  return jsonb_build_object('ok', true, 'staffId', v_staff_id);
end;
$$;

revoke all on function public.owner_create_staff(uuid, text, text) from public, anon;
grant execute on function public.owner_create_staff(uuid, text, text) to authenticated;

-- 2. Reset Staff PIN RPC
create or replace function public.owner_reset_staff_pin(
  p_staff_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_owner_id uuid;
  v_staff record;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select sm.*, v.id as venue_id into v_staff
  from public.staff_members sm
  join public.venues v on v.id = sm.venue_id
  where sm.id = p_staff_id and v.owner_id = v_owner_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_pin !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_pin');
  end if;

  update public.staff_members
  set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
      failed_attempts = 0,
      locked_until = null
  where id = p_staff_id;

  insert into public.staff_actions (
    venue_id,
    actor_kind,
    actor_id,
    action,
    payload
  ) values (
    v_staff.venue_id,
    'owner',
    v_owner_id,
    'reset_staff_pin',
    jsonb_build_object('staff_id', p_staff_id)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.owner_reset_staff_pin(uuid, text) from public, anon;
grant execute on function public.owner_reset_staff_pin(uuid, text) to authenticated;

-- 3. Toggle Staff Active RPC
create or replace function public.owner_toggle_staff_active(
  p_staff_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_staff record;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select sm.*, v.id as venue_id into v_staff
  from public.staff_members sm
  join public.venues v on v.id = sm.venue_id
  where sm.id = p_staff_id and v.owner_id = v_owner_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.staff_members
  set active = p_active
  where id = p_staff_id;

  insert into public.staff_actions (
    venue_id,
    actor_kind,
    actor_id,
    action,
    payload
  ) values (
    v_staff.venue_id,
    'owner',
    v_owner_id,
    'toggle_staff_active',
    jsonb_build_object('staff_id', p_staff_id, 'active', p_active)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.owner_toggle_staff_active(uuid, boolean) from public, anon;
grant execute on function public.owner_toggle_staff_active(uuid, boolean) to authenticated;

-- 4. List Staff (Omits pin_hash)
create or replace function public.owner_list_staff(
  p_venue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_result jsonb;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not exists (
    select 1 from public.venues where id = p_venue_id and owner_id = v_owner_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sm.id,
        'venue_id', sm.venue_id,
        'name', sm.name,
        'active', sm.active,
        'failed_attempts', sm.failed_attempts,
        'locked_until', sm.locked_until,
        'last_login_at', sm.last_login_at,
        'created_at', sm.created_at
      ) order by sm.created_at asc
    ),
    '[]'::jsonb
  ) into v_result
  from public.staff_members sm
  where sm.venue_id = p_venue_id;

  return v_result;
end;
$$;

revoke all on function public.owner_list_staff(uuid) from public, anon;
grant execute on function public.owner_list_staff(uuid) to authenticated;

-- 5. Night Summary RPC
create or replace function public.owner_night_summary(
  p_venue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_night record;
  v_votes_count int := 0;
  v_credits_issued int := 0;
  v_credits_spent int := 0;
  v_codes_gen int := 0;
  v_codes_redeemed int := 0;
  v_top_tracks jsonb := '[]'::jsonb;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_night
  from public.night_sessions
  where venue_id = p_venue_id
  order by opened_at desc
  limit 1;

  if v_night.id is not null then
    -- Votes count
    select count(*) into v_votes_count
    from public.votes
    where night_session_id = v_night.id;

    -- Codes generated & credits issued
    select count(*), coalesce(sum(credits), 0)
    into v_codes_gen, v_credits_issued
    from public.vote_codes
    where night_session_id = v_night.id;

    -- Codes redeemed
    select count(*) into v_codes_redeemed
    from public.vote_codes
    where night_session_id = v_night.id and status = 'redeemed';

    -- Credits spent
    select coalesce(sum(abs(ct.delta)), 0) into v_credits_spent
    from public.credit_transactions ct
    join public.participants p on p.id = ct.participant_id
    where p.night_session_id = v_night.id and ct.delta < 0;

    -- Top 5 tracks of the night
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'title', t.title,
          'artist', t.artist,
          'votes', qi.vote_count
        ) order by qi.vote_count desc
      ),
      '[]'::jsonb
    ) into v_top_tracks
    from (
      select track_id, vote_count
      from public.queue_items
      where night_session_id = v_night.id
      order by vote_count desc
      limit 5
    ) qi
    join public.tracks t on t.id = qi.track_id;
  end if;

  return jsonb_build_object(
    'votesCount', v_votes_count,
    'creditsIssued', v_credits_issued,
    'creditsSpent', v_credits_spent,
    'codesGenerated', v_codes_gen,
    'codesRedeemed', v_codes_redeemed,
    'topTracks', v_top_tracks
  );
end;
$$;

revoke all on function public.owner_night_summary(uuid) from public, anon;
grant execute on function public.owner_night_summary(uuid) to authenticated;

-- 6. Enforce security: Revoke select on staff_members from authenticated and anon
revoke select on public.staff_members from authenticated, anon, public;

