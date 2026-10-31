import { createBrowserSupabase } from "./supabase/browser";

export async function signInOwner(email: string, password: string): Promise<{ error?: string }> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return {};
}

export async function signUpOwner(input: { email: string; password: string; venueName: string; slug: string }): Promise<{ error?: string; slug?: string }> {
  const supabase = createBrowserSupabase();
  const { error: authError } = await supabase.auth.signUp({ email: input.email, password: input.password });
  if (authError) return { error: authError.message };
  return { slug: input.slug };
}

export async function signOutOwner(): Promise<void> {
  const supabase = createBrowserSupabase();
  await supabase.auth.signOut();
}
