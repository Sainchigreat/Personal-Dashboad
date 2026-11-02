// Server-only PostgreSQL connection for the EXISTING Supabase "Momentum" project.
//
// Environment variable NAMES only — values live in the host's secret store:
//   DATABASE_URL  : pooled PostgreSQL connection string (server-side ONLY).
//                   Never prefix with VITE_ and never send to the browser.
//   PG_POOL_MAX   : optional max pool size (default 5, safe for serverless).
//
// The Express API keeps its custom bcrypt / HttpOnly cookie / CSRF auth. Its
// queries are translated from SQLite dialect to PostgreSQL and scoped to the
// additive `momentum_os` schema created by
// supabase/migrations/20261102000400_momentum_os_compat.sql. The pre-existing
// `public` schema (Supabase Auth + RLS) is never touched.

import { Pool, type PoolClient } from "pg";

export const PG_SCHEMA = "momentum_os";

/** Tables from server/schema.sql, used only to qualify identifiers. */
export const TABLES = [
  "app_migrations", "users", "auth_sessions", "settings", "cycles", "products",
  "projects", "chapter_sessions", "tasks", "generated_days", "sales", "leads",
  "campaigns", "promotions", "prospects", "interactions", "jobs",
  "content_items", "session_checklists", "daily_notes", "weekly_reviews",
  "team_workspaces", "team_members", "team_invites", "team_goals", "team_tasks",
  "team_comments", "team_activity", "integration_checks",
] as const;

const TABLE_PATTERN = new RegExp(`\\b(${TABLES.join("|")})\\b`, "g");

export function databaseUrl(): string {
  return process.env.DATABASE_URL || "";
}
export function isPostgresConfigured(): boolean {
  return Boolean(databaseUrl());
}

/** SQLite `?` placeholders -> PostgreSQL `$1..$n`, ignoring string literals. */
export function translatePlaceholders(sql: string): string {
  let out = "";
  let index = 0;
  let quoted = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'") {
      // Two consecutive quotes are an escaped quote inside a string literal.
      if (quoted && sql[i + 1] === "'") {
        out += "''";
        i += 1;
        continue;
      }
      quoted = !quoted;
      out += char;
      continue;
    }
    if (char === "?" && !quoted) {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += char;
  }
  return out;
}

/** Prefix known table names with the additive schema, without touching aliases. */
export function qualifyTables(sql: string): string {
  return sql.replace(TABLE_PATTERN, (match, _group: string, offset: number) => {
    if (offset > 0 && sql[offset - 1] === ".") return match;
    const before = sql.slice(Math.max(0, offset - 40), offset);
    if (/(?:from|join|into|update|table)\s+$/i.test(before)) {
      return `${PG_SCHEMA}.${match}`;
    }
    if (/delete\s+from\s+$/i.test(before)) return `${PG_SCHEMA}.${match}`;
    return match;
  });
}

/** Translate SQLite dialect constructs used by the existing Express queries. */
export function toPostgres(sql: string): string {
  const trimmed = sql.trim();
  if (/^PRAGMA\b/i.test(trimmed)) return ""; // no PostgreSQL equivalent needed
  let result = trimmed
    .replace(/^BEGIN\s+IMMEDIATE\b/i, "BEGIN")
    .replace(/^BEGIN\s+EXCLUSIVE\b/i, "BEGIN")
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");
  const orIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(trimmed);
  result = translatePlaceholders(result);
  result = qualifyTables(result);
  if (orIgnore && !/\bON\s+CONFLICT\b/i.test(result)) {
    result = result.replace(/;?\s*$/, " ON CONFLICT DO NOTHING");
  }
  return result;
}

/** Keep the existing Express error handler's SQLite message working. */
export function normaliseError(error: unknown): Error {
  const value = error as { code?: string; message?: string };
  if (value?.code === "23505") {
    return new Error("UNIQUE constraint failed: a record for this date or month already exists.");
  }
  if (value?.code === "23503") {
    return new Error("INVALID_REFERENCE: the selected record is unavailable.");
  }
  return error instanceof Error ? error : new Error(String(error));
}

let pool: Pool | null = null;
export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured. Set it in the server/Netlify environment only.");
  }
  pool = new Pool({
    connectionString,
    max: Math.max(1, Number(process.env.PG_POOL_MAX || 5)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    // Supabase pooler is TLS; no startup `options` (pgBouncer transaction mode
    // rejects them), so tables are qualified explicitly instead.
    ssl: /sslmode=require|supabase\.co|supabase\.com/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  pool.on("error", (error) => console.error("Postgres pool error:", error.message));
  return pool;
}

type Executor = Pick<Pool, "query"> | Pick<PoolClient, "query">;

async function execute<T extends Record<string, unknown> = Record<string, unknown>>(
  runner: Executor,
  sql: string,
  params: unknown[] = [],
) {
  const translated = toPostgres(sql);
  if (!translated) return { rows: [] as T[], changes: 0 };
  try {
    const result = await runner.query(translated, params);
    return { rows: (result.rows || []) as T[], changes: result.rowCount ?? 0 };
  } catch (error) {
    throw normaliseError(error);
  }
}

export async function pgGet<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string, params: unknown[] = [], runner: Executor = getPool(),
): Promise<T | undefined> {
  return (await execute<T>(runner, sql, params)).rows[0];
}
export async function pgAll<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string, params: unknown[] = [], runner: Executor = getPool(),
): Promise<T[]> {
  return (await execute<T>(runner, sql, params)).rows;
}
export async function pgRun(
  sql: string, params: unknown[] = [], runner: Executor = getPool(),
): Promise<{ changes: number }> {
  const result = await execute(runner, sql, params);
  return { changes: result.changes };
}

/** Transaction boundary preserving the API's BEGIN / COMMIT / ROLLBACK usage. */
export async function pgTransaction<T>(
  work: (helpers: {
    get: typeof pgGet;
    all: typeof pgAll;
    run: typeof pgRun;
  }) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const helpers = {
      get: <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        pgGet<R>(sql, params, client),
      all: <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        pgAll<R>(sql, params, client),
      run: (sql: string, params: unknown[] = []) => pgRun(sql, params, client),
    };
    const value = await work(helpers as unknown as {
      get: typeof pgGet; all: typeof pgAll; run: typeof pgRun;
    });
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw normaliseError(error);
  } finally {
    client.release();
  }
}

/**
 * Real server-side database query + write/read persistence round trip.
 * Additive only: writes one metadata row, reads it back, deletes nothing.
 */
export async function checkPostgresConnection(
  id = `verify-${Date.now()}`,
): Promise<{
  database: string;
  version: string;
  schema: string;
  roundTrip: Record<string, unknown>;
}> {
  const runner = getPool();
  const info = await runner.query(
    "select current_database() as database, version() as version, current_schema() as schema",
  );
  await runner.query(
    `insert into ${PG_SCHEMA}.integration_checks (id, label, payload)
     values ($1, $2, $3::jsonb)
     on conflict (id) do update set label = excluded.label, payload = excluded.payload`,
    [id, "server-side pg round trip", JSON.stringify({ source: "pg", at: new Date().toISOString() })],
  );
  const read = await runner.query(
    `select id, label, payload, created_at from ${PG_SCHEMA}.integration_checks where id = $1`,
    [id],
  );
  if (!read.rows[0] || read.rows[0].id !== id) {
    throw new Error("Persistence round trip failed: the written row was not readable.");
  }
  return {
    database: info.rows[0].database,
    version: String(info.rows[0].version).split(" ")[0],
    schema: info.rows[0].schema ?? "public",
    roundTrip: read.rows[0] as Record<string, unknown>,
  };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
