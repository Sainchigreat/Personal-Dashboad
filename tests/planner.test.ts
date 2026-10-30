import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "momentum-planner-"));
process.env.DATA_DIR = directory;
const { db, id, now, createWorkspace, ensureDailyPlan } = await import("../server/db");

function owner(userId: string) {
  createWorkspace(userId, `${userId}@example.com`, "test-password-hash", "Planner Test");
}
function titles(userId: string) {
  return (db.prepare("SELECT title FROM tasks WHERE user_id=? ORDER BY sort_order").all(userId) as Array<{title:string}>).map(row => row.title);
}

afterAll(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("goal-driven daily and weekly planning", () => {
  it("generates the daily outreach routine with scheduled 5, 6 and 8 AM review blocks", () => {
    owner("daily-owner");
    ensureDailyPlan("daily-owner", new Date("2026-11-02T12:00:00.000Z"));
    const rows = db.prepare("SELECT title,scheduled_time FROM tasks WHERE user_id=?").all("daily-owner") as Array<{title:string;scheduled_time:string}>;
    expect(rows.map(row => row.title)).toContain("Publish today's Graphic Design with AI course promotion on WhatsApp Status");
    expect(rows.map(row => row.title)).toContain("Complete and log 20 targeted client outreach actions");
    expect(rows.find(row => row.title.includes("5 AM batch"))?.scheduled_time).toBe("05:00");
    expect(rows.find(row => row.title.includes("6 AM LinkedIn batch"))?.scheduled_time).toBe("06:00");
    expect(rows.find(row => row.title.includes("8 AM batch"))?.scheduled_time).toBe("08:00");
  });

  it("maps the two-project and weekly publishing rhythm to the correct weekdays", () => {
    owner("monday-owner");
    owner("tuesday-owner");
    owner("thursday-owner");
    owner("friday-owner");
    ensureDailyPlan("monday-owner", new Date("2026-11-02T12:00:00.000Z"));
    ensureDailyPlan("tuesday-owner", new Date("2026-11-03T12:00:00.000Z"));
    ensureDailyPlan("thursday-owner", new Date("2026-11-05T12:00:00.000Z"));
    ensureDailyPlan("friday-owner", new Date("2026-11-06T12:00:00.000Z"));
    expect(titles("monday-owner")).toContain("Creative Project 1 — complete today's planned milestone");
    expect(titles("tuesday-owner")).toContain("Publish and distribute this week's course-growth content");
    expect(titles("tuesday-owner")).toContain("Develop one substantial Next Chapter content piece");
    expect(titles("thursday-owner")).toContain("Creative Project 2 — complete today's planned milestone");
    expect(titles("thursday-owner")).toContain("Develop one substantial Next Chapter content piece");
    expect(titles("friday-owner")).toContain("Prepare and deliver the weekly Next Chapter live session");
  });

  it("creates a seven-day guest confirmation reminder for a scheduled Next Chapter session", () => {
    owner("guest-owner");
    const stamp = now(), sessionId = id();
    db.prepare(`INSERT INTO chapter_sessions(id,user_id,title,guest,session_date,session_time,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'16:00','Planning',?,?)`).run(sessionId, "guest-owner", "Next Chapter: Creative Work", "Guest Speaker", "2026-11-09", stamp, stamp);
    ensureDailyPlan("guest-owner", new Date("2026-11-02T12:00:00.000Z"));
    const reminder = db.prepare("SELECT title,due_date,session_id FROM tasks WHERE user_id=? AND session_id=?").get("guest-owner", sessionId) as {title:string;due_date:string;session_id:string};
    expect(reminder.title).toContain("Confirm next week's Next Chapter guest");
    expect(reminder.due_date).toBe("2026-11-02");
    expect(reminder.session_id).toBe(sessionId);
    ensureDailyPlan("guest-owner", new Date("2026-11-02T13:00:00.000Z"));
    expect(db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND session_id=?").get("guest-owner", sessionId)?.count).toBe(1);
  });

  it("carries unfinished tasks forward once while preserving the original record", () => {
    owner("carry-owner");
    const stamp = now();
    const originalId = id();
    db.prepare(`INSERT INTO tasks(id,user_id,title,category,priority,status,due_date,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,'Creative Studio','high','in_progress','2026-11-01',90,?,?)`).run(originalId, "carry-owner", "Finish campaign concept", stamp, stamp);
    ensureDailyPlan("carry-owner", new Date("2026-11-02T12:00:00.000Z"));
    const original = db.prepare("SELECT status FROM tasks WHERE id=?").get(originalId) as {status:string};
    const carried = db.prepare("SELECT title,due_date,carried_from_id,status FROM tasks WHERE user_id=? AND carried_from_id=?").get("carry-owner", originalId) as {title:string;due_date:string;carried_from_id:string;status:string};
    expect(original.status).toBe("carried");
    expect(carried).toMatchObject({title:"Continue: Finish campaign concept",due_date:"2026-11-02",carried_from_id:originalId,status:"todo"});
    ensureDailyPlan("carry-owner", new Date("2026-11-02T13:00:00.000Z"));
    expect(db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND carried_from_id=?").get("carry-owner", originalId)?.count).toBe(1);
  });
});
