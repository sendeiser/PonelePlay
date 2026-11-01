-- Migration: 20261031243000_moderation.sql
-- Description: Skip and Veto queue moderation with audit trail

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

  if not found or v_night.status <> 'active' then
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

revoke all on function public.queue_action(uuid, text, public.actor_kind, uuid) from public, anon, authenticated;
grant execute on function public.queue_action(uuid, text, public.actor_kind, uuid) to service_role;

-- Owner wrapper for authenticated venue owners
create or replace function public.owner_queue_action(
  p_item_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_item record;
  v_venue record;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select qi.*, ns.venue_id into v_item
  from public.queue_items qi
  join public.night_sessions ns on ns.id = qi.night_session_id
  where qi.id = p_item_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_venue
  from public.venues
  where id = v_item.venue_id and owner_id = v_owner_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  return public.queue_action(p_item_id, p_action, 'owner', v_owner_id);
end;
$$;

revoke all on function public.owner_queue_action(uuid, text) from public, anon;
grant execute on function public.owner_queue_action(uuid, text) to authenticated;
