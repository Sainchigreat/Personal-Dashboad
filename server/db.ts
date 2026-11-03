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
  PERSONAL_OWNER_ENV,
  PERSONAL_ROUTINE,
  PERSONAL_WEEKDAY_PLAN,
  PERSONAL_MONTHLY_GOALS,
  PERSONAL_WEEKLY_GOALS,
  OBSOLETE_TITLES,
  type PlanTask,
} from "./personalPlan";
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

// New accounts start CLEAN. Chisom's personal November routine lives in
// server/personalPlan.ts and is applied only to the verified personal owner.
// No other account inherits his goals, targets, tasks or publishing calendar.
const defaultTemplates: PlanTask[] = [];

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
  const speakerColumns = columns("speakers");
  if (!speakerColumns.includes("reminder_status"))
    sqlite.exec(
      "ALTER TABLE speakers ADD COLUMN reminder_status TEXT NOT NULL DEFAULT 'not_sent'",
    );
  if (!speakerColumns.includes("asset_approval_status"))
    sqlite.exec(
      "ALTER TABLE speakers ADD COLUMN asset_approval_status TEXT NOT NULL DEFAULT 'pending'",
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

/**
 * Create an INDEPENDENT, CLEAN personal workspace.
 *
 * No course, no 68-seat target, no November goals, no personal routine, no
 * Next Chapter calendar is copied here. Chisom's personal plan is applied
 * separately, idempotently and only to the verified personal owner by
 * ensurePersonalPlan() / scripts/reconcile-personal-plan.ts.
 *
 * A neutral current-month cycle is created because the UI requires one; all
 * targets are zero until the account owner sets their own goals.
 */
export async function createWorkspace(
  userId: string,
  email: string,
  passwordHash: string,
  name: string,
): Promise<void> {
  const stamp = now();
  const month = dateInZone("Africa/Lagos").slice(0, 7);
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
        name || "My Workspace",
        "Africa/Lagos",
        "08:00",
        "17:00",
        "light",
        0,
        JSON.stringify(defaultTemplates),
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
        month,
        "My month",
        "Set your own goals for this month.",
        "",
        0,
        0,
        0,
        0,
        0,
        "",
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

/** The verified personal owner, resolved by server env or a DB marker row. */
export async function isPersonalOwner(userId: string): Promise<boolean> {
  const configured = process.env[PERSONAL_OWNER_ENV]?.trim().toLowerCase();
  if (configured) {
    const byEmail = await db
      .prepare("SELECT 1 FROM users WHERE id=? AND lower(email)=?")
      .get(userId, configured);
    if (byEmail) return true;
  }
  const marker = await db
    .prepare("SELECT 1 FROM personal_plan_owner WHERE user_id=?")
    .get(userId);
  return Boolean(marker);
}

/** Mark one verified account as the personal-workspace owner (idempotent). */
export async function markPersonalOwner(userId: string): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO personal_plan_owner(user_id,marked_at) VALUES (?,?)",
    )
    .run(userId, now());
}

/**
 * Idempotently apply Chisom's five monthly goals, November 2-8 weekly goals
 * and the corrected recurring routine to ONE verified owner. Never deletes or
 * overwrites another account's rows. Call from a scoped reconcile script.
 */
