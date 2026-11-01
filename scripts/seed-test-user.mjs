import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// Load .env.local if present
try {
  const envPath = path.resolve(process.cwd(), ".worktrees/poneleplay-v1/.env.local");
  const altEnvPath = path.resolve(process.cwd(), ".env.local");
  const targetEnv = fs.existsSync(envPath) ? envPath : (fs.existsSync(altEnvPath) ? altEnvPath : null);
  if (targetEnv) {
    const lines = fs.readFileSync(targetEnv, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value.trim();
      }
    }
  }
} catch (e) {
  console.warn("Could not load env file directly:", e);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const email = "demo@poneleplay.com";
  const password = "poneleplay2026";
  const slug = "billar-aurora";

  console.log(`Checking if user ${email} exists...`);

  // 1. Get or create auth user
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error("Error listing users:", listErr);
    process.exit(1);
  }

  let user = listData.users.find((u) => u.email === email);

  if (!user) {
    console.log(`Creating user ${email}...`);
    const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Dueño Billar Aurora" },
    });

    if (createErr) {
      console.error("Error creating user:", createErr);
      process.exit(1);
    }
    user = createData.user;
    console.log(`User created with ID: ${user.id}`);
  } else {
    console.log(`User already exists with ID: ${user.id}, updating password...`);
    await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  }

  // 2. Check or create venue
  const { data: venueData } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  let venueId = venueData?.id;

  if (!venueId) {
    console.log(`Creating venue ${slug}...`);
    const { data: newVenue, error: venueErr } = await supabase
      .from("venues")
      .insert({
        owner_id: user.id,
        name: "Billar Aurora",
        slug,
        accent_color: "#f5c542",
        join_message: "¡Bienvenidos a Billar Aurora! Pedí tus canciones y votá en la cola en vivo.",
      })
      .select()
      .single();

    if (venueErr) {
      console.error("Error creating venue:", venueErr);
      process.exit(1);
    }
    venueId = newVenue.id;
    console.log(`Venue created with ID: ${venueId}`);

    // Create default settings
    await supabase.from("venue_settings").insert({
      venue_id: venueId,
      explicit_filter_enabled: true,
      explicit_keywords: ["gemidos", "insultos"],
      max_song_duration_seconds: 480,
      max_proposals_per_participant: 3,
      default_credits_per_code: 3,
      max_credits_per_code: 20,
      max_queue_size: 30,
      proposals_enabled: true,
    });
  } else {
    console.log(`Venue ${slug} already exists with ID: ${venueId}. Updating owner...`);
    await supabase.from("venues").update({ owner_id: user.id }).eq("id", venueId);
  }

  // 3. Seed sample tracks if empty
  const { count } = await supabase
    .from("tracks")
    .select("*", { count: "exact", head: true })
    .eq("venue_id", venueId);

  if (!count || count === 0) {
    console.log("Seeding sample tracks...");
    const sampleTracks = [
      {
        venue_id: venueId,
        source: "youtube",
        title: "De Música Ligera",
        artist: "Soda Stereo",
        duration_seconds: 207,
        youtube_video_id: "T_FkEw27XJ0",
        dedupe_key: "youtube:T_FkEw27XJ0",
        is_explicit: false,
        status: "active",
      },
      {
        venue_id: venueId,
        source: "youtube",
        title: "El Farolito",
        artist: "Los Piojos",
        duration_seconds: 252,
        youtube_video_id: "x_g-tM8p3cM",
        dedupe_key: "youtube:x_g-tM8p3cM",
        is_explicit: false,
        status: "active",
      },
      {
        venue_id: venueId,
        source: "youtube",
        title: "Mil Horas",
        artist: "Los Abuelos de la Nada",
        duration_seconds: 173,
        youtube_video_id: "KZaKqg9h0lQ",
        dedupe_key: "youtube:KZaKqg9h0lQ",
        is_explicit: false,
        status: "active",
      },
      {
        venue_id: venueId,
        source: "youtube",
        title: "Jijiji",
        artist: "Patricio Rey y sus Redonditos de Ricota",
        duration_seconds: 334,
        youtube_video_id: "oT4c0C7x6y8",
        dedupe_key: "youtube:oT4c0C7x6y8",
        is_explicit: false,
        status: "active",
      },
    ];

    const { data: insertedTracks } = await supabase
      .from("tracks")
      .insert(sampleTracks)
      .select();

    if (insertedTracks && insertedTracks.length > 0) {
      console.log(`Seeded ${insertedTracks.length} sample tracks. Adding to fallback...`);
      const fallbackRows = insertedTracks.map((t, idx) => ({
        venue_id: venueId,
        track_id: t.id,
        position: idx,
      }));
      await supabase.from("fallback_tracks").insert(fallbackRows);
    }
  }

  // 4. Create sample staff member if none exist
  const { count: staffCount } = await supabase
    .from("staff_members")
    .select("*", { count: "exact", head: true })
    .eq("venue_id", venueId);

  if (!staffCount || staffCount === 0) {
    console.log("Seeding sample staff member (PIN 123456)...");
    await supabase.rpc("owner_create_staff", {
      p_venue_id: venueId,
      p_name: "Martín (Mozo Barra)",
      p_pin: "123456",
    });
  }

  console.log("\n--- TEST USER & VENUE READY ---");
  console.log(`Email:     ${email}`);
  console.log(`Password:  ${password}`);
  console.log(`Venue:     ${slug} (Billar Aurora)`);
  console.log(`Staff PIN: 123456`);
  console.log("--------------------------------\n");
}

run().catch(console.error);
