-- Migration: 20261031232000_fallback_order.sql
-- Description: Owner reorder fallback playlist RPC

create or replace function public.owner_reorder_fallback(
  p_venue_id uuid,
  p_track_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_venue record;
  v_track_id uuid;
  v_pos int := 0;
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

  -- Verify all provided tracks belong to this venue
  if array_length(p_track_ids, 1) > 0 then
    if exists (
      select 1
      from unnest(p_track_ids) as tid
      where not exists (
        select 1 from public.tracks where id = tid and venue_id = p_venue_id and status = 'active'
      )
    ) then
      return jsonb_build_object('ok', false, 'error', 'invalid_tracks');
    end if;
  end if;

  -- Delete existing fallback rows for venue
  delete from public.fallback_tracks
  where venue_id = p_venue_id;

  -- Insert in order
  if array_length(p_track_ids, 1) > 0 then
    foreach v_track_id in array p_track_ids
    loop
      insert into public.fallback_tracks (
        venue_id,
        track_id,
        position
      ) values (
        p_venue_id,
        v_track_id,
        v_pos
      );
      v_pos := v_pos + 1;
    end loop;
  end if;

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
    'reorder_fallback',
    jsonb_build_object('track_count', coalesce(array_length(p_track_ids, 1), 0))
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.owner_reorder_fallback(uuid, uuid[]) from public, anon;
grant execute on function public.owner_reorder_fallback(uuid, uuid[]) to authenticated;

