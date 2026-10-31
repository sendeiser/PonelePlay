create type public.track_source as enum ('youtube', 'upload', 'spotify');
create type public.track_creator as enum ('owner', 'client');
create type public.queue_status as enum ('queued', 'playing', 'played', 'skipped', 'vetoed', 'failed');
create type public.code_status as enum ('active', 'redeemed', 'expired');
create type public.night_status as enum ('open', 'closed');
create type public.actor_kind as enum ('owner', 'staff', 'system');
create type public.credit_reason as enum ('code_redeem', 'vote', 'night_close');

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  accent_color text not null default '#FFB703' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text,
  join_message text,
  created_at timestamptz not null default now()
);

create index venues_owner_idx on public.venues (owner_id);

create table public.venue_settings (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  explicit_filter_enabled boolean not null default true,
  explicit_keywords text[] not null default array[
    'puta', 'puto', 'mierda', 'sexo', 'porno', 'xxx', 'droga', 'nazi',
    'fuck', 'shit', 'bitch', 'porn', 'sex', 'drugs'
  ],
  max_song_duration_seconds integer not null default 480
    check (max_song_duration_seconds between 60 and 3600),
  max_proposals_per_participant integer not null default 3
    check (max_proposals_per_participant between 0 and 20),
  default_credits_per_code integer not null default 5
    check (default_credits_per_code between 1 and 50),
  max_credits_per_code integer not null default 50
    check (max_credits_per_code between 1 and 100),
  max_queue_size integer not null default 30
    check (max_queue_size between 1 and 200),
  proposals_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.night_sessions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  status public.night_status not null default 'open',
  opened_by_kind public.actor_kind not null
    check (opened_by_kind in ('owner', 'staff')),
  opened_by_id uuid not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint night_closed_fields check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  )
);

create unique index night_one_open_per_venue
  on public.night_sessions (venue_id)
  where status = 'open';

create index night_venue_opened_idx
  on public.night_sessions (venue_id, opened_at desc);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  night_session_id uuid not null references public.night_sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  credits_balance integer not null default 0 check (credits_balance >= 0),
  proposals_used integer not null default 0 check (proposals_used >= 0),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (night_session_id, auth_user_id)
);

create index participants_auth_idx on public.participants (auth_user_id);

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  pin_hash text not null,
  active boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index staff_active_by_venue
  on public.staff_members (venue_id)
  where active;

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  source public.track_source not null,
  title text not null check (char_length(title) between 1 and 300),
  artist text not null default '' check (char_length(artist) <= 300),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 7200),
  thumbnail_url text,
  youtube_video_id text,
  storage_path text,
  spotify_uri text,
  is_explicit boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 400),
  created_by_kind public.track_creator not null default 'owner',
  created_by_participant_id uuid references public.participants(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tracks_source_fields check (
    (source = 'youtube' and youtube_video_id is not null and storage_path is null and spotify_uri is null)
    or (source = 'upload' and storage_path is not null and youtube_video_id is null and spotify_uri is null)
    or (source = 'spotify' and spotify_uri is not null and youtube_video_id is null and storage_path is null)
  ),
  unique (venue_id, dedupe_key)
);

create index tracks_venue_status_idx on public.tracks (venue_id, status);

