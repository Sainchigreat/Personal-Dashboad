import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.DATA_DIR || (process.env.MOMENTUM_PREVIEW === "1" ? "./data/preview" : "./data/workspace"));
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const databasePath = resolve(dataDir, "momentum.sqlite");
export const db = new DatabaseSync(databasePath);
chmodSync(databasePath, 0o600);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
db.exec(readFileSync(resolve(here, "schema.sql"), "utf8"));

const settingsColumns = db.prepare("PRAGMA table_info(settings)").all().map((column) => String(column.name));
if (!settingsColumns.includes("platforms")) db.exec("ALTER TABLE settings ADD COLUMN platforms TEXT NOT NULL DEFAULT 'Instagram,LinkedIn,YouTube,WhatsApp'");
if (!settingsColumns.includes("notifications_enabled")) db.exec("ALTER TABLE settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1");
const themeColumn = db.prepare("PRAGMA table_info(settings)").all().find((column) => column.name === "theme");
if (themeColumn?.dflt_value === "'dark'") db.prepare("UPDATE settings SET theme='system' WHERE theme='dark' AND updated_at=created_at").run();

export const id = () => randomUUID();
export const now = () => new Date().toISOString();

export function dateInZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (name: string) => parts.find((part) => part.type === name)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function weekday(day: string): number {
  return new Date(`${day}T12:00:00.000Z`).getUTCDay();
}

const defaultTemplates = [
  { title: "Publish today's course promotion on WhatsApp Status", category: "Course Growth", priority: "high", estimated_minutes: 20 },
  { title: "Respond to course enquiries and follow up warm leads", category: "Course Growth", priority: "high", estimated_minutes: 30 },
  { title: "Complete today's 20 targeted outreach actions and log them", category: "Client Pipeline", priority: "high", estimated_minutes: 75 },
  { title: "Capture one useful idea or lesson for your personal brand", category: "Personal Brand", priority: "medium", estimated_minutes: 15 },
  { title: "Record today's wins, blockers and tomorrow's first action", category: "Personal", priority: "low", estimated_minutes: 10 },
];
const legacyDefaultTemplates = [
  { title: "Follow up on course enquiries", category: "Course Growth", priority: "high", estimated_minutes: 20 },
  { title: "Reach out to potential clients", category: "Client Pipeline", priority: "high", estimated_minutes: 60 },
  { title: "Make progress on a creative project", category: "Creative Studio", priority: "high", estimated_minutes: 60 },
  { title: "Share useful work on WhatsApp", category: "Course Growth", priority: "medium", estimated_minutes: 15 },
  { title: "Capture a content idea", category: "Personal Brand", priority: "medium", estimated_minutes: 10 },
  { title: "Plan tomorrow’s top three outcomes", category: "Personal", priority: "low", estimated_minutes: 10 },
];
db.prepare("UPDATE settings SET daily_templates=?,updated_at=? WHERE daily_templates=?")
  .run(JSON.stringify(defaultTemplates), now(), JSON.stringify(legacyDefaultTemplates));

