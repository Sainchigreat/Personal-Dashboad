import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(
  process.env.DATA_DIR ||
    (process.env.MOMENTUM_PREVIEW === "1"
      ? "./data/preview"
      : "./data/workspace"),
);
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const databasePath = resolve(dataDir, "momentum.sqlite");
export const db = new DatabaseSync(databasePath);
chmodSync(databasePath, 0o600);
db.exec(
  "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
);
db.exec(readFileSync(resolve(here, "schema.sql"), "utf8"));
// Additive migrations for workspaces created by an earlier version.
const userColumns = db
  .prepare("PRAGMA table_info(users)")
  .all()
  .map((column) => String(column.name));
if (!userColumns.includes("account_type"))
  db.exec(
    "ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'owner'",
  );
// The earlier Team Workspace draft created invited users before account_type
// existed. Classify every non-owner membership as team-only, including a
// database that already received the column with its default value. Preserve
// any legacy seeded personal rows, but do not expose personal APIs to them.
db.prepare(
  `UPDATE users SET account_type='team'
  WHERE account_type!='team' AND EXISTS (
    SELECT 1 FROM team_members m JOIN team_workspaces w ON w.id=m.workspace_id
    WHERE m.user_id=users.id AND w.owner_user_id!=users.id
  )`,
).run();
const teamTaskColumns = db
  .prepare("PRAGMA table_info(team_tasks)")
  .all()
  .map((column) => String(column.name));
if (!teamTaskColumns.includes("submission"))
  db.exec(
    "ALTER TABLE team_tasks ADD COLUMN submission TEXT NOT NULL DEFAULT ''",
  );
const settingsColumns = db
  .prepare("PRAGMA table_info(settings)")
  .all()
  .map((column) => String(column.name));
if (!settingsColumns.includes("platforms"))
  db.exec(
    "ALTER TABLE settings ADD COLUMN platforms TEXT NOT NULL DEFAULT 'Instagram,LinkedIn,YouTube,WhatsApp'",
  );
if (!settingsColumns.includes("notifications_enabled"))
  db.exec(
    "ALTER TABLE settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1",
  );
// Earlier versions seeded dark as the default. Follow the device for untouched
// defaults, while keeping light/dark preferences that an owner has saved.
const themeColumn = db
  .prepare("PRAGMA table_info(settings)")
  .all()
  .find((column) => column.name === "theme");
if (themeColumn?.dflt_value === "'dark'")
  db.prepare(
    "UPDATE settings SET theme='system' WHERE theme='dark' AND updated_at=created_at",
  ).run();

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
  { title: "Publish today's Graphic Design with AI course promotion on WhatsApp Status", category: "Course Growth", priority: "high", estimated_minutes: 20 },
  { title: "Respond to course enquiries and follow up warm leads", category: "Course Growth", priority: "high", estimated_minutes: 30 },
  { title: "Complete and log 20 targeted client outreach actions", category: "Client Pipeline", priority: "high", estimated_minutes: 75 },
  { title: "Review the 5 AM batch: 10 job listings and 10 trigger-based outreach targets", category: "Client Pipeline", priority: "high", estimated_minutes: 25, scheduled_time: "05:00" },
  { title: "Review the 6 AM LinkedIn batch: 10 roles and 10 founders or product owners", category: "Client Pipeline", priority: "high", estimated_minutes: 25, scheduled_time: "06:00" },
  { title: "Review the 8 AM batch: 10 fresh job listings and 10 trigger-based outreach targets", category: "Client Pipeline", priority: "high", estimated_minutes: 25, scheduled_time: "08:00" },
  { title: "Capture one useful idea or lesson for your personal brand", category: "Personal Brand", priority: "medium", estimated_minutes: 15 },
  { title: "Record today's wins, blockers and tomorrow's first action", category: "Personal", priority: "low", estimated_minutes: 10 },
];


