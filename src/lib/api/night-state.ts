import { createBrowserSupabase } from "./supabase/browser";
import { nightStateSchema, type NightState } from "./contracts";
import type { NightStateSource } from "@/hooks/use-night-state";

export async function fetchNightState(slug: string): Promise<NightState> {
  const supabase = createBrowserSupabase();

  const { data, error } = await supabase.rpc("get_night_state" as never, {
    p_venue_slug: slug,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return nightStateSchema.parse(data);
}

export function createNightStateSource(slug: string): NightStateSource {
  return {
    fetch: () => fetchNightState(slug),
    subscribe: (onChange: () => void) => {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel(`night-state:${slug}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "queue_items" },
          () => onChange(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "night_sessions" },
          () => onChange(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "votes" },
          () => onChange(),
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}
