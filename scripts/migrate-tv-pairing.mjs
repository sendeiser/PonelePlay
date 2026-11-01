import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const sqlPath = path.resolve(__dirname, "../supabase/migrations/20261101300000_tv_pairing.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const res = await fetch("https://api.supabase.com/v1/projects/kbeljbnrnyxfjwmdpaew/database/query", {
    method: "POST",
    headers: {
      "Authorization": "Bearer YOUR_SUPABASE_ACCESS_TOKEN",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  });

  console.log("Migration TV Pairing HTTP Status:", res.status);
  const data = await res.json();
  console.log("Migration Result:", data);
}

run().catch(console.error);
