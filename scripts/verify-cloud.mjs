// Verifies the live Momentum AI backend from any machine with internet access.
// Usage: npm run verify:cloud  (reads .env.local / .env)
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const url = (process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!url || !key) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local first.");
  process.exit(1);
}

const endpoint = `${url}/functions/v1/momentum-api/health`;
console.log(`Checking ${endpoint} ...`);

try {
  const response = await fetch(endpoint, {
    headers: { apikey: key, "Content-Type": "application/json" },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  console.log("Momentum Cloud is live:");
  console.log(JSON.stringify(body, null, 2));
} catch (error) {
  console.error("Could not reach the cloud backend:", error.message);
  console.error("This sandbox has restricted outbound network access; run it from your own machine.");
  process.exitCode = 1;
}
