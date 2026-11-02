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
// The white-first redesign changes previous automatic defaults once, without
// touching workspace records or explicit Light/Dark choices. A migration marker
// means a user can opt back into System later without it being reset on restart.
const themeColumn = db
  .prepare("PRAGMA table_info(settings)")
  .all()
  .find((column) => column.name === "theme");
db.exec("BEGIN IMMEDIATE");
try {
  const migration = "white-first-appearance-v1";
  if (
    !db.prepare("SELECT name FROM app_migrations WHERE name=?").get(migration)
  ) {
    db.prepare("UPDATE settings SET theme='light' WHERE theme='system'").run();
    if (themeColumn?.dflt_value === "'dark'")
      db.prepare(
        "UPDATE settings SET theme='light' WHERE theme='dark' AND updated_at=created_at",
      ).run();
    db.prepare("INSERT INTO app_migrations(name,applied_at) VALUES (?,?)").run(
      migration,
      new Date().toISOString(),
    );
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

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

// Migrate only exact obsolete job-search/LinkedIn batches and the old generic
// outreach reminder. Preserve every other personalised recurring task.
const obsoleteBatchTitles = new Set([
  "Review the 5 AM batch: 10 job listings and 10 trigger-based outreach targets",
  "Review the 6 AM LinkedIn batch: 10 roles and 10 founders or product owners",
  "Review the 8 AM batch: 10 fresh job listings and 10 trigger-based outreach targets",
]);
const oldGenericOutreach =
  "Complete and log 20 targeted client outreach actions";
const alignedOutreach =
  "Research and contact 10 new/emerging + 10 established businesses";
const savedSettings = db
  .prepare("SELECT id,daily_templates FROM settings")
  .all() as Array<{ id: string; daily_templates: string }>;
for (const setting of savedSettings) {
  try {
    const current = JSON.parse(setting.daily_templates);
    if (!Array.isArray(current)) continue;
    let changed = false;
    const next = current
      .filter((item) => {
        if (obsoleteBatchTitles.has(String(item?.title || ""))) {
          changed = true;
          return false;
        }
        return true;
      })
      .map((item) => {
        if (String(item?.title || "") !== oldGenericOutreach) return item;
        changed = true;
        return {
          ...item,
          title: alignedOutreach,
          estimated_minutes: item.estimated_minutes || 75,
          scheduled_time: "",
        };
      });
    if (changed) {
      db.prepare("UPDATE settings SET daily_templates=?,updated_at=? WHERE id=?")
        .run(JSON.stringify(next), now(), setting.id);
    }
  } catch {
    // Leave malformed or user-managed settings untouched for manual repair.
  }
}

// Ensure existing owner workspaces also receive the corrected daily course-partner task.
const coursePartnerTemplate = {
  title: "Find and contact 3 partners to share the AI design course",
  category: "Course Growth",
  priority: "high",
  estimated_minutes: 25,
};
for (const setting of db.prepare("SELECT id,daily_templates FROM settings").all() as Array<{id:string;daily_templates:string}>) {
  try {
    const current = JSON.parse(setting.daily_templates);
    if (!Array.isArray(current)) continue;
    const corrected = current.filter((item) => !/3 potential Next Chapter promotional partners/i.test(String(item?.title || "")));
    if (!corrected.some((item) => String(item?.title || "") === coursePartnerTemplate.title)) {
      corrected.push(coursePartnerTemplate);
      db.prepare("UPDATE settings SET daily_templates=?,updated_at=? WHERE id=?").run(JSON.stringify(corrected), now(), setting.id);
    }
  } catch {
    // Preserve settings that cannot be parsed automatically.
  }
}

// Migrate only the untouched legacy starter routine; preserve personalised routines.
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
    title: "Plan tomorrow’s top three outcomes",
    category: "Personal",
    priority: "low",
    estimated_minutes: 10,
  },
];
db.prepare(
  "UPDATE settings SET daily_templates=?,updated_at=? WHERE daily_templates=?",
).run(JSON.stringify(defaultTemplates), now(), JSON.stringify(legacyTemplates));

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
      "light",
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
        "Sell 68 seats of Graphic Design with AI at the ₦14,900 launch price (monthly target pace).",
        "Host Next Chapter live every Friday.",
        "Complete two substantial Creative Studio projects each week.",
        "Publish on all seven days; use Tuesday, Wednesday and Friday for course-growth content.",
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

