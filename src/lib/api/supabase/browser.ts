import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../database.types";

let cachedClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createBrowserSupabase() {
  if (!cachedClient) {
    cachedClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return cachedClient;
}
