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

import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
  {
    title:
      "Publish today's Graphic Design with AI course promotion on WhatsApp Status",
    category: "Course Growth",
    priority: "high",
    estimated_minutes: 20,
  },
  {
    title: "Respond to course enquiries and follow up warm leads",
    category: "Course Growth",
    priority: "high",
    estimated_minutes: 30,
  },
  {
    title: "Complete and log 20 targeted client outreach actions",
    category: "Client Pipeline",
    priority: "high",
    estimated_minutes: 75,
  },
  {
    title:
      "Review the 5 AM batch: 10 job listings and 10 trigger-based outreach targets",
    category: "Client Pipeline",
    priority: "high",
    estimated_minutes: 25,
    scheduled_time: "05:00",
  },
  {
    title:
      "Review the 6 AM LinkedIn batch: 10 roles and 10 founders or product owners",
    category: "Client Pipeline",
    priority: "high",
    estimated_minutes: 25,
    scheduled_time: "06:00",
  },
  {
    title:
      "Review the 8 AM batch: 10 fresh job listings and 10 trigger-based outreach targets",
    category: "Client Pipeline",
    priority: "high",
    estimated_minutes: 25,
    scheduled_time: "08:00",
  },
  {
    title: "Capture one useful idea or lesson for your personal brand",
    category: "Personal Brand",
    priority: "medium",
    estimated_minutes: 15,
  },
  {
    title: "Record today's wins, blockers and tomorrow's first action",
    category: "Personal",
    priority: "low",
    estimated_minutes: 10,
  },
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

// ------------------------------------------------------------ SQLite backend
function createSqliteBackend(): Db {
  const here = dirname(fileURLToPath(import.meta.url));
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
  sqlite.exec(readFileSync(resolve(here, "schema.sql"), "utf8"));

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
        1,
        JSON.stringify(defaultTemplates),
        stamp,
        stamp,
      );
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
          "Sell 68 seats of Graphic Design with AI",
          "Host a Next Chapter conversation every Friday",
          "Complete two substantial creative projects each week",
          "Publish course-related content on Tuesday, Wednesday, and Friday",
          "Produce two substantial Next Chapter content pieces weekly",
          "Complete 20 client outreach actions daily",
          "Develop a consistent personal brand across platforms",
          "Use weekends for content development and weekly preparation",
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
  if (
    await db
      .prepare("SELECT day FROM generated_days WHERE user_id=? AND day=?")
      .get(userId, day)
  )
    return;

  const weekdayNumber = weekday(day);
  const planned = [...templates.slice(0, 20)];
  const add = (
    title: string,
    category: string,
    priority = "high",
    minutes = 60,
  ) => planned.push({ title, category, priority, estimated_minutes: minutes });
  if (weekdayNumber >= 1 && weekdayNumber <= 3)
    add(
      "Creative Project 1 \u2014 complete today's planned milestone",
      "Creative Studio",
      "high",
      120,
    );
  if (weekdayNumber === 4 || weekdayNumber === 5)
    add(
      "Creative Project 2 \u2014 complete today's planned milestone",
      "Creative Studio",
      "high",
      120,
    );
  if ([2, 3, 5].includes(weekdayNumber))
    add(
      "Publish and distribute this week's course-growth content",
      "Course Growth",
      "high",
      45,
    );
  if (weekdayNumber === 2 || weekdayNumber === 4)
    add(
      "Develop one substantial Next Chapter content piece",
      "Next Chapter",
      "medium",
      60,
    );
  if (weekdayNumber === 5) {
    add(
      "Prepare and deliver the weekly Next Chapter live session",
      "Next Chapter",
      "high",
      90,
    );
    add(
      "Review next week's guest and session readiness",
      "Next Chapter",
      "high",
      20,
    );
  }
  if (weekdayNumber === 6)
    add(
      "Batch creative assets and prepare next week's content drafts",
      "Personal Brand",
      "high",
      90,
    );
  if (weekdayNumber === 0) {
    add(
      "Batch content and prepare the coming week's publishing schedule",
      "Personal Brand",
      "high",
      90,
    );
    add(
      "Plan two creative projects and confirm weekly milestones",
      "Creative Studio",
      "high",
      30,
    );
    add(
      "Create next Friday's Next Chapter session plan and begin guest outreach",
      "Next Chapter",
      "high",
      30,
    );
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
