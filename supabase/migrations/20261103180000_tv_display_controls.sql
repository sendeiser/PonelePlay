-- Migration: 20261103180000_tv_display_controls.sql
-- Description: Add display_config column to player_devices and RPCs for individual TV display controls (mode, list visibility, theme, scale)

alter table public.player_devices
  add column if not exists display_config jsonb default '{"mode":"VIDEO","showQueue":true,"showProposals":true,"theme":"neon","scale":"normal"}'::jsonb;

-- 1. Update list_venue_player_devices to include display_config
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

-- 2. Update TV Device Display Configuration (Individual or All)
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
    -- Update all devices for this venue
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

