import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../database.types";

let cachedClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createBrowserSupabase() {
  if (!cachedClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy-project.supabase.co";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
    cachedClient = createBrowserClient<Database>(url, key);
  }
  return cachedClient;
}
