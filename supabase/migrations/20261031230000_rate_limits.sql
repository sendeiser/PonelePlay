-- Atomic Rate Limits Helper and Cleanup

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (
    key,
    count,
    window_started_at,
    expires_at
  )
  values (
    p_key,
    1,
    now(),
    now() + (p_ttl_seconds || ' seconds')::interval
  )
  on conflict (key) do update
  set count = case
        when now() > rate_limits.window_started_at + (p_window_seconds || ' seconds')::interval
        then 1
        else rate_limits.count + 1
      end,
      window_started_at = case
        when now() > rate_limits.window_started_at + (p_window_seconds || ' seconds')::interval
        then now()
        else rate_limits.window_started_at
      end,
      expires_at = now() + (p_ttl_seconds || ' seconds')::interval
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to authenticated, anon;


create or replace function public.cleanup_rate_limits()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from public.rate_limits
  where expires_at < now();
end;
$$;

revoke all on function public.cleanup_rate_limits() from public;
grant execute on function public.cleanup_rate_limits() to authenticated, anon;

