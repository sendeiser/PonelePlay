import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

// Load .env.local
const envFile = fs.readFileSync(".worktrees/poneleplay-v1/.env.local", "utf-8");
let supabaseUrl = "";
let anonKey = "";
let serviceRoleKey = "";

for (const line of envFile.split("\n")) {
  const [k, ...rest] = line.split("=");
  const val = rest.join("=").trim().replace(/['"]/g, "");
  if (k.trim() === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = val;
  if (k.trim() === "NEXT_PUBLIC_SUPABASE_ANON_KEY") anonKey = val;
  if (k.trim() === "SUPABASE_SERVICE_ROLE_KEY") serviceRoleKey = val;
}

if (!supabaseUrl || !anonKey) {
  console.error("Missing supabase URL or anon key in .env.local");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

let passed = 0;
let failed = 0;

function assert(condition, message, error = null) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}${error ? ` | Error: ${JSON.stringify(error)}` : ""}`);
    failed++;
  }
}

async function run() {
  console.log("\n==========================================");
  console.log("   PONELEPLAY LIVE END-TO-END FEATURE TEST");
  console.log("==========================================\n");

  const email = "demo@poneleplay.com";
  const password = "poneleplay2026";
  const slug = "billar-aurora";

  // ----------------------------------------------------
  // TEST 1: Owner Authentication
  // ----------------------------------------------------
  console.log("[1/11] Testing Owner Authentication...");
  const ownerClient = createClient(supabaseUrl, anonKey);
  const { data: authData, error: authError } = await ownerClient.auth.signInWithPassword({
    email,
    password,
  });

  assert(!authError && !!authData?.user, "Owner can sign in successfully with password", authError);
  const ownerId = authData?.user?.id;
  assert(!!ownerId, `Owner user ID acquired: ${ownerId}`);

  // ----------------------------------------------------
  // TEST 2: Venue and Settings Retrieval
  // ----------------------------------------------------
  console.log("\n[2/11] Testing Venue & Venue Settings...");
  const { data: venue, error: venueError } = await ownerClient
    .from("venues")
    .select("id, name, slug, owner_id")
    .eq("slug", slug)
    .single();

  assert(!venueError && !!venue, `Venue fetched: ${venue?.name} (${venue?.id})`, venueError);
  assert(venue?.owner_id === ownerId, "Venue belongs to the authenticated owner");
  const venueId = venue.id;

  const { data: settings, error: settingsError } = await ownerClient
    .from("venue_settings")
    .select("*")
    .eq("venue_id", venueId)
    .single();

  assert(!settingsError && !!settings, "Venue settings retrieved", settingsError);

  // ----------------------------------------------------
  // TEST 3: Venue Settings Update
  // ----------------------------------------------------
  console.log("\n[3/11] Testing Venue Settings Update...");
  const newMaxProposals = 5;
  const { error: updateSettingsError } = await ownerClient
    .from("venue_settings")
    .update({ max_proposals_per_participant: newMaxProposals })
    .eq("venue_id", venueId);

  assert(!updateSettingsError, "Owner can update venue settings", updateSettingsError);

  const { data: updatedSettings } = await ownerClient
    .from("venue_settings")
    .select("max_proposals_per_participant")
    .eq("venue_id", venueId)
    .single();
  assert(updatedSettings?.max_proposals_per_participant === newMaxProposals, "Settings persist correctly");

  // Restore
  await ownerClient.from("venue_settings").update({ max_proposals_per_participant: 3 }).eq("venue_id", venueId);

  // ----------------------------------------------------
  // TEST 4: Staff Management (RPCs)
  // ----------------------------------------------------
  console.log("\n[4/11] Testing Staff Management RPCs...");
  // List staff
  const { data: initialStaff, error: listStaffErr } = await ownerClient.rpc("owner_list_staff", {
    p_venue_id: venueId,
  });
  assert(!listStaffErr && Array.isArray(initialStaff), "Owner can list staff members", listStaffErr);

  // Create staff
  const testStaffName = `Camarero Test ${Date.now().toString().slice(-4)}`;
  const { data: createStaffRes, error: createStaffErr } = await ownerClient.rpc("owner_create_staff", {
    p_venue_id: venueId,
    p_name: testStaffName,
    p_pin: "654321",
  });
  const newStaffId = createStaffRes?.staffId;
  assert(!createStaffErr && !!newStaffId, `Staff created successfully (ID: ${newStaffId})`, createStaffErr);

  // Reset PIN
  if (newStaffId) {
    const { data: resetRes, error: resetPinErr } = await ownerClient.rpc("owner_reset_staff_pin", {
      p_staff_id: newStaffId,
      p_pin: "999888",
    });
    assert(!resetPinErr && resetRes?.ok === true, "Owner can reset staff PIN", resetPinErr);

    // Toggle active
    const { data: toggleRes, error: toggleErr } = await ownerClient.rpc("owner_toggle_staff_active", {
      p_staff_id: newStaffId,
      p_active: false,
    });
    assert(!toggleErr && toggleRes?.ok === true, "Owner can toggle staff active status", toggleErr);

    // Clean up created staff member
    await adminClient.from("staff_members").delete().eq("id", newStaffId);
  }

  // ----------------------------------------------------
  // TEST 5: Catalog & Fallback Tracks Management
  // ----------------------------------------------------
  console.log("\n[5/11] Testing Catalog & Fallback Management...");
  const { data: catalog, error: catalogErr } = await ownerClient
    .from("tracks")
    .select("id, title, artist, status")
    .eq("venue_id", venueId);
  assert(!catalogErr && catalog?.length >= 4, `Catalog has ${catalog?.length} tracks`, catalogErr);

  // Add new test track
  const { data: addedTrack, error: addTrackErr } = await ownerClient
    .from("tracks")
    .insert({
      venue_id: venueId,
      source: "youtube",
      title: "Test Track Song",
      artist: "Test Artist",
      duration_seconds: 180,
      youtube_video_id: "dQw4w9WgXcQ",
      dedupe_key: `youtube:dQw4w9WgXcQ:${Date.now()}`,
      status: "active",
      is_explicit: false,
    })
    .select()
    .single();
  assert(!addTrackErr && !!addedTrack, "Owner can add a track to catalog", addTrackErr);

  if (addedTrack) {
    // Toggle status (active -> archived)
    const { error: toggleTrackErr } = await ownerClient
      .from("tracks")
      .update({ status: "archived" })
      .eq("id", addedTrack.id);
    assert(!toggleTrackErr, "Owner can archive track status", toggleTrackErr);

    // Add to fallback and test reorder
    const { error: addFallbackErr } = await ownerClient
      .from("fallback_tracks")
      .insert({ venue_id: venueId, track_id: addedTrack.id, position: 99 });
    assert(!addFallbackErr, "Track can be added to fallback playlist", addFallbackErr);

    const { error: reorderErr } = await ownerClient.rpc("owner_reorder_fallback", {
      p_venue_id: venueId,
      p_track_ids: [addedTrack.id],
    });
    assert(!reorderErr, "owner_reorder_fallback RPC executes without error", reorderErr);

    // Clean up fallback & test track
    await adminClient.from("fallback_tracks").delete().eq("track_id", addedTrack.id);
    await adminClient.from("tracks").delete().eq("id", addedTrack.id);
  }

  // ----------------------------------------------------
  // TEST 6: Night Session Lifecycle (Open / State)
  // ----------------------------------------------------
  console.log("\n[6/11] Testing Night Lifecycle (Open / State)...");
  // Check if night already open; if not open it
  let { data: nightState } = await ownerClient.rpc("get_night_state", {
    p_venue_slug: slug,
  });

  if (!nightState?.night?.id) {
    const { data: openedNight, error: openNightErr } = await ownerClient.rpc("owner_open_night");
    assert(!openNightErr && !!openedNight, "owner_open_night opens session", openNightErr);
    const refreshed = await ownerClient.rpc("get_night_state", { p_venue_slug: slug });
    nightState = refreshed.data;
  } else {
    assert(true, "Active night session found");
  }

  assert(!!nightState && !!nightState?.night?.id, "get_night_state returns active night data");
  assert(nightState?.night?.status === "open", "Night session status is 'open'");

  // ----------------------------------------------------
  // TEST 7: Vote Code Generation
  // ----------------------------------------------------
  console.log("\n[7/11] Testing Vote Code Generation & Print Tracking...");
  const { data: generatedCode, error: genCodeErr } = await ownerClient.rpc("owner_generate_code", {
    p_credits: 5,
  });
  assert(!genCodeErr && !!generatedCode?.code, `Generated vote code: ${generatedCode?.code}`, genCodeErr);
  const testCode = generatedCode?.code;
  const testCodeId = generatedCode?.id;

  // Increment print count
  if (testCodeId) {
    const { error: printErr } = await ownerClient.rpc("increment_code_prints", {
      p_code_id: testCodeId,
    });
    assert(!printErr, "increment_code_prints RPC updates print count", printErr);
  }

  // Get code history
  const { data: codeHistory, error: historyErr } = await ownerClient.rpc("get_code_history");
  assert(!historyErr && Array.isArray(codeHistory) && codeHistory.length > 0, `get_code_history returned ${codeHistory?.length} items`, historyErr);

  // ----------------------------------------------------
  // TEST 8: Client Flow (Join, Redeem, Propose, Vote)
  // ----------------------------------------------------
  console.log("\n[8/11] Testing Client Flow (Anonymous Sign-In, Join, Redeem, Propose, Vote)...");
  const anonClient = createClient(supabaseUrl, anonKey);
  const { error: anonSignInErr } = await anonClient.auth.signInAnonymously();
  assert(!anonSignInErr, "Anonymous client can authenticate via Supabase Auth", anonSignInErr);

  // Join night
  const { data: joinRes, error: joinErr } = await anonClient.rpc("join_night", {
    p_venue_slug: slug,
  });
  assert(!joinErr && !!joinRes, "Anonymous client can join night via join_night", joinErr);
  const participantId = joinRes?.participantId;
  assert(!!participantId, `Participant ID created: ${participantId}`);

  // Redeem code
  const { data: redeemRes, error: redeemErr } = await anonClient.rpc("redeem_code", {
    p_code: testCode,
  });
  assert(!redeemErr && redeemRes?.ok === true, `Redeemed code for ${redeemRes?.credits} credits. New balance: ${redeemRes?.balance}`, redeemErr);

  // Propose a track
  const sampleTrack = catalog[0];
  const uniqueKey = `yt:${sampleTrack.id}:${Date.now()}`;
  const { data: proposalRes, error: proposeErr } = await anonClient.rpc("propose_track", {
    p_track: {
      title: `${sampleTrack.title} (Live)`,
      artist: sampleTrack.artist,
      durationSeconds: 210,
      youtubeVideoId: "uniqueVid123",
      dedupeKey: uniqueKey,
    },
  });
  assert(!proposeErr && !!proposalRes?.itemId, `Proposed track to queue (Item ID: ${proposalRes?.itemId})`, proposeErr);
  const queueItemId = proposalRes?.itemId;

  // Cast a vote
  const { data: voteRes, error: voteErr } = await anonClient.rpc("cast_vote", {
    p_queue_item_id: queueItemId,
  });
  assert(!voteErr && voteRes?.ok === true, `Voted on track. Votes: ${voteRes?.voteCount}, Balance: ${voteRes?.balance}`, voteErr);

  // Rate limiting RPC
  const { data: rateLimitOk, error: rateLimitErr } = await anonClient.rpc("consume_rate_limit", {
    p_key: `test:rate-limit-${Date.now()}`,
    p_limit: 10,
    p_window_seconds: 60,
    p_ttl_seconds: 120,
  });
  assert(!rateLimitErr && rateLimitOk === true, "consume_rate_limit permits valid request", rateLimitErr);

  // ----------------------------------------------------
  // TEST 9: Moderation & Queue Actions
  // ----------------------------------------------------
  console.log("\n[9/11] Testing Moderation & Queue Actions...");
  if (queueItemId) {
    const { data: qItem } = await adminClient
      .from("queue_items")
      .select("status")
      .eq("id", queueItemId)
      .single();

    const actionToTest = qItem?.status === "playing" ? "skip" : "veto";
    const { data: modRes, error: modErr } = await ownerClient.rpc("owner_queue_action", {
      p_item_id: queueItemId,
      p_action: actionToTest,
    });
    assert(!modErr && modRes?.ok === true, `owner_queue_action '${actionToTest}' moderates item from active queue`, modErr || modRes);
  }

  // ----------------------------------------------------
  // TEST 10: Player Screen Device Pairing & State
  // ----------------------------------------------------
  console.log("\n[10/11] Testing Player Screen Device Pairing & Runtime...");
  // Pair player
  const { data: pairedDevice, error: pairErr } = await ownerClient.rpc("owner_pair_player", {
    p_venue_id: venueId,
    p_name: "Bar TV Principal",
  });
  assert(!pairErr && pairedDevice?.ok === true && !!pairedDevice?.token, "Player device paired successfully", pairErr);
  const playerToken = pairedDevice?.token;
  const playerDeviceId = pairedDevice?.deviceId;

  // Fetch player state
  if (playerToken) {
    const { data: pState, error: pStateErr } = await anonClient.rpc("player_state", {
      p_token: playerToken,
    });
    assert(!pStateErr && pState?.ok === true, "player_state returns current audio runtime state", pStateErr);
    assert(Array.isArray(pState?.fallback), `Player received ${pState?.fallback?.length} fallback tracks`);

    // Revoke player
    if (playerDeviceId) {
      const { data: revokeRes, error: revokeErr } = await ownerClient.rpc("owner_revoke_player", {
        p_device_id: playerDeviceId,
      });
      assert(!revokeErr && revokeRes?.ok === true, "owner_revoke_player revokes device successfully", revokeErr);
    }
  }

  // ----------------------------------------------------
  // TEST 11: Night Summary & Night Close
  // ----------------------------------------------------
  console.log("\n[11/11] Testing Night Summary & Night Close...");
  const { data: summary, error: summaryErr } = await ownerClient.rpc("owner_night_summary", {
    p_venue_id: venueId,
  });
  assert(!summaryErr && !!summary, "owner_night_summary returns statistics", summaryErr);
  assert(typeof summary?.votesCount === "number", `Summary votesCount: ${summary?.votesCount}`);
  assert(typeof summary?.creditsIssued === "number", `Summary creditsIssued: ${summary?.creditsIssued}`);

  // Test closing night
  const { data: closeRes, error: closeErr } = await ownerClient.rpc("owner_close_night");
  assert(!closeErr && closeRes?.status === "closed", "owner_close_night closes active session", closeErr);

  const { data: closedState, error: closedStateErr } = await ownerClient.rpc("get_night_state", {
    p_venue_slug: slug,
  });
  assert(!closedStateErr && (closedState?.night === null || !closedState?.night?.id), "Night session is confirmed closed in get_night_state", closedStateErr || closedState?.night);

  // Re-open for user convenience so the venue is left in ready state
  await ownerClient.rpc("owner_open_night");
  console.log("  (Re-opened night session so demo environment is live and ready)");

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log("\n==========================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("==========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("UNEXPECTED ERROR IN TEST RUNNER:", err);
  process.exit(1);
});