export async function ensurePersonalPlan(userId: string): Promise<void> {
  const stamp = now();
  const weekStart = "2026-11-02";
  const weekEnd = "2026-11-08";
  const monthStart = "2026-11-01";
  const monthEnd = "2026-11-30";

  await markPersonalOwner(userId);
  await db
    .prepare("UPDATE settings SET daily_templates=?,auto_plan=1,updated_at=? WHERE user_id=?")
    .run(JSON.stringify(PERSONAL_ROUTINE), stamp, userId);
  await db
    .prepare(
      "UPDATE cycles SET sales_target=68,revenue_target=1000000,outreach_target=20,status='active' WHERE user_id=? AND month='2026-11'",
    )
    .run(userId);

  const monthlyIds = new Map<string, string>();
  for (const goal of PERSONAL_MONTHLY_GOALS) {
    const existing = (await db
      .prepare("SELECT id FROM monthly_goals WHERE user_id=? AND title=?")
      .get(userId, goal.title)) as { id: string } | undefined;
    if (existing) {
      monthlyIds.set(goal.key, existing.id);
      continue;
    }
    const goalId = id();
    monthlyIds.set(goal.key, goalId);
    await db
      .prepare(
        `INSERT INTO monthly_goals
         (id,user_id,workspace_id,title,description,category,metric_type,source,target,unit,baseline,status,start_date,end_date,notes,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        goalId,
        userId,
        "personal",
        goal.title,
        goal.description,
        "November operating plan",
        goal.metric_type,
        goal.source,
        goal.target,
        goal.unit,
        0,
        "active",
        monthStart,
        monthEnd,
        goal.notes,
        stamp,
        stamp,
      );
  }

  const weeklyIds = new Map<string, string>();
  for (const goal of PERSONAL_WEEKLY_GOALS) {
    const existing = (await db
      .prepare(
        "SELECT id FROM weekly_goals WHERE user_id=? AND week_start=? AND outcome=?",
      )
      .get(userId, weekStart, goal.outcome)) as { id: string } | undefined;
    if (existing) {
      weeklyIds.set(goal.key, existing.id);
      continue;
    }
    const goalId = id();
    weeklyIds.set(goal.key, goalId);
    await db
      .prepare(
        `INSERT INTO weekly_goals
         (id,user_id,workspace_id,monthly_goal_id,cycle_id,week_start,week_end,outcome,target,unit,current,source,owner_id,assignee_id,priority,status,visibility,notes,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        goalId,
        userId,
        "personal",
        monthlyIds.get(goal.monthlyKey) || null,
        null,
        weekStart,
        weekEnd,
        goal.outcome,
        goal.target,
        goal.unit,
        0,
        goal.source,
        userId,
        null,
        "high",
        "active",
        "private",
        goal.notes,
        stamp,
        stamp,
      );
  }
}

/** Build one day's plan for the verified personal owner. */
async function personalDayPlan(
  userId: string,
  day: string,
): Promise<{
  planned: PlanTask[];
  goalIds: Map<string, string>;
  cycleId: string | null;
}> {
  const weekdayNumber = weekday(day);
  const cycle = (await db
    .prepare("SELECT id FROM cycles WHERE user_id=? AND month=?")
    .get(userId, day.slice(0, 7))) as { id: string } | undefined;
  const weekStart = addDays(day, -(weekdayNumber === 0 ? 6 : weekdayNumber - 1));
  const goalIds = new Map<string, string>();
  for (const goal of PERSONAL_WEEKLY_GOALS) {
    const row = (await db
      .prepare(
        "SELECT id FROM weekly_goals WHERE user_id=? AND week_start=? AND outcome=?",
      )
      .get(userId, weekStart, goal.outcome)) as { id: string } | undefined;
    if (row) goalIds.set(goal.key, row.id);
  }
  const planned = [
    ...(PERSONAL_WEEKDAY_PLAN[weekdayNumber] || []),
    ...PERSONAL_ROUTINE,
  ].slice(0, 30);
  return { planned, goalIds, cycleId: cycle?.id || null };
}

/**
 * Insert a day's tasks. When onlyMissing is true (reconciliation) nothing is
 * duplicated and user deletions are respected on subsequent normal runs.
 */
async function insertDayTasks(
  userId: string,
  day: string,
  info: Awaited<ReturnType<typeof personalDayPlan>>,
  onlyMissing: boolean,
): Promise<number> {
  const stamp = now();
  const insert = db.prepare(
    `INSERT INTO tasks(id,user_id,cycle_id,weekly_goal_id,title,category,priority,status,due_date,scheduled_time,estimated_minutes,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'todo',?,?,?,?,?,?)`,
  );
  let inserted = 0;
  for (const [index, template] of info.planned.entries()) {
    if (typeof template.title !== "string" || !template.title.trim()) continue;
    if (onlyMissing) {
      const existing = await db
        .prepare(
          "SELECT 1 FROM tasks WHERE user_id=? AND due_date=? AND title=?",
        )
        .get(userId, day, template.title);
      if (existing) continue;
    }
    const priority = ["high", "medium", "low"].includes(template.priority || "")
      ? template.priority!
      : "medium";
    await insert.run(
      id(),
      userId,
      info.cycleId,
      info.goalIds.get(template.goalKey || "") || null,
      template.title.trim().slice(0, 200),
      String(template.category || "Personal").slice(0, 80),
      priority,
      day,
      String((template as { scheduled_time?: string }).scheduled_time || ""),
      Math.max(0, Math.min(1440, Number(template.estimated_minutes) || 0)),
      index,
      stamp,
      stamp,
    );
    inserted += 1;
  }
  return inserted;
}

/**
 * Generate editable daily plans in the owner's timezone; never fake completed
 * activity. Chisom's personal November routine and weekday schedule are applied
 * ONLY to the verified personal owner. All other accounts generate from their
 * own templates and never inherit another workspace's work.
 */
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

  // Seven-day-ahead guest confirmation is independent of the recurring plan.
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
      const sessionStamp = now();
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
          sessionStamp,
          sessionStamp,
        );
    }
  }

  if (!profile.auto_plan) return;
  const personal = await isPersonalOwner(userId);
  let templates: PlanTask[] = [];
  try {
    templates = JSON.parse(profile.daily_templates);
  } catch {
    return;
  }
  if (!Array.isArray(templates)) return;

  // Reconcile obsolete work without deleting user-authored recurring tasks.
  // No job-search batches, no manual "research 20 businesses", no generic
  // publishing item. Chisom's routine is re-applied only to his own account.
  const obsolete = new Set(OBSOLETE_TITLES);
  let cleaned = templates.filter(
    (item) => !obsolete.has(String(item.title || "")),
  );
  if (personal) {
    const combined = [...cleaned];
    for (const routine of PERSONAL_ROUTINE) {
      if (!combined.some((item) => item.title === routine.title))
        combined.push({ ...routine });
    }
    cleaned = combined;
  }
  if (JSON.stringify(cleaned) !== JSON.stringify(templates)) {
    await db
      .prepare("UPDATE settings SET daily_templates=?,updated_at=? WHERE user_id=?")
      .run(JSON.stringify(cleaned), now(), userId);
  }

  if (
    await db
      .prepare("SELECT day FROM generated_days WHERE user_id=? AND day=?")
      .get(userId, day)
  )
    return;

  const info = personal
    ? await personalDayPlan(userId, day)
    : {
        planned: cleaned.slice(0, 30),
        goalIds: new Map<string, string>(),
        cycleId: cycle?.id || null,
      };

  await db.exec("BEGIN IMMEDIATE");
  try {
    const result = await db
      .prepare("INSERT OR IGNORE INTO generated_days(user_id,day) VALUES (?,?)")
      .run(userId, day);
    if (Number(result.changes))
      await insertDayTasks(userId, day, info, false);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * One-time, idempotent owner-only reconciliation for existing workspaces.
 * Cancels obsolete TODO work (never deletes a row, never touches completed
 * history) and fills in the correct plan for days already generated.
 */
export async function reconcilePersonalWorkspace(
  userId: string,
): Promise<{ cancelled: number; added: number; days: string[] }> {
  await markPersonalOwner(userId);
  await ensurePersonalPlan(userId);
  await db
    .prepare("UPDATE settings SET daily_templates=?,auto_plan=1,updated_at=? WHERE user_id=?")
    .run(JSON.stringify(PERSONAL_ROUTINE), now(), userId);

  const obsolete = OBSOLETE_TITLES;
  let cancelled = 0;
  for (const title of obsolete) {
    const result = await db
      .prepare(
        "UPDATE tasks SET status='cancelled',updated_at=? WHERE user_id=? AND title=? AND status='todo'",
      )
      .run(now(), userId, title);
    cancelled += Number(result.changes);
  }

  const days = (await db
    .prepare("SELECT day FROM generated_days WHERE user_id=? ORDER BY day")
    .all(userId)) as Array<{ day: string }>;
  let added = 0;
  for (const { day } of days) {
    const info = await personalDayPlan(userId, day);
    added += await insertDayTasks(userId, day, info, true);
  }
  return { cancelled, added, days: days.map((row) => row.day) };
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
