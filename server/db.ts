// Momentum OS data layer.
//
// Two backends behind ONE async API:
//   * no DATABASE_URL  -> local node:sqlite (preview / local dev / tests)
//   * DATABASE_URL set -> the existing Supabase Momentum project, schema
//                         `momentum_os`, via the pg pool in server/postgres.ts
//
// Every call site awaits db.prepare(...).get/all/run and db.exec(...). SQLite
// resolves synchronously; PostgreSQL resolves through the pool. A per-request
// AsyncLocalStorage context keeps BEGIN/COMMIT/ROLLBACK on one pooled client,
// so the original transaction boundaries remain atomic on both backends.

import { createRequire } from "node:module";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  getPool,
  isPostgresConfigured,
  toPostgres,
  normaliseError,
  dbContext,
  currentRunner,
  closePool,
  type DbTxState,
} from "./postgres";

export const isPostgresBackend = isPostgresConfigured();

type Params = any[];
export type Statement = {
  get: (...params: Params) => Promise<any>;
  all: (...params: Params) => Promise<any[]>;
  run: (...params: Params) => Promise<{ changes: number }>;
};
export type Db = {
  prepare: (sql: string) => Statement;
  exec: (sql: string) => Promise<void>;
  close: () => Promise<void>;
};

export const id = () => randomUUID();
export const now = () => new Date().toISOString();

export function dateInZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (name: string) =>
    parts.find((part) => part.type === name)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const defaultTemplates = [
  { title: "Publish one useful piece of content today on Instagram and/or WhatsApp", category: "Personal Brand", priority: "high", estimated_minutes: 45 },
  { title: "Promote Graphic Design with AI; respond to enquiries and follow up warm leads", category: "Course Growth", priority: "high", estimated_minutes: 40 },
  { title: "Research 10 new/emerging businesses and 10 established businesses", category: "Client Pipeline", priority: "high", estimated_minutes: 45 },
  { title: "Send 20 relevant client outreach messages/proposals and log each interaction", category: "Client Pipeline", priority: "high", estimated_minutes: 60 },
  { title: "Research and contact 3 promotional partners for Graphic Design with AI", category: "Course Growth", priority: "high", estimated_minutes: 30 },
  { title: "Capture one useful AI, design or creative-industry development", category: "Personal Brand", priority: "medium", estimated_minutes: 20 },
  { title: "Record today's wins, blockers and tomorrow's first action", category: "Personal", priority: "low", estimated_minutes: 10 },
];

// Migrate only the untouched starter routine; preserve personalised routines.
const legacyTemplates = [
  {
    title: "Follow up on course enquiries",
    category: "Course Growth",
    priority: "high",
    estimated_minutes: 20,
  },
  {
    title: "Reach out to potential clients",
    category: "Client Pipeline",
    priority: "high",
    estimated_minutes: 60,
  },
  {
    title: "Make progress on a creative project",
    category: "Creative Studio",
    priority: "high",
    estimated_minutes: 60,
  },
  {
    title: "Share useful work on WhatsApp",
    category: "Course Growth",
    priority: "medium",
    estimated_minutes: 15,
  },
  {
    title: "Capture a content idea",
    category: "Personal Brand",
    priority: "medium",
    estimated_minutes: 10,
  },
  {
    title: "Plan tomorrow\u2019s top three outcomes",
    category: "Personal",
    priority: "low",
    estimated_minutes: 10,
  },
];

// Load node:sqlite lazily. The deployed Netlify Function only ever uses the
// PostgreSQL backend; requiring the built-in conditionally means an older Node
// 22 runtime without node:sqlite cannot break the function at import time.
const nodeRequire = createRequire(`${process.cwd()}/momentum-db.cjs`);

