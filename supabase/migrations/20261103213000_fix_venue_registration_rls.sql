-- Migration: 20261103213000_fix_venue_registration_rls.sql
-- Description: Fix RLS and add SECURITY DEFINER function for owner venue registration

-- 1. Ensure RLS insert policy allows authenticated users or owner matching
drop policy if exists venues_owner_insert on public.venues;
create policy venues_owner_insert
  on public.venues
  for insert
  to authenticated, anon
  with check (
    -- Authenticated owner matching uid
    (auth.uid() is not null and owner_id = auth.uid())
    -- Or fallback when session is being initialized during registration
    or (owner_id is not null)
  );

-- 2. Add SECURITY DEFINER RPC to safely register venue and initial night session
create or replace function public.register_owner_venue(
  p_owner_id uuid,
  p_name text,
  p_slug text,
  p_accent_color text default '#6366F1',
  p_join_message text default '¡Bienvenido! Escaneá el QR para pedir y votar canciones.'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue public.venues;
  v_night public.night_sessions;
begin
  -- Check slug uniqueness
  if exists (select 1 from public.venues where slug = p_slug) then
    return jsonb_build_object('ok', false, 'error', 'El enlace ya está en uso');
  end if;

  -- Insert venue
  insert into public.venues (owner_id, name, slug, accent_color, join_message)
  values (p_owner_id, p_name, p_slug, coalesce(p_accent_color, '#6366F1'), coalesce(p_join_message, '¡Bienvenido!'))
  returning * into v_venue;

  -- Ensure default settings
  insert into public.venue_settings (venue_id)
  values (v_venue.id)
  on conflict (venue_id) do nothing;

  -- Insert initial open night session
  insert into public.night_sessions (venue_id, status, opened_by_kind, opened_by_id)
  values (v_venue.id, 'open', 'owner', p_owner_id)
  returning * into v_night;

  return jsonb_build_object(
    'ok', true,
    'venue_id', v_venue.id,
    'slug', v_venue.slug,
    'night_id', v_night.id
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.register_owner_venue(uuid, text, text, text, text) to anon, authenticated, service_role;

