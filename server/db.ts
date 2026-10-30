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

/** Generates editable plans, never completed activity, once per local calendar day. */
export function ensureDailyPlan(userId: string) {
  const profile = db
    .prepare(
      "SELECT timezone,auto_plan,daily_templates FROM settings WHERE user_id=?",
    )
    .get(userId) as
    | { timezone: string; auto_plan: number; daily_templates: string }
    | undefined;
  if (!profile || !profile.auto_plan) return;
  const day = dateInZone(profile.timezone);
  let templates: Array<{
    title?: string;
    category?: string;
    priority?: string;
    estimated_minutes?: number;
  }>;
  try {
    templates = JSON.parse(profile.daily_templates);
  } catch {
    return;
  }
  if (!Array.isArray(templates)) return;
  const already = db
    .prepare("SELECT day FROM generated_days WHERE user_id=? AND day=?")
    .get(userId, day);
  if (already) return;
  const cycle = db
    .prepare("SELECT id FROM cycles WHERE user_id=? AND month=?")
    .get(userId, day.slice(0, 7)) as { id: string } | undefined;
  const stamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare("INSERT OR IGNORE INTO generated_days(user_id,day) VALUES (?,?)")
      .run(userId, day);
    if (Number(result.changes)) {
      const insert =
        db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,title,category,priority,status,due_date,estimated_minutes,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'todo',?,?,?,?,?)`);
      templates.slice(0, 30).forEach((template, index) => {
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
