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
    // 29 base compat tables + 3 goal tables + 2 speaker tables = 34.
    expect(original.rows[0].count).toBeGreaterThanOrEqual(34);

    // Speaker register and onboarding columns are additive.
    const speakerTables = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema='momentum_os'
         and table_name in ('speakers','speaker_followups')`,
    );
    expect(speakerTables.rows.map((r) => r.table_name).sort()).toEqual([
      "speaker_followups",
      "speakers",
    ]);
    const onboarding = await pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema='momentum_os' and table_name='settings'
         and column_name in ('onboarding_completed','onboarding_profile')`,
    );
    expect(onboarding.rows).toHaveLength(2);

    // Foreign keys are enforced across the hierarchy.
    const fks = await pg.query<{ count: number }>(
      `select count(*)::int as count from pg_constraint
       where contype='f' and connamespace='momentum_os'::regnamespace`,
    );
    expect(fks.rows[0].count).toBeGreaterThanOrEqual(50);

    await pg.close();
  }, 30000);
});

describe("owner-scoped reconciliation migration", () => {
  it("neutralises global personal defaults and is idempotent on a real PG engine", async () => {
    const scoping = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261102000600_personal_plan_scoping.sql"),
      "utf8",
    );
    // New Supabase Auth accounts must not inherit Chisom's plan.
    expect(scoping).toContain("'[]'");
    expect(scoping).toContain("auto_plan,0");
    expect(scoping).not.toContain("Graphic Design with AI");
    expect(scoping).not.toContain("5 AM batch");

    const reconcile = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261102000700_personal_owner_reconcile.sql"),
      "utf8",
    );
    expect(reconcile).toMatch(/no DROP \/ TRUNCATE \/ DELETE/);
    expect(reconcile.toLowerCase()).not.toContain("delete from");
    expect(reconcile.toLowerCase()).not.toMatch(/\btruncate\s+table\b/);
    expect(reconcile).toContain("on conflict do nothing");

    const pg = new PGlite();
    await pg.exec(strip("supabase/migrations/20261102000400_momentum_os_compat.sql"));
    await pg.exec(strip("supabase/migrations/20261102000500_goal_hierarchy.sql"));
    await pg.exec(`
      insert into momentum_os.users(id,email,password_hash,created_at)
      values ('6d8e45af-5bb3-4e40-adb3-e605b9972c79','owner@test','hash','2026-11-02');
      insert into momentum_os.settings(id,user_id,name,timezone,work_start,work_end,theme,auto_plan,daily_templates,created_at,updated_at)
      values ('s1','6d8e45af-5bb3-4e40-adb3-e605b9972c79','Chisom','Africa/Lagos','08:00','17:00','light',1,'[]','2026-11-02','2026-11-02');
      insert into momentum_os.cycles(id,user_id,month,created_at,updated_at)
      values ('c1','6d8e45af-5bb3-4e40-adb3-e605b9972c79','2026-11','2026-11-02','2026-11-02');
      insert into momentum_os.generated_days(user_id,day)
      values ('6d8e45af-5bb3-4e40-adb3-e605b9972c79','2026-11-02'),('6d8e45af-5bb3-4e40-adb3-e605b9972c79','2026-11-03');
      insert into momentum_os.tasks(id,user_id,title,category,priority,status,due_date,created_at,updated_at)
      values ('t1','6d8e45af-5bb3-4e40-adb3-e605b9972c79','Review the 5 AM batch: 10 job listings and 10 trigger-based outreach targets','Client Pipeline','high','todo','2026-11-02','2026-11-02','2026-11-02');
    `);
    await pg.exec(strip("supabase/migrations/20261102000700_personal_owner_reconcile.sql"));
    const first = await pg.query<{ m: number; w: number; t: number; obsolete: number }>(`
      select
        (select count(*)::int from momentum_os.monthly_goals where status='active') as m,
        (select count(*)::int from momentum_os.weekly_goals where status='active') as w,
        (select count(*)::int from momentum_os.tasks) as t,
        (select count(*)::int from momentum_os.tasks where status='todo' and title like '%5 AM batch%') as obsolete;
    `);
    expect(first.rows[0]).toMatchObject({ m: 5, w: 11, t: 30, obsolete: 0 });
    // Re-running is idempotent: no duplicate goals or tasks.
    await pg.exec(strip("supabase/migrations/20261102000700_personal_owner_reconcile.sql"));
    const second = await pg.query<{ m: number; w: number; t: number }>(`
      select
        (select count(*)::int from momentum_os.monthly_goals where status='active') as m,
        (select count(*)::int from momentum_os.weekly_goals where status='active') as w,
        (select count(*)::int from momentum_os.tasks) as t;
    `);
    expect(second.rows[0]).toMatchObject({ m: 5, w: 11, t: 30 });
    await pg.close();
  }, 30000);
});
