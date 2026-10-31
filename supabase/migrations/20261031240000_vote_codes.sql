-- Vote-Code Generation, Tickets, and History

create or replace function public.generate_code_string()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(8);
  result text := '';
  i int;
begin
  for i in 0..7 loop
    result := result || substr(chars, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.owner_generate_code(p_credits integer)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue_id uuid;
  v_night_id uuid;
  v_code text;
  v_max_attempts int := 10;
  v_attempt int := 0;
  v_created_row record;
begin
  if p_credits < 1 or p_credits > 50 then
    raise exception 'invalid_credits';
  end if;

  select id into v_venue_id
  from public.venues
  where owner_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'venue_not_found';
  end if;

  select id into v_night_id
  from public.night_sessions
  where venue_id = v_venue_id and status = 'open'
  limit 1;

  if not found then
    raise exception 'night_closed';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_code_string();

    begin
      insert into public.vote_codes (
        venue_id,
        night_session_id,
        code,
        credits,
        status,
        created_by_kind,
        created_by_owner_id,
        printed_count
      )
      values (
        v_venue_id,
        v_night_id,
        v_code,
        p_credits,
        'active',
        'owner',
        auth.uid(),
        0
      )
      returning
        id,
        code,
        credits,
        status,
        created_at,
        printed_count,
        created_by_kind
      into v_created_row;

      exit;
    exception when unique_violation then
      if v_attempt >= v_max_attempts then
        raise exception 'code_generation_failed';
      end if;
    end;
  end loop;

  insert into public.staff_actions (
    venue_id,
    night_session_id,
    actor_kind,
    actor_id,
    action,
    payload
  )
  values (
    v_venue_id,
    v_night_id,
    'owner',
    auth.uid(),
    'generate_code',
    jsonb_build_object('code', v_code, 'credits', p_credits)
  );

  return jsonb_build_object(
    'id', v_created_row.id,
    'code', v_created_row.code,
    'credits', v_created_row.credits,
    'status', v_created_row.status,
    'createdAt', to_char(v_created_row.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'printedCount', v_created_row.printed_count,
    'createdByKind', v_created_row.created_by_kind,
    'createdByName', 'Dueño'
  );
end;
$$;

revoke all on function public.owner_generate_code(integer) from public;
grant execute on function public.owner_generate_code(integer) to authenticated;


create or replace function public.increment_code_prints(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code record;
begin
  select id, venue_id, night_session_id, code into v_code
  from public.vote_codes
  where id = p_code_id;

  if not found then
    raise exception 'code_not_found';
  end if;

  update public.vote_codes
  set printed_count = printed_count + 1
  where id = p_code_id;

  insert into public.staff_actions (
    venue_id,
    night_session_id,
    actor_kind,
    actor_id,
    action,
    payload
  )
  values (
    v_code.venue_id,
    v_code.night_session_id,
    'owner',
    auth.uid(),
    'print_code',
    jsonb_build_object('codeId', p_code_id, 'code', v_code.code)
  );
end;
$$;

revoke all on function public.increment_code_prints(uuid) from public;
grant execute on function public.increment_code_prints(uuid) to authenticated;


create or replace function public.get_code_history()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_venue_id uuid;
  v_result jsonb;
begin
  select id into v_venue_id
  from public.venues
  where owner_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'venue_not_found';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', vc.id,
      'code', vc.code,
      'credits', vc.credits,
      'status', vc.status,
      'createdAt', to_char(vc.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'printedCount', vc.printed_count,
      'createdByKind', vc.created_by_kind,
      'createdByName', case
        when vc.created_by_kind = 'owner' then 'Dueño'
        when vc.created_by_kind = 'staff' then coalesce(sm.name, 'Staff')
        else 'Sistema'
      end
    )
    order by vc.created_at desc
  ), '[]'::jsonb)
  into v_result
  from public.vote_codes vc
  left join public.staff_members sm on sm.id = vc.created_by_staff_id
  where vc.venue_id = v_venue_id;

  return v_result;
end;
$$;

revoke all on function public.get_code_history() from public;
grant execute on function public.get_code_history() to authenticated;
