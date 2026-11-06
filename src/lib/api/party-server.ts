import { createAdminSupabase } from "@/lib/api/supabase/admin";
import {
  DEFAULT_BAR_PARTY_CONFIG,
  DEFAULT_PARTY_CONFIG,
  type PartyConfig,
} from "@/lib/domain/party";
import { normalizePartyConfigPatch } from "@/lib/api/party-control";

export interface PartyItemMeta {
  guestName?: string | null;
  dedication?: string | null;
  isKaraoke?: boolean;
  isGuestProposal?: boolean;
}

export async function loadVenuePartyConfigFromDb(
  admin: ReturnType<typeof createAdminSupabase>,
  slug: string,
): Promise<{
  venueId: string | null;
  partyConfig: PartyConfig;
  itemMeta: Record<string, PartyItemMeta>;
}> {
  const { data: venue } = await admin
    .from("venues")
    .select("id, accent_color, join_message")
    .eq("slug", slug)
    .maybeSingle();

  if (!venue?.id) {
    return {
      venueId: null,
      partyConfig: DEFAULT_BAR_PARTY_CONFIG,
      itemMeta: {},
    };
  }

  const inferredPartyFromVenue =
    venue.accent_color?.toUpperCase() === "#EC4899" ||
    Boolean(venue.join_message && venue.join_message.toLowerCase().includes("fiesta"));

  let baseConfig: PartyConfig = inferredPartyFromVenue
    ? { ...DEFAULT_PARTY_CONFIG }
    : { ...DEFAULT_BAR_PARTY_CONFIG };

  // 1. Check venue_settings columns first as fallback base
  try {
    const { data: settingsRow } = await admin
      .from("venue_settings")
      .select("*")
      .eq("venue_id", venue.id)
      .maybeSingle();

    const s = settingsRow as Record<string, unknown> | null;
    if (s && typeof s.venue_type === "string") {
      baseConfig = normalizePartyConfigPatch(
        {
          venueType: s.venue_type === "party" ? "party" : baseConfig.venueType,
          partyMode: (s.party_mode as PartyConfig["partyMode"]) ?? baseConfig.partyMode,
          votesPerGuest:
            typeof s.party_votes_per_guest === "number"
              ? s.party_votes_per_guest
              : baseConfig.votesPerGuest,
          minVotesToQueue:
            typeof s.party_min_votes_to_queue === "number"
              ? s.party_min_votes_to_queue
              : baseConfig.minVotesToQueue,
          allowDedications:
            typeof s.allow_dedications === "boolean"
              ? s.allow_dedications
              : baseConfig.allowDedications,
          dedicationRepeats:
            typeof s.dedication_repeats === "number"
              ? s.dedication_repeats
              : baseConfig.dedicationRepeats,
          dedicationStyle:
            typeof s.dedication_style === "string"
              ? (s.dedication_style as PartyConfig["dedicationStyle"])
              : baseConfig.dedicationStyle,
          allowGuestKaraoke:
            typeof s.allow_guest_karaoke === "boolean"
              ? s.allow_guest_karaoke
              : baseConfig.allowGuestKaraoke,
          turboCooldownSeconds:
            typeof s.turbo_cooldown_seconds === "number"
              ? s.turbo_cooldown_seconds
              : baseConfig.turboCooldownSeconds,
        },
        baseConfig,
      );
    }
  } catch {
    // Non-blocking fallback
  }

  // 2. Check authoritative venue_playlists __party_config__ and __party_item_meta__
  const { data: rows } = await admin
    .from("venue_playlists")
    .select("name, description")
    .eq("venue_id", venue.id)
    .in("name", ["__party_config__", "__party_item_meta__"]);

  let itemMeta: Record<string, PartyItemMeta> = {};

  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r.name === "__party_config__" && r.description) {
        try {
          const parsed = JSON.parse(r.description) as Partial<PartyConfig>;
          baseConfig = normalizePartyConfigPatch(parsed, baseConfig);
        } catch {
          // Ignore malformed JSON
        }
      } else if (r.name === "__party_item_meta__" && r.description) {
        try {
          itemMeta = JSON.parse(r.description) as Record<string, PartyItemMeta>;
        } catch {
          // Ignore malformed JSON
        }
      }
    }
  }

  if (inferredPartyFromVenue && baseConfig.venueType !== "party") {
    baseConfig = { ...baseConfig, venueType: "party" };
  }

  return {
    venueId: venue.id,
    partyConfig: baseConfig,
    itemMeta,
  };
}