export function createWorkspace(userId: string, email: string, passwordHash: string, name: string) {
  const stamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)").run(userId, email.toLowerCase(), passwordHash, stamp);
    db.prepare(`INSERT INTO settings (id,user_id,name,timezone,work_start,work_end,theme,auto_plan,daily_templates,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id(), userId, name || "Chisom Ogbonna", "Africa/Lagos", "08:00", "17:00", "system", 1, JSON.stringify(defaultTemplates), stamp, stamp);
    db.prepare(`INSERT INTO products (id,user_id,name,price,description,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).run(id(), userId, "Graphic Design with AI", 14900, "Digital course", 1, stamp, stamp);
    db.prepare(`INSERT INTO cycles (id,user_id,month,theme,objective,objectives,sales_target,revenue_target,outreach_target,projects_target,chapter_content_target,course_days,session_day,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id(), userId, "2026-11", "Build with intention",
      "Build a consistent sales, creative production, audience and client pipeline through November.",
      [
        "Course growth: sustain daily WhatsApp Status promotion, enquiry follow-up and track paid sales against the active campaign target.",
        "Next Chapter: deliver one live conversation every Friday; invite and confirm the following week's guest at least seven days ahead.",
        "Creative production: complete two substantial projects every week — Project 1 Monday to Wednesday, Project 2 Thursday to Friday.",
        "Content: publish course-related content on Tuesday, Wednesday and Friday; produce two substantial Next Chapter content pieces weekly.",
        "Client acquisition: complete and record 20 targeted outreach actions daily.",
        "Personal brand: document creative process, publish useful work and batch upcoming content during the weekend."
      ].join("\\n"),
      67, 1000000, 20, 2, 2, "2,3,5", 5, "active", stamp, stamp
    );
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

// Existing single-owner installs receive only a narrowly scoped correction to the
// original generated November seed. User-edited cycles are left untouched.
db.prepare(`UPDATE cycles SET sales_target=67,revenue_target=1000000,
 objective='Build a consistent sales, creative production, audience and client pipeline through November.',
 updated_at=?
 WHERE month='2026-11' AND sales_target=68 AND revenue_target=1013200
 AND objectives LIKE '%Sell 68 seats of Graphic Design with AI%'`).run(now());

/**
 * Materializes a fresh, editable daily plan in the owner's local timezone.
 * It creates planned work only: no generated task is marked completed and
 * real progress is counted only when the owner records an outcome.
 */
export function ensureDailyPlan(userId: string) {
  const profile = db.prepare("SELECT timezone,auto_plan,daily_templates FROM settings WHERE user_id=?").get(userId) as
    | { timezone: string; auto_plan: number; daily_templates: string }
    | undefined;
  if (!profile) return;
  const day = dateInZone(profile.timezone || "Africa/Lagos");
  const cycle = db.prepare("SELECT id,session_day FROM cycles WHERE user_id=? AND month=?").get(userId, day.slice(0, 7)) as
    | { id: string; session_day: number }
    | undefined;

  // Carry a small, bounded number of unfinished tasks into today's plan.
  // The original is retained as history and linked from the new editable task.
  if (profile.auto_plan) {
    const overdue = db.prepare("SELECT * FROM tasks WHERE user_id=? AND due_date<? AND status IN ('todo','in_progress','deferred') ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_date ASC LIMIT 8")
      .all(userId, day) as Array<Record<string, string | number | null>>;
    if (overdue.length) {
      const stamp = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const insertCarry = db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,project_id,session_id,carried_from_id,title,description,category,priority,status,due_date,scheduled_time,estimated_minutes,actual_minutes,sort_order,notes,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,? ,?,?,'todo',?,?,?,?,?,?,?,?)`);
        for (const task of overdue) {
          const carriedId = id();
          insertCarry.run(
            carriedId, userId, cycle?.id || task.cycle_id, task.project_id, task.session_id,
            task.id, `Continue: ${String(task.title)}`,
            String(task.description || ""), String(task.category || "Personal"),
            String(task.priority || "medium"), day, String(task.scheduled_time || ""),
            Number(task.estimated_minutes || 0), 0, Number(task.sort_order || 0),
            String(task.notes || ""), stamp, stamp
          );
          db.prepare("UPDATE tasks SET status='carried',updated_at=? WHERE id=? AND user_id=?")
            .run(stamp, task.id, userId);
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
  }

  // A session created later in the week still gets a seven-day guest reminder.
  // This check runs on every bootstrap and is idempotent, even after today's
  // regular task plan has already been generated.
  const nextWeek = addDays(day, 7);
  const upcoming = db.prepare("SELECT id,title,guest FROM chapter_sessions WHERE user_id=? AND session_date=? AND status NOT IN ('Archived','Completed')").all(userId, nextWeek) as Array<{id:string;title:string;guest:string}>;
  for (const session of upcoming) {
    const title = session.guest
      ? `Confirm next week's Next Chapter guest: ${session.guest}`
      : `Invite and confirm a guest for Next Chapter: ${session.title}`;
    const exists = db.prepare("SELECT 1 FROM tasks WHERE user_id=? AND session_id=? AND title=?").get(userId, session.id, title);
    if (!exists) {
      const stamp = now();
      db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,session_id,title,description,category,priority,status,due_date,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'Next Chapter','high','todo',?,30,20,?,?)`).run(
        id(), userId, cycle?.id || null, session.id, title,
        "Guest confirmation is scheduled one week before the live session. Record the confirmed guest in Next Chapter.",
        day, stamp, stamp
      );
    }
  }

  if (!profile.auto_plan) return;
  let templates: Array<{title?:string;category?:string;priority?:string;estimated_minutes?:number}>;
  try { templates = JSON.parse(profile.daily_templates); } catch { return; }
  if (!Array.isArray(templates)) return;
  const already = db.prepare("SELECT day FROM generated_days WHERE user_id=? AND day=?").get(userId, day);
  if (already) return;

  const stamp = now();
  const dayOfWeek = weekday(day);
  const planned = [...templates.slice(0, 20)];
  const add = (title:string, category:string, priority="high", minutes=60) => planned.push({title,category,priority,estimated_minutes:minutes});

  // Two-project weekly cadence: first project Mon-Wed, second Thu-Fri.
  if (dayOfWeek >= 1 && dayOfWeek <= 3)
    add("Creative Project 1 — make today's planned milestone", "Creative Studio", "high", 120);
  if (dayOfWeek === 4 || dayOfWeek === 5)
    add("Creative Project 2 — make today's planned milestone", "Creative Studio", "high", 120);

  // Three weekly course publication days.
  if ([2,3,5].includes(dayOfWeek))
    add("Publish and distribute this week's course-growth content", "Course Growth", "high", 45);

  // Two Next Chapter editorial pieces per week: Tuesday and Thursday are
  // production days; the Friday session itself is planned from its session record.
  if (dayOfWeek === 2 || dayOfWeek === 4)
    add("Develop one substantial Next Chapter content piece", "Next Chapter", "medium", 60);

  if (dayOfWeek === 5) {
    add("Prepare and deliver the weekly Next Chapter live session", "Next Chapter", "high", 90);
    add("Review next week's guest and session plan", "Next Chapter", "high", 20);
  }
  if (dayOfWeek === 0) {
    add("Batch content and prepare the coming week's publishing schedule", "Personal Brand", "high", 90);
    add("Plan two creative projects and confirm weekly milestones", "Creative Studio", "high", 30);
    add("Review Next Chapter guest, topic and Friday session readiness", "Next Chapter", "high", 20);
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare("INSERT OR IGNORE INTO generated_days(user_id,day) VALUES (?,?)").run(userId, day);
    if (Number(result.changes)) {
      const insert = db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,title,category,priority,status,due_date,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'todo',?,?,?,?,?)`);
      planned.slice(0, 30).forEach((template,index) => {
        if (typeof template.title !== "string" || !template.title.trim()) return;
        const priority = ["high","medium","low"].includes(template.priority || "") ? template.priority! : "medium";
        insert.run(id(),userId,cycle?.id || null,template.title.trim().slice(0,200),String(template.category || "Personal").slice(0,80),priority,day,Math.max(0,Math.min(1440,Number(template.estimated_minutes)||0)),index,stamp,stamp);
      });
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function createTeamOwnerWorkspace(userId: string) {
  const stamp = now();
  const workspaceId = id();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO team_workspaces(id,owner_user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(workspaceId,userId,"Team Workspace",stamp,stamp);
    db.prepare("INSERT INTO team_members(id,workspace_id,user_id,role,status,joined_at) VALUES (?,?,?,'owner','active',?)").run(id(),workspaceId,userId,stamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

const firstAccount = db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").get() as {id:string}|undefined;
if (firstAccount && !db.prepare("SELECT 1 FROM team_workspaces LIMIT 1").get()) {
  const stamp = now(), workspaceId = id();
  db.prepare("INSERT INTO team_workspaces(id,owner_user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(workspaceId,firstAccount.id,"Team Workspace",stamp,stamp);
  db.prepare("INSERT INTO team_members(id,workspace_id,user_id,role,status,joined_at) VALUES (?,?,?,'owner','active',?)").run(id(),workspaceId,firstAccount.id,stamp);
}
