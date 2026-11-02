import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "momentum-planner-"));
process.env.DATA_DIR = directory;
const { db, id, now, createWorkspace, ensureDailyPlan } =
  await import("../server/db");

async function owner(userId: string) {
  await createWorkspace(
    userId,
    `${userId}@example.com`,
    "test-password-hash",
    "Planner Test",
  );
}
async function titles(userId: string) {
  return (
    (await db
      .prepare("SELECT title FROM tasks WHERE user_id=? ORDER BY sort_order")
      .all(userId)) as Array<{ title: string }>
  ).map((row) => row.title);
}

afterAll(async () => {
  await db.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("goal-driven daily and weekly planning", () => {
  it("generates the corrected daily course, prospecting and publishing routine without retired job batches", async () => {
    await owner("daily-owner");
    await ensureDailyPlan("daily-owner", new Date("2026-11-02T12:00:00.000Z"));
    const rows = (await db
      .prepare("SELECT title,scheduled_time FROM tasks WHERE user_id=?")
      .all("daily-owner")) as Array<{
      title: string;
      scheduled_time: string;
    }>;
    expect(rows.map((row) => row.title)).toContain(
      "Promote Graphic Design with AI; respond to enquiries and follow up warm leads",
    );
    expect(rows.map((row) => row.title)).toContain(
      "Research 10 new/emerging businesses and 10 established businesses",
    );
    expect(rows.map((row) => row.title)).toContain(
      "Send 20 relevant client outreach messages/proposals and log each interaction",
    );
    expect(rows.map((row) => row.title)).toContain(
      "Research and contact 3 promotional partners for Graphic Design with AI",
    );
    expect(rows.some((row) => /5 AM batch|6 AM LinkedIn batch|8 AM batch/.test(row.title))).toBe(false);
  });

  it("maps the two-project and weekly publishing rhythm to the correct weekdays", async () => {
    for (const name of [
      "monday-owner",
      "tuesday-owner",
      "thursday-owner",
      "friday-owner",
    ])
      await owner(name);
    await ensureDailyPlan("monday-owner", new Date("2026-11-02T12:00:00.000Z"));
    await ensureDailyPlan("tuesday-owner", new Date("2026-11-03T12:00:00.000Z"));
    await ensureDailyPlan("thursday-owner", new Date("2026-11-05T12:00:00.000Z"));
    await ensureDailyPlan("friday-owner", new Date("2026-11-06T12:00:00.000Z"));
    expect(await titles("monday-owner")).toContain(
      "Start Creative Project 1: build the social-media campaign (Monday–Wednesday)",
    );
    expect(await titles("tuesday-owner")).toContain(
      "Publish Carousel 1 and distribute it",
    );
    expect(await titles("tuesday-owner")).toContain(
      "Publish the YouTube free tutorial and share it with the community",
    );
    expect(await titles("thursday-owner")).toContain(
      "Publish Carousel 2",
    );
    expect(await titles("thursday-owner")).toContain(
      "Develop one substantial Next Chapter content piece",
    );
    expect(await titles("friday-owner")).toContain(
      "Prepare and deliver the weekly Next Chapter live session",
    );
  });

  it("creates a seven-day guest confirmation reminder for a scheduled Next Chapter session", async () => {
    await owner("guest-owner");
    const stamp = now(),
      sessionId = id();
    await db
      .prepare(
        `INSERT INTO chapter_sessions(id,user_id,title,guest,session_date,session_time,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'16:00','Planning',?,?)`,
      )
      .run(
        sessionId,
        "guest-owner",
        "Next Chapter: Creative Work",
        "Guest Speaker",
        "2026-11-09",
        stamp,
        stamp,
      );
    await ensureDailyPlan("guest-owner", new Date("2026-11-02T12:00:00.000Z"));
    const reminder = (await db
      .prepare(
        "SELECT title,due_date,session_id FROM tasks WHERE user_id=? AND session_id=?",
      )
      .get("guest-owner", sessionId)) as {
      title: string;
      due_date: string;
      session_id: string;
    };
    expect(reminder.title).toContain("Confirm next week's Next Chapter guest");
    expect(reminder.due_date).toBe("2026-11-02");
    expect(reminder.session_id).toBe(sessionId);
    await ensureDailyPlan("guest-owner", new Date("2026-11-02T13:00:00.000Z"));
    const count = (await db
      .prepare(
        "SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND session_id=?",
      )
      .get("guest-owner", sessionId)) as { count: number };
    expect(count.count).toBe(1);
  });

  it("leaves unfinished work untouched until the owner chooses to carry it", async () => {
    await owner("carry-owner");
    const stamp = now();
    const originalId = id();
    await db
      .prepare(
        `INSERT INTO tasks(id,user_id,title,category,priority,status,due_date,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,'Creative Studio','high','in_progress','2026-11-01',90,?,?)`,
      )
      .run(originalId, "carry-owner", "Finish campaign concept", stamp, stamp);
    await ensureDailyPlan("carry-owner", new Date("2026-11-02T12:00:00.000Z"));
    await ensureDailyPlan("carry-owner", new Date("2026-11-02T13:00:00.000Z"));
    const original = await db
      .prepare("SELECT status,due_date FROM tasks WHERE id=?")
      .get(originalId);
    expect(original).toMatchObject({
      status: "in_progress",
      due_date: "2026-11-01",
    });
    const carried = (await db
      .prepare(
        "SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND carried_from_id=?",
      )
      .get("carry-owner", originalId)) as { count: number };
    expect(carried.count).toBe(0);
  });
});