// ------------------------------------------------------------ SQLite backend
function createSqliteBackend(): Db {
  const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
  const schemaPath = resolve(process.cwd(), "server", "schema.sql");
  const dataDir = resolve(
    process.env.DATA_DIR ||
      (process.env.MOMENTUM_PREVIEW === "1"
        ? "./data/preview"
        : "./data/workspace"),
  );
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const databasePath = resolve(dataDir, "momentum.sqlite");
  const sqlite = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  sqlite.exec(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
  );
  sqlite.exec(readFileSync(schemaPath, "utf8"));

  // Additive migrations for workspaces created by an earlier version.
  const columns = (table: string) =>
    sqlite
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => String((column as { name: unknown }).name));
  const userColumns = columns("users");
  if (!userColumns.includes("account_type"))
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'owner'",
    );
  sqlite
    .prepare(
      `UPDATE users SET account_type='team'
  WHERE account_type!='team' AND EXISTS (
    SELECT 1 FROM team_members m JOIN team_workspaces w ON w.id=m.workspace_id
    WHERE m.user_id=users.id AND w.owner_user_id!=users.id
  )`,
    )
    .run();
  const teamTaskColumns = columns("team_tasks");
  if (!teamTaskColumns.includes("submission"))
    sqlite.exec(
      "ALTER TABLE team_tasks ADD COLUMN submission TEXT NOT NULL DEFAULT ''",
    );
  const settingsColumns = columns("settings");
  if (!settingsColumns.includes("platforms"))
    sqlite.exec(
      "ALTER TABLE settings ADD COLUMN platforms TEXT NOT NULL DEFAULT 'Instagram,LinkedIn,YouTube,WhatsApp'",
    );
  if (!settingsColumns.includes("notifications_enabled"))
    sqlite.exec(
      "ALTER TABLE settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1",
    );
  if (!settingsColumns.includes("onboarding_completed"))
    sqlite.exec(
      "ALTER TABLE settings ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0",
    );
  if (!settingsColumns.includes("onboarding_profile"))
    sqlite.exec(
      "ALTER TABLE settings ADD COLUMN onboarding_profile TEXT NOT NULL DEFAULT '{}'",
    );
  const themeColumn = sqlite
    .prepare("PRAGMA table_info(settings)")
    .all()
    .find((column) => (column as { name: unknown }).name === "theme") as
    | { dflt_value?: string }
    | undefined;
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const migration = "white-first-appearance-v1";
    if (
      !sqlite
        .prepare("SELECT name FROM app_migrations WHERE name=?")
        .get(migration)
    ) {
      sqlite.prepare("UPDATE settings SET theme='light' WHERE theme='system'").run();
      if (themeColumn?.dflt_value === "'dark'")
        sqlite
          .prepare(
            "UPDATE settings SET theme='light' WHERE theme='dark' AND updated_at=created_at",
          )
          .run();
      sqlite
        .prepare("INSERT INTO app_migrations(name,applied_at) VALUES (?,?)")
        .run(migration, new Date().toISOString());
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  sqlite
    .prepare(
      "UPDATE settings SET daily_templates=?,updated_at=? WHERE daily_templates=?",
    )
    .run(
      JSON.stringify(defaultTemplates),
      now(),
      JSON.stringify(legacyTemplates),
    );

  // Additive goal-hierarchy migration. schema.sql creates the new tables for
  // both fresh and existing databases; this adds the optional daily-deliverable
  // link to pre-existing tasks tables without rebuilding or deleting rows.
  const taskColumns = columns("tasks");
  if (!taskColumns.includes("weekly_goal_id"))
    sqlite.exec(
      "ALTER TABLE tasks ADD COLUMN weekly_goal_id TEXT REFERENCES weekly_goals(id) ON DELETE SET NULL",
    );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_tasks_weekly_goal ON tasks(weekly_goal_id,status)",
  );

  return {
    prepare: (sql) => {
      const statement = sqlite.prepare(sql);
      return {
        get: async (...params) => statement.get(...params),
        all: async (...params) => statement.all(...params),
        run: async (...params) => ({
          changes: Number(statement.run(...params).changes),
        }),
      };
    },
    exec: async (sql) => {
      sqlite.exec(sql);
    },
    close: async () => {
      sqlite.close();
    },
  };
}

// -------------------------------------------------------- PostgreSQL backend
function createPostgresBackend(): Db {
  const query = async (translated: string, params: Params) => {
    if (!translated) return { rows: [] as any[], changes: 0 };
    try {
      const result = await currentRunner().query(translated, params);
      return { rows: (result.rows || []) as any[], changes: result.rowCount ?? 0 };
    } catch (error) {
      throw normaliseError(error);
    }
  };
  const run = (sql: string, params: Params) => query(toPostgres(sql), params);
  return {
    prepare: (sql) => ({
      get: async (...params) => (await run(sql, params)).rows[0],
      all: async (...params) => (await run(sql, params)).rows,
      run: async (...params) => ({ changes: (await run(sql, params)).changes }),
    }),
    exec: async (sql) => {
      const translated = toPostgres(sql);
      if (!translated) return; // PRAGMA has no PostgreSQL equivalent
      const state = dbContext.getStore();
      if (/^BEGIN\b/i.test(translated)) {
        if (!state)
          throw new Error(
            "A database transaction requires a request context. Add withDbContext middleware.",
          );
        const client = await getPool().connect();
        try {
          await client.query("BEGIN");
        } catch (error) {
          client.release();
          throw error;
        }
        state.client = client;
        return;
      }
      if (/^(COMMIT|ROLLBACK)\b/i.test(translated)) {
        const client = state?.client;
        if (!client) return;
        try {
          await client.query(translated);
        } finally {
          client.release();
          if (state) state.client = null;
        }
        return;
      }
      await query(translated, []);
    },
    close: async () => {
      await closePool();
    },
  };
}