/** Generate editable daily plans in the owner's timezone; never fake completed activity. */
export function ensureDailyPlan(userId: string, referenceDate = new Date()) {
  const profile = db
    .prepare(
      "SELECT timezone,auto_plan,daily_templates FROM settings WHERE user_id=?",
    )
    .get(userId) as
    | { timezone: string; auto_plan: number; daily_templates: string }
    | undefined;
  if (!profile) return;
  const day = dateInZone(profile.timezone || "Africa/Lagos", referenceDate);
  const cycle = db
    .prepare("SELECT id FROM cycles WHERE user_id=? AND month=?")
    .get(userId, day.slice(0, 7)) as { id: string } | undefined;

  // Seven-day-ahead guest confirmation is independent of today's plan generation.
  const sessionDay = addDays(day, 7);
  const sessions = db
    .prepare(
      "SELECT id,title,guest FROM chapter_sessions WHERE user_id=? AND session_date=? AND status NOT IN ('Archived','Completed')",
    )
    .all(userId, sessionDay) as Array<{
    id: string;
    title: string;
    guest: string;
  }>;
  for (const session of sessions) {
    const title = session.guest
      ? `Confirm next week's Next Chapter guest: ${session.guest}`
      : `Invite and confirm a guest for Next Chapter: ${session.title}`;
    if (
      !db
        .prepare(
          "SELECT 1 FROM tasks WHERE user_id=? AND session_id=? AND title=?",
        )
        .get(userId, session.id, title)
    ) {
      const stamp = now();
      db.prepare(
        `INSERT INTO tasks(id,user_id,cycle_id,session_id,title,description,category,priority,status,due_date,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'Next Chapter','high','todo',?,30,20,?,?)`,
      ).run(
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
    db
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
  // Monday–Sunday execution mapped to the agreed Nov 2–8 weekly outcomes.
  if (weekdayNumber === 1) {
    add("Choose the two Creative Studio projects and define this week's deliverables", "Creative Studio", "high", 30);
    add("Start Creative Project 1: build the social-media campaign (Monday–Wednesday)", "Creative Studio", "high", 120);
    add("Write the monthly content bank plan and this week's publishing schedule", "Personal Brand", "high", 60);
    add("Write the Next Chapter announcement/session script", "Next Chapter", "high", 40);
    add("Hold the team strategy meeting and assign owners and deadlines", "Team Workspace", "high", 45);
    add("Brief designers on the Next Chapter main flyer, speaker-bio flyer and advertising flyer", "Next Chapter", "high", 30);
    add("Begin recruiting a Social Media Manager (separate from the existing Community Manager)", "Personal Brand", "high", 30);
    add("Select and publish Monday's planned post", "Personal Brand", "high", 45);
    add("Start Brand Identity Project 1; prepare the first content milestone for Wednesday", "Creative Studio", "high", 90);
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
    add("Review the two weekly Creative Studio projects and set next milestones", "Creative Studio", "high", 30);
    add("Create next Friday's Next Chapter session plan and begin guest outreach", "Next Chapter", "high", 30);
  }

  // Carry-forward is an explicit user action in My Day or cycle rollover.
  // Automatic planning must not change or duplicate unfinished tasks.
  const stamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare("INSERT OR IGNORE INTO generated_days(user_id,day) VALUES (?,?)")
      .run(userId, day);
    if (Number(result.changes)) {
      const insert =
        db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,title,category,priority,status,due_date,scheduled_time,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'todo',?,?,?,?,?,?)`);
      planned.slice(0, 30).forEach((template, index) => {
        if (typeof template.title !== "string" || !template.title.trim())
          return;
        const priority = ["high", "medium", "low"].includes(
          template.priority || "",
        )
          ? template.priority!
          : "medium";
        insert.run(
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
