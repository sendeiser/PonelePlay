import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../database.types";

const DEFAULT_SUPABASE_URL = "https://kbeljbnrnyxfjwmdpaew.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZWxqYm5ybnl4Zmp3bWRwYWV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjQ4MDgsImV4cCI6MjEwOTA0MDgwOH0.ykyPCpxUy9_Dqyx5PdgsdK1gYjuat82v-zMTGDrjxJU";

let cachedClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createBrowserSupabase() {
  if (!cachedClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
    cachedClient = createBrowserClient<Database>(url, key);
  }
  return cachedClient;
}
