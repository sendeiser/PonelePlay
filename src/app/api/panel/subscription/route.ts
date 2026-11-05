import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/api/supabase/admin";

const SUBSCRIPTION_CONFIG_KEY = "__subscription_config__";

export interface VenueSubscriptionState {
  planId: string;
  planName: string;
  category: "bar" | "party";
  status: "active" | "trial" | "expired";
  billingCycle: "event" | "pack" | "monthly" | "annual";
  priceArs: number;
  activatedAt: string;
  expiresAt: string;
  maxTvScreens: number;
  features: string[];
}

const DEFAULT_SUBSCRIPTION: VenueSubscriptionState = {
  planId: "bar_pro_monthly",
  planName: "Bar Pro Mensual",
  category: "bar",
  status: "active",
  billingCycle: "monthly",
  priceArs: 24900,
  activatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  maxTvScreens: 4,
  features: [
    "Noches y sesiones ilimitadas",
    "Emisión ilimitada de tickets de créditos para mesas",
    "Hasta 4 pantallas Smart TV / Android TV sincronizadas",
    "Filtro acústico inteligente y moderación desde cabina",
  ],
};

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabase();
    const { data: venue } = await supabase
      .from("venues")
      .select("id, name")
      .eq("slug", slug)
      .maybeSingle();

    if (!venue) {
      return NextResponse.json({ subscription: DEFAULT_SUBSCRIPTION });
    }

    const v = venue as { id: string; name: string };
    const { data: row } = await supabase
      .from("venue_playlists")
      .select("description")
      .eq("venue_id", v.id)
      .eq("name", SUBSCRIPTION_CONFIG_KEY)
      .maybeSingle();

    if (row && typeof (row as { description?: string }).description === "string") {
      try {
        const parsed = JSON.parse(
          (row as { description: string }).description,
        ) as VenueSubscriptionState;
        return NextResponse.json({
          ok: true,
          venueName: v.name,
          subscription: parsed,
        });
      } catch {
        // Fallback below
      }
    }

    return NextResponse.json({
      ok: true,
      venueName: v.name,
      subscription: DEFAULT_SUBSCRIPTION,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      subscription: DEFAULT_SUBSCRIPTION,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      slug?: string;
      subscription?: Partial<VenueSubscriptionState>;
    };

    if (!body.slug || !body.subscription) {
      return NextResponse.json({ error: "Missing slug or subscription" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: venue } = await supabase
      .from("venues")
      .select("id")
      .eq("slug", body.slug)
      .maybeSingle();

    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const venueId = (venue as { id: string }).id;
    const now = new Date();
    const cycle = body.subscription.billingCycle || "monthly";
    const daysToAdd =
      cycle === "event" ? 2 : cycle === "pack" ? 90 : cycle === "annual" ? 365 : 30;

    const nextSub: VenueSubscriptionState = {
      planId: body.subscription.planId || "bar_pro_monthly",
      planName: body.subscription.planName || "Bar Pro Mensual",
      category: body.subscription.category || "bar",
      status: body.subscription.status || "active",
      billingCycle: cycle,
      priceArs: Number(body.subscription.priceArs) || 24900,
      activatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString(),
      maxTvScreens: Number(body.subscription.maxTvScreens) || 4,
      features: Array.isArray(body.subscription.features)
        ? body.subscription.features
        : DEFAULT_SUBSCRIPTION.features,
    };

    const { data: existing } = await supabase
      .from("venue_playlists")
      .select("id")
      .eq("venue_id", venueId)
      .eq("name", SUBSCRIPTION_CONFIG_KEY)
      .maybeSingle();

    if (existing && (existing as { id?: string }).id) {
      await supabase
        .from("venue_playlists")
        .update({ description: JSON.stringify(nextSub) })
        .eq("id", (existing as { id: string }).id);
    } else {
      await supabase.from("venue_playlists").insert({
        venue_id: venueId,
        name: SUBSCRIPTION_CONFIG_KEY,
        description: JSON.stringify(nextSub),
      });
    }

    return NextResponse.json({
      ok: true,
      subscription: nextSub,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save subscription" },
      { status: 500 },
    );
  }
}
