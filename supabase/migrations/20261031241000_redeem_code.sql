-- Atomic Code Redeem RPC

create or replace function public.redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_clean_code text;
  v_participant record;
  v_code record;
  v_new_balance int;
begin
  v_clean_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if char_length(v_clean_code) <> 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select
    p.id,
    p.venue_id,
    p.night_session_id,
    p.credits_balance
  into v_participant
  from public.participants p
  join public.night_sessions ns on ns.id = p.night_session_id
  where p.auth_user_id = auth.uid() and ns.status = 'open'
  order by p.created_at desc
  limit 1
  for update of p;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'night_closed');
  end if;

  select
    id,
    credits,
    status,
    venue_id,
    night_session_id
  into v_code
  from public.vote_codes
  where code = v_clean_code and venue_id = v_participant.venue_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if v_code.night_session_id <> v_participant.night_session_id or v_code.status = 'expired' then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if v_code.status = 'redeemed' then
    return jsonb_build_object('ok', false, 'error', 'used');
  end if;

  if v_code.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update public.vote_codes
  set status = 'redeemed',
      redeemed_by_participant_id = v_participant.id,
      redeemed_at = now()
  where id = v_code.id;

  v_new_balance := v_participant.credits_balance + v_code.credits;

  update public.participants
  set credits_balance = v_new_balance,
      last_seen_at = now()
  where id = v_participant.id;

  insert into public.credit_transactions (
    participant_id,
    delta,
    balance_after,
    reason,
    vote_code_id
  )
  values (
    v_participant.id,
    v_code.credits,
    v_new_balance,
    'code_redeem',
    v_code.id
  );

  return jsonb_build_object(
    'ok', true,
    'code', v_clean_code,
    'credits', v_code.credits,
    'balance', v_new_balance
  );
end;
$$;

revoke all on function public.redeem_code(text) from public;
grant execute on function public.redeem_code(text) to authenticated, anon;
