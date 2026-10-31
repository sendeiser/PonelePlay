import { createBrowserSupabase } from "./supabase/browser";
import { joinNightResponseSchema, type JoinNightResponse } from "./contracts";

export async function ensureAnonymousParticipant(
  slug: string,
): Promise<JoinNightResponse> {
  const supabase = createBrowserSupabase();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const { error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) {
      throw new Error(`Failed to sign in anonymously: ${anonError.message}`);
    }
  }

  const { data, error } = await supabase.rpc("join_night" as never, {
    p_venue_slug: slug,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return joinNightResponseSchema.parse(data);
}
