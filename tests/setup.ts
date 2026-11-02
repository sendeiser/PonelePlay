import "@testing-library/jest-dom/vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kbeljbnrnyxfjwmdpaew.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZWxqYm5ybnl4Zmp3bWRwYWV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjQ4MDgsImV4cCI6MjEwOTA0MDgwOH0.ykyPCpxUy9_Dqyx5PdgsdK1gYjuat82v-zMTGDrjxJU";
