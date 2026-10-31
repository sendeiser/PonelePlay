-- Demo seed for PonelePlay (manual creation without full auth rows)

-- Venue
insert into public.venues (id, owner_id, name, slug, accent_color, join_message)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Billar Aurora',
  'billar-aurora',
  '#FFB703',
  'Bienvenido al bar. Escaneá para votar.'
)
on conflict do nothing;

-- Staff members (PIN hashes are placeholders; real hashes use bcrypt)
insert into public.staff_members (id, venue_id, name, pin_hash, active)
values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Luz', '$2b$10$examplehashluz', true),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'Sofi', '$2b$10$examplehashsofi', true)
on conflict do nothing;

-- Open night session
insert into public.night_sessions (id, venue_id, status, opened_by_kind, opened_by_id)
values (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000010',
  'open',
  'owner',
  '00000000-0000-0000-0000-000000000001'
)
on conflict do nothing;

-- Active vote code
insert into public.vote_codes (id, venue_id, night_session_id, code, credits, status, created_by_kind, created_by_owner_id)
values (
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000200',
  'MESAPLAY',
  5,
  'active',
  'owner',
  '00000000-0000-0000-0000-000000000001'
)
on conflict do nothing;
