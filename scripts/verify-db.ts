// Verifies a REAL server-side PostgreSQL connection + write/read persistence
// round trip against the existing Supabase Momentum project.
// Run from a machine with outbound database access: npm run verify:db
import { config } from "dotenv";
import {
  checkPostgresConnection,
  closePool,
  databaseUrl,
} from "../server/postgres.ts";

config({ path: ".env.local" });
config();

if (!databaseUrl()) {
  console.error(
    "DATABASE_URL is not set. Add the Supabase pooled connection string to " +
      ".env.local (local) or Netlify Site configuration -> Environment variables (deploy).",
  );
  console.error("Never commit it and never expose it with a VITE_ prefix.");
  process.exit(1);
}

try {
  const result = await checkPostgresConnection();
  console.log("PostgreSQL connection verified:");
  console.log(JSON.stringify(result, null, 2));
  console.log("Round trip OK: a row was written and read back from momentum_os.integration_checks.");
} catch (error) {
  console.error(
    "Connection check failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await closePool();
}
