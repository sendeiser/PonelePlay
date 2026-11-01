-- Migration: 20261101300000_tv_pairing.sql
-- Description: TV pairing requests table, 6-digit short code RPCs, and device management

create table if not exists public.tv_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  venue_slug text not null,
  code text not null,
  device_name text not null default 'TV Salón',
  raw_token text not null,
  paired boolean not null default false,
  paired_device_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create index if not exists tv_pairing_codes_slug_idx on public.tv_pairing_codes (venue_slug, code);

alter table public.tv_pairing_codes enable row level security;
drop policy if exists tv_pairing_codes_all on public.tv_pairing_codes;
create policy tv_pairing_codes_all on public.tv_pairing_codes for all using (true) with check (true);
grant all on public.tv_pairing_codes to authenticated, anon, service_role;

-- 1. Request 6-digit TV Pairing Code (called by TV player screen)
create or replace function public.request_tv_pairing_code(
  p_venue_slug text,
  p_device_name text default 'TV Salón'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue record;
  v_code text;
  v_raw_token text;
  v_clean_name text;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  v_clean_name := coalesce(nullif(trim(p_device_name), ''), 'TV Salón');
  -- Generate 6-digit code
  v_code := lpad(floor(100000 + random() * 900000)::text, 6, '0');
  v_raw_token := encode(gen_random_bytes(32), 'hex');

  -- Invalidate previous pending codes for this venue
  delete from public.tv_pairing_codes where venue_slug = p_venue_slug and paired = false;

  insert into public.tv_pairing_codes (
    venue_slug, code, device_name, raw_token, paired, expires_at
  ) values (
    p_venue_slug, v_code, v_clean_name, v_raw_token, false, now() + interval '30 minutes'
  );

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'deviceName', v_clean_name,
    'expiresInSeconds', 1800
  );
end;
$$;

grant execute on function public.request_tv_pairing_code(text, text) to authenticated, anon, service_role;

-- 2. Confirm TV Pairing with 6-digit code (called by Bar Panel)
create or replace function public.confirm_tv_pairing_code(
  p_venue_slug text,
  p_code text,
  p_device_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue record;
  v_pair record;
  v_token_hash text;
  v_device_id uuid;
  v_final_name text;
begin
  select * into v_venue from public.venues where slug = p_venue_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  select * into v_pair from public.tv_pairing_codes
  where venue_slug = p_venue_slug
    and code = trim(p_code)
    and paired = false
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Código inválido o vencido');
  end if;

  v_final_name := coalesce(nullif(trim(p_device_name), ''), v_pair.device_name, 'TV Salón');
  v_token_hash := encode(digest(v_pair.raw_token, 'sha256'), 'hex');

  insert into public.player_devices (
    venue_id,
    name,
    token_hash,
    paired_by_owner_id,
    last_seen_at
  ) values (
    v_venue.id,
    v_final_name,
    v_token_hash,
    coalesce(auth.uid(), v_venue.owner_id),
    now()
  )
  returning id into v_device_id;

  update public.tv_pairing_codes
  set paired = true,
      paired_device_id = v_device_id,
      device_name = v_final_name
  where id = v_pair.id;

  return jsonb_build_object(
    'ok', true,
    'deviceId', v_device_id,
    'name', v_final_name,
    'token', v_pair.raw_token
  );
end;
$$;

grant execute on function public.confirm_tv_pairing_code(text, text, text) to authenticated, anon, service_role;

-- 3. Check TV Pairing Status (polled/called by TV player screen)
create or replace function public.check_tv_pairing_status(
  p_venue_slug text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pair record;
begin
  select * into v_pair from public.tv_pairing_codes
  where venue_slug = p_venue_slug
    and code = trim(p_code)
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_pair.paired then
    return jsonb_build_object(
      'ok', true,
      'paired', true,
      'token', v_pair.raw_token,
      'deviceId', v_pair.paired_device_id,
      'name', v_pair.device_name
    );
  else
    return jsonb_build_object(
      'ok', true,
      'paired', false
    );
  end if;
end;
$$;

grant execute on function public.check_tv_pairing_status(text, text) to authenticated, anon, service_role;

-- 4. List Venue Player Devices
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
        'isOnline', case when pd.last_seen_at > now() - interval '2 minutes' then true else false end
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

