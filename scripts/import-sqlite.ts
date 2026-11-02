// Repeatable SQLite -> PostgreSQL import in foreign-key-safe order.
// Additive: ON CONFLICT DO NOTHING, no DELETE / TRUNCATE / DROP anywhere.
// Preserves TEXT UUID ids and all relationships. Preview/demo databases are
// never imported unless an explicit --source path is supplied.
//
// Usage: npm run import:sqlite -- --source ./data/workspace/momentum.sqlite
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const source = resolve(
  sourceIndex >= 0 ? args[sourceIndex + 1] : "data/workspace/momentum.sqlite",
);
const connectionString = process.env.DATABASE_URL || "";

if (!connectionString) {
  console.error("DATABASE_URL is required (server-side secret).");
  process.exit(1);
}
if (!existsSync(source)) {
  console.log(`No SQLite database at ${source}.`);
  console.log(
    "No production SQLite data exists in this checkout, so there is nothing to migrate. " +
      "The schema and seed strategy are preserved by supabase/migrations/20261102000400_momentum_os_compat.sql.",
  );
  process.exit(0);
}

// Parents before children. `tasks` has a self-reference, handled in two passes.
const ORDER = [
  "users", "auth_sessions", "settings", "cycles", "products", "projects",
  "chapter_sessions", "tasks", "generated_days", "sales", "leads", "campaigns",
  "promotions", "prospects", "interactions", "jobs", "content_items",
  "session_checklists", "daily_notes", "weekly_reviews", "team_workspaces",
  "team_members", "team_invites", "team_goals", "team_tasks", "team_comments",
  "team_activity", "app_migrations",
];

const sqlite = new DatabaseSync(source, { readOnly: true } as never);
const pool = new Pool({
  connectionString,
  max: 3,
  ssl: /supabase|sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

const tables = new Set(
  (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
    .map((row) => row.name),
);

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
let imported = 0;
const report: Array<{ table: string; before: number; after: number }> = [];

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of ORDER) {
      if (!tables.has(table)) continue;
      const columns = (
        sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{
          name: string;
          pk: number;
        }>
      ).map((column) => column.name);
      if (columns.length === 0) continue;
      const rows = sqlite
        .prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)}`)
        .all() as Array<Record<string, unknown>>;
      const beforeResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM momentum_os.${quote(table)}`,
      );
      const before = Number(beforeResult.rows[0].count);

      const hasCarried = table === "tasks" && columns.includes("carried_from_id");
      const insertColumns = hasCarried
        ? columns.filter((column) => column !== "carried_from_id")
        : columns;
      const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(",");
      const insertSql = `INSERT INTO momentum_os.${quote(table)} (${insertColumns.map(quote).join(",")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      const carried: Array<{ id: unknown; from: unknown }> = [];
      for (const row of rows) {
        const values = insertColumns.map((column) => row[column] ?? null);
        await client.query(insertSql, values);
        if (hasCarried && row.carried_from_id != null) {
          carried.push({ id: row.id, from: row.carried_from_id });
        }
        imported += 1;
      }
      // Restore the self-reference after all tasks exist (no data is removed).
      for (const link of carried) {
        await client.query(
          "UPDATE momentum_os.tasks SET carried_from_id=$1 WHERE id=$2 AND carried_from_id IS NULL",
          [link.from, link.id],
        );
      }
      const afterResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM momentum_os.${quote(table)}`,
      );
      report.push({ table, before, after: Number(afterResult.rows[0].count) });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  console.log(`Processed ${imported} rows from ${source}.`);
  console.table(report);
  console.log("Verify linked records manually before retiring the SQLite backup.");
  console.log("No rows were deleted, truncated or overwritten.");
} finally {
  await pool.end();
  sqlite.close();
}