// Upgrade only the untouched starter routine. Personalised daily templates are
// deliberately preserved so an owner does not lose their own operating rhythm.
const legacyTemplates = [
  { title: "Follow up on course enquiries", category: "Course Growth", priority: "high", estimated_minutes: 20 },
  { title: "Reach out to potential clients", category: "Client Pipeline", priority: "high", estimated_minutes: 60 },
  { title: "Make progress on a creative project", category: "Creative Studio", priority: "high", estimated_minutes: 60 },
  { title: "Share useful work on WhatsApp", category: "Course Growth", priority: "medium", estimated_minutes: 15 },
  { title: "Capture a content idea", category: "Personal Brand", priority: "medium", estimated_minutes: 10 },
  { title: "Plan tomorrow’s top three outcomes", category: "Personal", priority: "low", estimated_minutes: 10 },
];
db.prepare("UPDATE settings SET daily_templates=?,updated_at=? WHERE daily_templates=?")
  .run(JSON.stringify(defaultTemplates), now(), JSON.stringify(legacyTemplates));

export function createWorkspace(
  userId: string,
  email: string,
  passwordHash: string,
  name: string,
) {
  const stamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)",
    ).run(userId, email.toLowerCase(), passwordHash, stamp);
    db.prepare(
      `INSERT INTO settings (id,user_id,name,timezone,work_start,work_end,theme,auto_plan,daily_templates,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id(),
      userId,
      name || "Chisom Ogbonna",
      "Africa/Lagos",
      "08:00",
      "17:00",
      "system",
      1,
      JSON.stringify(defaultTemplates),
      stamp,
      stamp,
    );
    db.prepare(
      `INSERT INTO products (id,user_id,name,price,description,active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      id(),
      userId,
      "Graphic Design with AI",
      14900,
      "Digital course",
      1,
      stamp,
      stamp,
    );
    db.prepare(
      `INSERT INTO cycles (id,user_id,month,theme,objective,objectives,sales_target,revenue_target,outreach_target,projects_target,chapter_content_target,course_days,session_day,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
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
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function weekday(day: string): number {
  return new Date(`${day}T12:00:00.000Z`).getUTCDay();
}

/**
 * Generates editable daily plans in the owner's timezone. Planned work is
 * never counted as completed activity. The planner is idempotent per day.
 */
export function ensureDailyPlan(userId: string) {
  const profile = db
    .prepare("SELECT timezone,auto_plan,daily_templates FROM settings WHERE user_id=?")
    .get(userId) as { timezone: string; auto_plan: number; daily_templates: string } | undefined;
  if (!profile) return;
  const day = dateInZone(profile.timezone || "Africa/Lagos");
  const cycle = db.prepare("SELECT id FROM cycles WHERE user_id=? AND month=?")
    .get(userId, day.slice(0, 7)) as { id: string } | undefined;

  // Create a guest-confirmation task exactly seven days before a scheduled
  // Next Chapter session. This check runs even if today's plan already exists.
  const sessionDay = addDays(day, 7);
  const sessions = db.prepare(
    "SELECT id,title,guest FROM chapter_sessions WHERE user_id=? AND session_date=? AND status NOT IN ('Archived','Completed')"
  ).all(userId, sessionDay) as Array<{ id: string; title: string; guest: string }>;
  for (const session of sessions) {
    const title = session.guest
      ? `Confirm next week's Next Chapter guest: ${session.guest}`
      : `Invite and confirm a guest for Next Chapter: ${session.title}`;
    const exists = db.prepare("SELECT 1 FROM tasks WHERE user_id=? AND session_id=? AND title=?")
      .get(userId, session.id, title);
    if (!exists) {
      const stamp = now();
      db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,session_id,title,description,category,priority,status,due_date,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'Next Chapter','high','todo',?,30,20,?,?)`)
        .run(id(), userId, cycle?.id || null, session.id, title,
          "This reminder is scheduled seven days before the live session. Confirm the guest and update the session record.",
          day, stamp, stamp);
    }
  }

  if (!profile.auto_plan) return;
  let templates: Array<{ title?: string; category?: string; priority?: string; estimated_minutes?: number; scheduled_time?: string }>;
  try { templates = JSON.parse(profile.daily_templates); } catch { return; }
  if (!Array.isArray(templates)) return;

  const already = db.prepare("SELECT day FROM generated_days WHERE user_id=? AND day=?").get(userId, day);
  if (already) return;

  const dayOfWeek = weekday(day);
  const planned = [...templates.slice(0, 20)];
  const add = (title: string, category: string, priority = "high", minutes = 60) =>
    planned.push({ title, category, priority, estimated_minutes: minutes });

  // Creative work is deliberately split into two weekly production blocks.
  if (dayOfWeek >= 1 && dayOfWeek <= 3)
    add("Creative Project 1 — complete today's planned milestone", "Creative Studio", "high", 120);
  if (dayOfWeek === 4 || dayOfWeek === 5)
    add("Creative Project 2 — complete today's planned milestone", "Creative Studio", "high", 120);

  // Course publishing days from the November operating plan.
  if ([2, 3, 5].includes(dayOfWeek))
    add("Publish and distribute this week's course-growth content", "Course Growth", "high", 45);

  // Two Next Chapter editorial production blocks per week.
  if (dayOfWeek === 2 || dayOfWeek === 4)
    add("Develop one substantial Next Chapter content piece", "Next Chapter", "medium", 60);

  if (dayOfWeek === 5) {
    add("Prepare and deliver the weekly Next Chapter live session", "Next Chapter", "high", 90);
    add("Review next week's guest and session readiness", "Next Chapter", "high", 20);
  }
  if (dayOfWeek === 6)
    add("Batch creative assets and prepare next week's content drafts", "Personal Brand", "high", 90);
  if (dayOfWeek === 0) {
    add("Batch content and prepare the coming week's publishing schedule", "Personal Brand", "high", 90);
    add("Plan two creative projects and confirm weekly milestones", "Creative Studio", "high", 30);
    add("Create next Friday's Next Chapter session plan and begin guest outreach", "Next Chapter", "high", 30);
  }

  // Carry forward at most eight genuinely unfinished tasks. Preserve the
  // original as history and link the new task to it; never auto-complete work.
  const overdue = db.prepare(
    "SELECT * FROM tasks WHERE user_id=? AND due_date<? AND status IN ('todo','in_progress','deferred') ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,due_date ASC LIMIT 8"
  ).all(userId, day) as Array<Record<string, string | number | null>>;
  const stamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare("INSERT OR IGNORE INTO generated_days(user_id,day) VALUES (?,?)").run(userId, day);
    if (Number(result.changes)) {
      const carry = db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,project_id,session_id,carried_from_id,title,description,category,priority,status,due_date,scheduled_time,estimated_minutes,actual_minutes,sort_order,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?, ?,?,?,'todo',?,?,?,?,?,?,?,?)`);
      overdue.forEach((task) => {
        carry.run(id(), userId, cycle?.id || task.cycle_id, task.project_id, task.session_id,
          task.id, `Continue: ${String(task.title)}`, String(task.description || ""),
          String(task.category || "Personal"), String(task.priority || "medium"),
          day, String(task.scheduled_time || ""), Number(task.estimated_minutes || 0), 0,
          Number(task.sort_order || 0), String(task.notes || ""), stamp, stamp);
        db.prepare("UPDATE tasks SET status='carried',updated_at=? WHERE id=? AND user_id=?")
          .run(stamp, task.id, userId);
      });
      const insert = db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,title,category,priority,status,due_date,scheduled_time,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'todo',?,?,?,?,?,?)`);
      planned.slice(0, 30).forEach((template, index) => {
        if (typeof template.title !== "string" || !template.title.trim()) return;
        const priority = ["high", "medium", "low"].includes(template.priority || "") ? template.priority! : "medium";
        insert.run(id(), userId, cycle?.id || null, template.title.trim().slice(0, 200),
          String(template.category || "Personal").slice(0, 80), priority, day,
          String(template.scheduled_time || ""), Math.max(0, Math.min(1440, Number(template.estimated_minutes) || 0)),
          index + overdue.length, stamp, stamp);
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Existing private workspaces get a shared team space without changing their data. */
export function ensureTeamOwnerWorkspace(userId: string) {
  const stamp = now();
  db.prepare(
    "INSERT OR IGNORE INTO team_workspaces(id,owner_user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)",
  ).run(id(), userId, "Team Workspace", stamp, stamp);
  const workspace = db
    .prepare("SELECT id FROM team_workspaces WHERE owner_user_id=?")
    .get(userId) as { id: string };
  db.prepare(
    "INSERT OR IGNORE INTO team_members(id,workspace_id,user_id,role,status,joined_at) VALUES (?,?,?,'owner','active',?)",
  ).run(id(), workspace.id, userId, stamp);
  return workspace.id;
}
