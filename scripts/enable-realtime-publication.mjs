async function run() {
  const sql = `
    -- Enable full replica identity for realtime diffs
    alter table public.queue_items replica identity full;
    alter table public.night_sessions replica identity full;
    alter table public.votes replica identity full;
    alter table public.venue_playback_state replica identity full;
    alter table public.venue_playlists replica identity full;
    alter table public.playlist_tracks replica identity full;
    alter table public.tracks replica identity full;
    alter table public.tv_pairing_codes replica identity full;
    alter table public.player_devices replica identity full;

    -- Add tables to realtime publication
    alter publication supabase_realtime add table public.queue_items;
    alter publication supabase_realtime add table public.night_sessions;
    alter publication supabase_realtime add table public.votes;
    alter publication supabase_realtime add table public.venue_playback_state;
    alter publication supabase_realtime add table public.venue_playlists;
    alter publication supabase_realtime add table public.playlist_tracks;
    alter publication supabase_realtime add table public.tracks;
    alter publication supabase_realtime add table public.tv_pairing_codes;
    alter publication supabase_realtime add table public.player_devices;
  `;

  const res = await fetch('https://api.supabase.com/v1/projects/kbeljbnrnyxfjwmdpaew/database/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_SUPABASE_ACCESS_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Result:', data);
}

run().catch(console.error);

