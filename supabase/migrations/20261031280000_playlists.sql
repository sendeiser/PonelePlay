-- 20261031280000_playlists.sql
-- Custom Playlists per venue & tracks mapping

create table if not exists public.venue_playlists (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  description text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.venue_playlists(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (playlist_id, track_id)
);

create index if not exists venue_playlists_venue_idx on public.venue_playlists (venue_id);
create index if not exists playlist_tracks_pos_idx on public.playlist_tracks (playlist_id, position);

alter table public.venue_playlists enable row level security;
alter table public.playlist_tracks enable row level security;

drop policy if exists venue_playlists_all on public.venue_playlists;
create policy venue_playlists_all on public.venue_playlists for all using (true) with check (true);

drop policy if exists playlist_tracks_all on public.playlist_tracks;
create policy playlist_tracks_all on public.playlist_tracks for all using (true) with check (true);

grant all on public.venue_playlists to authenticated, anon, service_role;
grant all on public.playlist_tracks to authenticated, anon, service_role;
