-- Atomic Cast Vote RPC

create or replace function public.cast_vote(p_queue_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_participant record;
  v_item record;
  v_new_balance int;
  v_new_votes int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'night_closed');
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

  if v_participant.credits_balance < 1 then
    return jsonb_build_object('ok', false, 'error', 'no_credits');
  end if;

  select
    qi.id,
    qi.track_id,
    qi.status,
    qi.vote_count,
    qi.night_session_id
  into v_item
  from public.queue_items qi
  where qi.id = p_queue_item_id and qi.night_session_id = v_participant.night_session_id
  for update of qi;

  if not found or v_item.status <> 'queued' then
    return jsonb_build_object('ok', false, 'error', 'item_closed');
  end if;

  if exists (
    select 1
    from public.votes
    where night_session_id = v_participant.night_session_id
      and participant_id = v_participant.id
      and track_id = v_item.track_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  insert into public.votes (
    venue_id,
    night_session_id,
    participant_id,
    queue_item_id,
    track_id,
    created_at
  )
  values (
    v_participant.venue_id,
    v_participant.night_session_id,
    v_participant.id,
    v_item.id,
    v_item.track_id,
    now()
  );

  v_new_balance := v_participant.credits_balance - 1;
  update public.participants
  set credits_balance = v_new_balance,
      last_seen_at = now()
  where id = v_participant.id;

  v_new_votes := v_item.vote_count + 1;
  update public.queue_items
  set vote_count = v_new_votes
  where id = v_item.id;

  insert into public.credit_transactions (
    participant_id,
    delta,
    balance_after,
    reason,
    queue_item_id
  )
  values (
    v_participant.id,
    -1,
    v_new_balance,
    'vote',
    v_item.id
  );

  return jsonb_build_object(
    'ok', true,
    'voteCount', v_new_votes,
    'balance', v_new_balance
  );
end;
$$;

revoke all on function public.cast_vote(uuid) from public;
grant execute on function public.cast_vote(uuid) to authenticated, anon;
