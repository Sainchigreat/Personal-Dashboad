// Verifies the additive PostgreSQL goal-hierarchy migration against a real
// PostgreSQL engine (PGlite). No network, no Supabase writes, no secrets.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const strip = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

const base = strip("supabase/migrations/20261102000400_momentum_os_compat.sql");
const migration = strip("supabase/migrations/20261102000500_goal_hierarchy.sql");

describe("additive PostgreSQL goal-hierarchy migration", () => {
  it("creates the hierarchy, links tasks, and is safe to re-run", async () => {
    const pg = new PGlite();
    await pg.exec(base);
    await pg.exec(migration);
    // Re-running must not fail and must not destroy anything.
    await pg.exec(migration);

    const tables = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema='momentum_os'
         and table_name in ('monthly_goals','weekly_goals','goal_links')`,
    );
    expect(tables.rows.map((r) => r.table_name).sort()).toEqual([
      "goal_links",
      "monthly_goals",
      "weekly_goals",
    ]);

    const column = await pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema='momentum_os' and table_name='tasks'
         and column_name='weekly_goal_id'`,
    );
    expect(column.rows).toHaveLength(1);

    const indexes = await pg.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname='momentum_os'
         and indexname like 'idx_%goal%' or indexname like 'uq_%goal%'`,
    );
    expect(indexes.rows.length).toBeGreaterThanOrEqual(7);

    // Existing tables are still present (nothing dropped).
    const original = await pg.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema='momentum_os' and table_type='BASE TABLE'`,
    );
    expect(original.rows[0].count).toBeGreaterThanOrEqual(32);

    // Foreign keys are enforced across the hierarchy.
    const fks = await pg.query<{ count: number }>(
      `select count(*)::int as count from pg_constraint
       where contype='f' and connamespace='momentum_os'::regnamespace`,
    );
    expect(fks.rows[0].count).toBeGreaterThanOrEqual(50);

    await pg.close();
  }, 30000);
});
