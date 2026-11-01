import { createBrowserSupabase } from "./supabase/browser";

export async function signInOwner(email: string, password: string): Promise<{ error?: string }> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return {};
}

export async function signUpOwner(input: { email: string; password: string; venueName: string; slug: string }): Promise<{ error?: string; slug?: string }> {
  const supabase = createBrowserSupabase();
  const { data: authData, error: authError } = await supabase.auth.signUp({ email: input.email, password: input.password });
  if (authError) return { error: authError.message };
  if (authData.user) {
    const { error: venueError } = await supabase.from("venues").insert({
      owner_id: authData.user.id,
      name: input.venueName,
      slug: input.slug,
    });
    if (venueError) return { error: venueError.message, slug: input.slug };
  }
  return { slug: input.slug };
}

export async function signOutOwner(): Promise<void> {
  const supabase = createBrowserSupabase();
  await supabase.auth.signOut();
}

export async function getOwnerVenueSlug(): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: venue } = await supabase
    .from("venues")
    .select("slug")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  return venue?.slug ?? null;
}
