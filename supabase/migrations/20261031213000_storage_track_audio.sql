insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'track-audio',
  'track-audio',
  false,
  26214400,
  array['audio/*']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.owns_track_audio_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.venues v
    where v.id::text = (storage.foldername(p_name))[1]
      and v.owner_id = auth.uid()
  );
$$;

revoke all on function public.owns_track_audio_object(text) from public;
grant execute on function public.owns_track_audio_object(text) to authenticated;

create policy track_audio_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'track-audio'
    and public.owns_track_audio_object(name)
  );

create policy track_audio_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'track-audio'
    and public.owns_track_audio_object(name)
  );

create policy track_audio_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'track-audio'
    and public.owns_track_audio_object(name)
  )
  with check (
    bucket_id = 'track-audio'
    and public.owns_track_audio_object(name)
  );

create policy track_audio_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'track-audio'
    and public.owns_track_audio_object(name)
  );