create table public.queue_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  night_session_id uuid not null references public.night_sessions(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete restrict,
  status public.queue_status not null default 'queued',
  vote_count integer not null default 0 check (vote_count >= 0),
  proposed_by_participant_id uuid references public.participants(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create unique index queue_no_duplicate_active
  on public.queue_items (night_session_id, track_id)
  where status in ('queued', 'playing');

create unique index queue_one_playing
  on public.queue_items (night_session_id)
  where status = 'playing';

create index queue_order
  on public.queue_items (night_session_id, status, vote_count desc, created_at asc);

create index queue_track_idx on public.queue_items (track_id);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  night_session_id uuid not null references public.night_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  queue_item_id uuid not null references public.queue_items(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (night_session_id, participant_id, track_id)
);

create index votes_queue_item_idx on public.votes (queue_item_id);

create table public.vote_codes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  night_session_id uuid not null references public.night_sessions(id) on delete cascade,
  code text not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  credits integer not null check (credits between 1 and 50),
  status public.code_status not null default 'active',
  created_by_kind public.actor_kind not null
    check (created_by_kind in ('owner', 'staff')),
  created_by_owner_id uuid references auth.users(id) on delete set null,
  created_by_staff_id uuid references public.staff_members(id) on delete restrict,
  redeemed_by_participant_id uuid references public.participants(id) on delete set null,
  printed_count integer not null default 0 check (printed_count >= 0),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  constraint code_creator_fields check (
    (created_by_kind = 'owner' and created_by_staff_id is null)
    or (created_by_kind = 'staff' and created_by_staff_id is not null and created_by_owner_id is null)
  ),
  constraint code_redeemed_fields check (
    (status = 'redeemed' and redeemed_by_participant_id is not null and redeemed_at is not null)
    or (status <> 'redeemed')
  )
);

create index codes_night_status_idx
  on public.vote_codes (night_session_id, status);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason public.credit_reason not null,
  vote_code_id uuid references public.vote_codes(id) on delete set null,
  queue_item_id uuid references public.queue_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index credit_tx_participant_idx
  on public.credit_transactions (participant_id, created_at desc);

create table public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index staff_sessions_staff_idx on public.staff_sessions (staff_id);

create table public.player_devices (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null default 'PC del bar' check (char_length(name) between 1 and 80),
  token_hash text not null unique,
  paired_by_owner_id uuid not null references auth.users(id) on delete cascade,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.fallback_tracks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  position integer not null check (position >= 0),
  unique (venue_id, track_id)
);

create index fallback_position_idx on public.fallback_tracks (venue_id, position);

create table public.staff_actions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  night_session_id uuid references public.night_sessions(id) on delete set null,
  actor_kind public.actor_kind not null,
  actor_id uuid,
  action text not null check (char_length(action) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index staff_actions_venue_idx
  on public.staff_actions (venue_id, created_at desc);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0 check (count >= 0),
  expires_at timestamptz not null
);

create index rate_limits_expires_idx on public.rate_limits (expires_at);

create table public.youtube_search_cache (
  query_key text primary key,
  results jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index youtube_cache_expires_idx on public.youtube_search_cache (expires_at);

create or replace function public.handle_new_venue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.venue_settings (venue_id)
  values (new.id)
  on conflict (venue_id) do nothing;
  return new;
end;
$$;

create trigger venues_create_settings
  after insert on public.venues
  for each row
  execute function public.handle_new_venue();

create or replace function public.touch_venue_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger venue_settings_touch
  before update on public.venue_settings
  for each row
  execute function public.touch_venue_settings();

create or replace function public.is_venue_owner(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.venues v
    where v.id = p_venue_id
      and v.owner_id = auth.uid()
  );
$$;

create or replace function public.is_my_participant(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants p
    where p.id = p_participant_id
      and p.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_night_open(p_night_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.night_sessions n
    where n.id = p_night_session_id
      and n.status = 'open'
  );
$$;

alter table public.venues enable row level security;
alter table public.venue_settings enable row level security;
alter table public.night_sessions enable row level security;
alter table public.participants enable row level security;
alter table public.staff_members enable row level security;
alter table public.tracks enable row level security;
alter table public.queue_items enable row level security;
alter table public.votes enable row level security;
alter table public.vote_codes enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.player_devices enable row level security;
alter table public.fallback_tracks enable row level security;
alter table public.staff_actions enable row level security;
alter table public.rate_limits enable row level security;
alter table public.youtube_search_cache enable row level security;

create policy venues_public_read
  on public.venues
  for select
  to anon, authenticated
  using (true);

create policy venues_owner_insert
  on public.venues
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy venues_owner_update
  on public.venues
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy venues_owner_delete
  on public.venues
  for delete
  to authenticated
  using (owner_id = auth.uid());

create policy venue_settings_owner_all
  on public.venue_settings
  for all
  to authenticated
  using (public.is_venue_owner(venue_id))
  with check (public.is_venue_owner(venue_id));

create policy night_sessions_read
  on public.night_sessions
  for select
  to authenticated
  using (status = 'open' or public.is_venue_owner(venue_id));

create policy night_sessions_owner_all
  on public.night_sessions
  for all
  to authenticated
  using (public.is_venue_owner(venue_id))
  with check (public.is_venue_owner(venue_id));

create policy participants_read
  on public.participants
  for select
  to authenticated
  using (auth_user_id = auth.uid() or public.is_venue_owner(venue_id));

create policy staff_members_owner_all
  on public.staff_members
  for all
  to authenticated
  using (public.is_venue_owner(venue_id))
  with check (public.is_venue_owner(venue_id));

create policy tracks_read
  on public.tracks
  for select
  to authenticated
  using (status = 'active' or public.is_venue_owner(venue_id));

create policy tracks_owner_all
  on public.tracks
  for all
  to authenticated
  using (public.is_venue_owner(venue_id))
  with check (public.is_venue_owner(venue_id));

create policy queue_items_read
  on public.queue_items
  for select
  to authenticated
  using (public.is_night_open(night_session_id) or public.is_venue_owner(venue_id));

create policy queue_items_owner_all
  on public.queue_items
  for all
  to authenticated
  using (public.is_venue_owner(venue_id))
  with check (public.is_venue_owner(venue_id));

create policy votes_read
  on public.votes
  for select
  to authenticated
  using (public.is_my_participant(participant_id) or public.is_venue_owner(venue_id));

create policy vote_codes_owner_read
  on public.vote_codes
  for select
  to authenticated
  using (public.is_venue_owner(venue_id));

create policy credit_transactions_read
  on public.credit_transactions
  for select
  to authenticated
  using (public.is_my_participant(participant_id) or public.is_venue_owner(venue_id));

create policy player_devices_owner_all
  on public.player_devices
  for all
  to authenticated
  using (public.is_venue_owner(venue_id))
  with check (public.is_venue_owner(venue_id));

create policy fallback_tracks_owner_all
  on public.fallback_tracks
  for all
  to authenticated
  using (public.is_venue_owner(venue_id))
  with check (public.is_venue_owner(venue_id));

create policy staff_actions_owner_read
  on public.staff_actions
  for select
  to authenticated
  using (public.is_venue_owner(venue_id));

grant usage on schema public to anon, authenticated, service_role;

grant select on public.venues to anon, authenticated;
grant select on public.venue_settings, public.staff_members, public.player_devices, public.staff_actions to authenticated;
grant select on public.tracks, public.night_sessions, public.participants, public.queue_items,
  public.votes, public.vote_codes, public.credit_transactions, public.fallback_tracks to authenticated;

grant insert, update, delete on public.venues, public.venue_settings, public.tracks,
  public.night_sessions, public.queue_items, public.staff_members, public.fallback_tracks,
  public.player_devices to authenticated;