export const db: Db = isPostgresBackend
  ? createPostgresBackend()
  : createSqliteBackend();

/** Express middleware: give every request its own transaction state. */
export function withDbContext(
  _req: unknown,
  res: { once?: (event: string, listener: () => void) => void },
  next: () => void,
) {
  const state: DbTxState = { client: null };
  dbContext.run(state, () => {
    // Never leak a pooled client if a handler returns with a transaction open.
    res?.once?.("finish", () => {
      const client = state.client;
      if (client) {
        state.client = null;
        void client
          .query("ROLLBACK")
          .catch(() => undefined)
          .finally(() => client.release());
      }
    });
    next();
  });
}

// ------------------------------------------------------------------- helpers
function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function weekday(day: string): number {
  return new Date(`${day}T12:00:00.000Z`).getUTCDay();
}

export async function createWorkspace(
  userId: string,
  email: string,
  passwordHash: string,
  name: string,
  seedInitialOwnerPlan = true,
): Promise<void> {
  const stamp = now();
  await db.exec("BEGIN IMMEDIATE");
  try {
    await db
      .prepare(
        "INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)",
      )
      .run(userId, email.toLowerCase(), passwordHash, stamp);
    await db
      .prepare(
        `INSERT INTO settings (id,user_id,name,timezone,work_start,work_end,theme,auto_plan,daily_templates,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id(),
        userId,
        name || "Chisom Ogbonna",
        "Africa/Lagos",
        "08:00",
        "17:00",
        "light",
        seedInitialOwnerPlan ? 1 : 0,
        JSON.stringify(seedInitialOwnerPlan ? defaultTemplates : []),
        stamp,
        stamp,
      );
    if (seedInitialOwnerPlan) {
      await db
        .prepare(
          `INSERT INTO products (id,user_id,name,price,description,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(
          id(),
          userId,
          "Graphic Design with AI",
          14900,
          "Digital course",
          1,
          stamp,
          stamp,
        );
      await db
        .prepare(
          `INSERT INTO cycles (id,user_id,month,theme,objective,objectives,sales_target,revenue_target,outreach_target,projects_target,chapter_content_target,course_days,session_day,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id(),
          userId,
          "2026-11",
          "Build with intention",
          "Sell 68 seats of Graphic Design with AI while building a consistent creative and client pipeline.",
          [
            "Sell 68 seats of Graphic Design with AI at the ₦14,900 launch price.",
            "Host Next Chapter live every Friday.",
            "Complete two substantial Creative Studio projects each week.",
            "Publish on all seven days; Tuesday, Wednesday and Friday include course-growth content.",
            "Produce two substantial Next Chapter content pieces weekly.",
            "Research 10 new/emerging and 10 established businesses daily; record research separately from actual outreach and send 20 relevant approaches.",
            "Research and contact three promotional partners daily for Graphic Design with AI (not Next Chapter).",
            "Develop the monthly content bank and publish a YouTube/free tutorial by Thursday.",
            "Advance two brand-identity projects; first project's content is ready Wednesday.",
            "Use weekends for content batching and weekly preparation.",
          ].join("\n"),
          68,
          1013200,
          20,
          2,
          2,
          "2,3,5",
          5,
          "active",
          stamp,
          stamp,
        );
  
    }
    // No owner-specific plan is seeded here. Every new account (including a
    // production signup) starts clean. The verified owner's November plan is
    // applied once, idempotently, by scripts/backfill-goals.ts, which is scoped
    // to that owner's identity only -- see docs/GOAL-HIERARCHY.md.
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

/** Generate editable daily plans in the owner's timezone; never fake completed activity. */
export async function ensureDailyPlan(
  userId: string,
  referenceDate = new Date(),
): Promise<void> {
  const profile = (await db
    .prepare(
      "SELECT timezone,auto_plan,daily_templates FROM settings WHERE user_id=?",
    )
    .get(userId)) as
    | { timezone: string; auto_plan: number; daily_templates: string }
    | undefined;
  if (!profile) return;
  const day = dateInZone(profile.timezone || "Africa/Lagos", referenceDate);
  const cycle = (await db
    .prepare("SELECT id FROM cycles WHERE user_id=? AND month=?")
    .get(userId, day.slice(0, 7))) as { id: string } | undefined;

  // Seven-day-ahead guest confirmation is independent of today's plan generation.
  const sessionDay = addDays(day, 7);
  const sessions = (await db
    .prepare(
      "SELECT id,title,guest FROM chapter_sessions WHERE user_id=? AND session_date=? AND status NOT IN ('Archived','Completed')",
    )
    .all(userId, sessionDay)) as Array<{
    id: string;
    title: string;
    guest: string;
  }>;
  for (const session of sessions) {
    const title = session.guest
      ? `Confirm next week's Next Chapter guest: ${session.guest}`
      : `Invite and confirm a guest for Next Chapter: ${session.title}`;
    if (
      !(await db
        .prepare(
          "SELECT 1 FROM tasks WHERE user_id=? AND session_id=? AND title=?",
        )
        .get(userId, session.id, title))
    ) {
      const stamp = now();
      await db
        .prepare(
          `INSERT INTO tasks(id,user_id,cycle_id,session_id,title,description,category,priority,status,due_date,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'Next Chapter','high','todo',?,30,20,?,?)`,
        )
        .run(
          id(),
          userId,
          cycle?.id || null,
          session.id,
          title,
          "Confirm the Next Chapter guest seven days before the live session and update the session record.",
          day,
          stamp,
          stamp,
        );
    }
  }

  if (!profile.auto_plan) return;
  let templates: Array<{
    title?: string;
    category?: string;
    priority?: string;
    estimated_minutes?: number;
    scheduled_time?: string;
  }>;
  try {
    templates = JSON.parse(profile.daily_templates);
  } catch {
    return;
  }
  if (!Array.isArray(templates)) return;

  // Reconcile the exact retired starter routine in existing workspaces while
  // leaving unrelated, user-authored recurring tasks untouched.
  const retired = new Set([
    "Review the 5 AM batch: 10 job listings and 10 trigger-based outreach targets",
    "Review the 6 AM LinkedIn batch: 10 roles and 10 founders or product owners",
    "Review the 8 AM batch: 10 fresh job listings and 10 trigger-based outreach targets",
  ]);
  const legacyOutreach = "Complete and log 20 targeted client outreach actions";
  let routineChanged = false;
  const reconciled = templates.filter((item) => {
    if (retired.has(String(item.title || ""))) {
      routineChanged = true;
      return false;
    }
    return true;
  });
  const legacyIndex = reconciled.findIndex((item) => item.title === legacyOutreach);
  if (legacyIndex >= 0) {
    reconciled.splice(legacyIndex, 1,
      { title: "Research 10 new/emerging businesses and 10 established businesses", category: "Client Pipeline", priority: "high", estimated_minutes: 45 },
      { title: "Send 20 relevant client outreach messages/proposals and log each interaction", category: "Client Pipeline", priority: "high", estimated_minutes: 60 },
    );
    routineChanged = true;
  }
  const ensureRoutineTask = (title: string, category: string, minutes: number) => {
    if (!reconciled.some((item) => item.title === title)) {
      reconciled.push({ title, category, priority: "high", estimated_minutes: minutes });
      routineChanged = true;
    }
  };
  ensureRoutineTask("Publish one useful piece of content today on Instagram and/or WhatsApp", "Personal Brand", 45);
  ensureRoutineTask("Research and contact 3 promotional partners for Graphic Design with AI", "Course Growth", 30);
  if (routineChanged) {
    await db.prepare("UPDATE settings SET daily_templates=?,updated_at=? WHERE user_id=?")
      .run(JSON.stringify(reconciled), now(), userId);
    templates = reconciled;
  }
  if (
    await db
      .prepare("SELECT day FROM generated_days WHERE user_id=? AND day=?")
      .get(userId, day)
  )
    return;

  const weekdayNumber = weekday(day);
  const planned = [...templates.slice(0, 20)];
  const add = (title: string, category: string, priority = "high", minutes = 60) =>
    planned.push({ title, category, priority, estimated_minutes: minutes });

  // Daily operating rhythm plus a concrete seven-day execution plan.
  if (weekdayNumber === 1) {
    add("Choose both Creative Studio projects and define this week's deliverables", "Creative Studio", "high", 30);
    add("Start Creative Project 1: build the social-media campaign (Monday–Wednesday)", "Creative Studio", "high", 120);
    add("Write the monthly content bank plan and this week's publishing schedule", "Personal Brand", "high", 60);
    add("Write the Next Chapter announcement and session script", "Next Chapter", "high", 40);
    add("Hold the team strategy meeting and assign owners and deadlines", "Team Workspace", "high", 45);
    add("Brief designers on the Next Chapter main flyer, speaker-bio flyer and separate advertising flyer", "Next Chapter", "high", 30);
    add("Begin recruiting a Social Media Manager (separate from the existing Community Manager)", "Personal Brand", "high", 30);
    add("Select and publish Monday's planned post", "Personal Brand", "high", 45);
    add("Start Brand Identity Project 1; prepare its first content milestone for Wednesday", "Personal Brand", "high", 90);
  }
  if (weekdayNumber === 2) {
    add("Publish Carousel 1 and distribute it", "Personal Brand", "high", 45);
    add("Continue Creative Project 1 campaign build", "Creative Studio", "high", 120);
    add("Develop one substantial Next Chapter content piece", "Next Chapter", "medium", 60);
  }
  if (weekdayNumber === 3) {
    add("Publish Brand Identity Project 1 reveal/content (first project ready today)", "Personal Brand", "high", 60);
    add("Publish the Creative Project 1 campaign output as a second post", "Creative Studio", "high", 45);
    add("Complete Creative Project 1 campaign deliverables", "Creative Studio", "high", 90);
    add("Develop one substantial Next Chapter content piece", "Next Chapter", "medium", 60);
  }
  if (weekdayNumber === 4) {
    add("Publish Carousel 2", "Personal Brand", "high", 45);
    add("Publish the YouTube free tutorial and share it with the community", "Personal Brand", "high", 90);
    add("Start Creative Project 2: the simpler flyer project", "Creative Studio", "high", 120);
  }
  if (weekdayNumber === 5) {
    add("Publish and promote Friday's Next Chapter content", "Next Chapter", "high", 45);
    add("Prepare and deliver the weekly Next Chapter live session", "Next Chapter", "high", 90);
    add("Review next week's guest and session readiness", "Next Chapter", "high", 20);
    add("Continue and finish Creative Project 2 flyer", "Creative Studio", "high", 90);
  }
  if (weekdayNumber === 6) {
    add("Publish the second installment of Brand Identity Project 2", "Personal Brand", "high", 60);
    add("Batch creative assets and prepare next week's content drafts", "Personal Brand", "high", 90);
  }
  if (weekdayNumber === 0) {
    add("Publish Creative Project 2 output", "Creative Studio", "high", 45);
    add("Batch content and prepare the coming week's publishing schedule", "Personal Brand", "high", 90);
    add("Review both weekly Creative Studio projects and set next milestones", "Creative Studio", "high", 30);
    add("Create next Friday's Next Chapter session plan and begin guest outreach", "Next Chapter", "high", 30);
  }

  // Carry-forward is an explicit user action in My Day or cycle rollover.
  // Automatic planning must not change or duplicate unfinished tasks.
  const stamp = now();
  await db.exec("BEGIN IMMEDIATE");
  try {
    const result = await db
      .prepare("INSERT OR IGNORE INTO generated_days(user_id,day) VALUES (?,?)")
      .run(userId, day);
    if (Number(result.changes)) {
      const insert = db.prepare(
        `INSERT INTO tasks(id,user_id,cycle_id,title,category,priority,status,due_date,scheduled_time,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'todo',?,?,?,?,?,?)`,
      );
      for (const [index, template] of planned.slice(0, 30).entries()) {
        if (typeof template.title !== "string" || !template.title.trim())
          continue;
        const priority = ["high", "medium", "low"].includes(
          template.priority || "",
        )
          ? template.priority!
          : "medium";
        await insert.run(
          id(),
          userId,
          cycle?.id || null,
          template.title.trim().slice(0, 200),
          String(template.category || "Personal").slice(0, 80),
          priority,
          day,
          String(template.scheduled_time || ""),
          Math.max(0, Math.min(1440, Number(template.estimated_minutes) || 0)),
          index,
          stamp,
          stamp,
        );
      }
    }
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

/** Existing private workspaces get a shared team space without changing their data. */
export async function ensureTeamOwnerWorkspace(userId: string): Promise<string> {
  const stamp = now();
  await db
    .prepare(
      "INSERT OR IGNORE INTO team_workspaces(id,owner_user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)",
    )
    .run(id(), userId, "Team Workspace", stamp, stamp);
  const workspace = (await db
    .prepare("SELECT id FROM team_workspaces WHERE owner_user_id=?")
    .get(userId)) as { id: string };
  await db
    .prepare(
      "INSERT OR IGNORE INTO team_members(id,workspace_id,user_id,role,status,joined_at) VALUES (?,?,?,'owner','active',?)",
    )
    .run(id(), workspace.id, userId, stamp);
  return workspace.id;
}
