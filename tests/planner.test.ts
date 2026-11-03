// Personal-workspace scoping and the November 2-8 date-aware planner.
// Chisom's plan is applied ONLY to the verified personal owner; every other
// account starts clean. Verifies each weekday Monday through Sunday.
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "momentum-planner-"));
process.env.DATA_DIR = directory;
const {
  db,
  id,
  now,
  createWorkspace,
  ensureDailyPlan,
  ensurePersonalPlan,
  markPersonalOwner,
  reconcilePersonalWorkspace,
  isPersonalOwner,
} = await import("../server/db");
const { PERSONAL_ROUTINE, PUBLISHING_CALENDAR, OBSOLETE_TITLES, JOB_BATCH_TITLES } =
  await import("../server/personalPlan");

async function cleanOwner(userId: string) {
  await createWorkspace(
    userId,
    `${userId}@example.com`,
    "test-password-hash",
    "Clean Owner",
  );
}
async function personalOwner(userId: string) {
  await cleanOwner(userId);
  await markPersonalOwner(userId);
  await ensurePersonalPlan(userId);
}
async function titles(userId: string, day: string): Promise<string[]> {
  const rows = (await db
    .prepare(
      "SELECT title FROM tasks WHERE user_id=? AND due_date=? ORDER BY sort_order",
    )
    .all(userId, day)) as Array<{ title: string }>;
  return rows.map((row) => row.title);
}
const day = (n: number) =>
  new Date(`2026-11-0${n}T12:00:00.000Z`);

afterAll(async () => {
  await db.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("workspace isolation", () => {
  it("gives new accounts a clean workspace with no personal plan", async () => {
    await cleanOwner("clean-owner");
    expect(await isPersonalOwner("clean-owner")).toBe(false);
    const settings = (await db
      .prepare("SELECT auto_plan,daily_templates FROM settings WHERE user_id=?")
      .get("clean-owner")) as { auto_plan: number; daily_templates: string };
    expect(settings.auto_plan).toBe(0);
    expect(JSON.parse(settings.daily_templates)).toEqual([]);
    const cycles = (await db
      .prepare("SELECT sales_target,revenue_target FROM cycles WHERE user_id=?")
      .all("clean-owner")) as Array<{
      sales_target: number;
      revenue_target: number;
    }>;
    expect(cycles[0]).toMatchObject({ sales_target: 0, revenue_target: 0 });
    await ensureDailyPlan("clean-owner", day(2));
    expect(await titles("clean-owner", "2026-11-02")).toEqual([]);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM monthly_goals WHERE user_id=?").get("clean-owner")).toMatchObject({ count: 0 });
  });

  it("never injects the personal routine into an unrelated account", async () => {
    await cleanOwner("own-routine");
    await db
      .prepare("UPDATE settings SET daily_templates=?,auto_plan=1 WHERE user_id=?")
      .run(
        JSON.stringify([
          { title: "My own recurring task", category: "Personal", priority: "high", estimated_minutes: 15 },
        ]),
        "own-routine",
      );
    await ensureDailyPlan("own-routine", day(2));
    expect(await titles("own-routine", "2026-11-02")).toEqual([
      "My own recurring task",
    ]);
  });

  it("scopes five monthly goals and the November weekly goals to one owner", async () => {
    await personalOwner("chisom-owner");
    await cleanOwner("other-owner");
    expect(await isPersonalOwner("chisom-owner")).toBe(true);
    expect(await isPersonalOwner("other-owner")).toBe(false);
    const monthly = (await db
      .prepare("SELECT title,target FROM monthly_goals WHERE user_id=?")
      .all("chisom-owner")) as Array<{ title: string; target: number }>;
    expect(monthly).toHaveLength(5);
    expect(monthly.map((m) => m.title)).toEqual(
      expect.arrayContaining([
        "Graphic Design with AI course",
        "Next Chapter",
        "Cartridge",
        "Personal brand and creative development",
        "Client acquisition",
      ]),
    );
    const weekly = (await db
      .prepare("SELECT outcome,target,source FROM weekly_goals WHERE user_id=? AND week_start=?")
      .all("chisom-owner", "2026-11-02")) as Array<{
      outcome: string;
      target: number;
      source: string;
    }>;
    expect(weekly).toHaveLength(11);
    expect(weekly.find((g) => g.outcome === "Sell Graphic Design with AI")).toMatchObject({
      target: 17,
      source: "sales",
    });
    // Sales and publishing are record-backed, never task-checkbox backed.
    expect(weekly.find((g) => g.outcome === "Publish every day")?.source).toBe("publishing");
    expect(
      (await db.prepare("SELECT COUNT(*) AS count FROM monthly_goals WHERE user_id=?").get("other-owner")),
    ).toMatchObject({ count: 0 });
    // Idempotent.
    await ensurePersonalPlan("chisom-owner");
    expect(
      (await db.prepare("SELECT COUNT(*) AS count FROM monthly_goals WHERE user_id=?").get("chisom-owner")),
    ).toMatchObject({ count: 5 });
  });
});

describe("Monday–Sunday personal publishing calendar", () => {
  const days = [2, 3, 4, 5, 6, 7, 8];

  it("shows the correct day-specific assignment on every weekday and no obsolete work", async () => {
    const userId = "week-owner";
    await personalOwner(userId);
    for (const n of days) {
      await ensureDailyPlan(userId, new Date(`2026-11-0${n}T12:00:00.000Z`));
    }
    const expected: Record<number, string> = {
      2: "Publish Monday's selected post",
      3: "Publish Carousel 1 and distribute it",
      4: "Publish Brand Identity Project 1 reveal/content",
      5: "Publish Carousel 2",
      6: "Publish Next Chapter content",
      7: "Publish Brand Identity Project 2's second installment",
      8: "Publish Creative Studio Project 2 output",
    };
    for (const n of days) {
      const date = `2026-11-0${n}`;
      const list = await titles(userId, date);
      expect(list.length, `day ${date} has tasks`).toBeGreaterThan(0);
      expect(list, `day ${date} publishing`).toContain(expected[n]);
      for (const routine of PERSONAL_ROUTINE)
        expect(list, `day ${date} routine`).toContain(routine.title);
      for (const obsolete of OBSOLETE_TITLES)
        expect(list, `day ${date} no obsolete task`).not.toContain(obsolete);
      expect(list.some((t) => /5 AM batch|6 AM LinkedIn batch|8 AM batch/.test(t))).toBe(false);
      expect(list.some((t) => /Research 20 businesses|Research 10 new\/emerging/.test(t))).toBe(false);
      // A task never appears twice just because it serves more than one goal.
      expect(new Set(list).size).toBe(list.length);
    }
    // Fixed publishing calendar is day-aware, not a generic publishing item.
    const mon = await titles(userId, "2026-11-02");
    expect(mon).not.toContain("Publish Carousel 1 and distribute it");
    expect(mon).not.toContain("Publish one useful piece of content today on Instagram and/or WhatsApp");
    const thu = await titles(userId, "2026-11-05");
    expect(thu).toContain("Publish the YouTube tutorial");
    expect(thu).toContain("Distribute the YouTube tutorial");
    const sun = await titles(userId, "2026-11-08");
    expect(sun).toContain("Write the weekly review: wins, lessons, blockers and unfinished work");
    expect(sun).toContain("Plan the coming week and set next week's priorities");
    expect(sun).toContain("Review weekly course sales against the 17-sale target");
    // Four distinct project tracks, never a generic "Creative Project 1".
    expect(sun.some((t) => /Creative Project 1/.test(t))).toBe(false);
    expect(PUBLISHING_CALENDAR[1]).toContain("Monday's selected post");
  });

  it("links daily deliverables to the correct weekly goals without double counting", async () => {
    const userId = "linked-owner";
    await personalOwner(userId);
    await ensureDailyPlan(userId, day(2));
    const linked = (await db
      .prepare(
        `SELECT t.title, w.outcome FROM tasks t JOIN weekly_goals w ON w.id=t.weekly_goal_id
         WHERE t.user_id=? AND t.due_date=?`,
      )
      .all(userId, "2026-11-02")) as Array<{ title: string; outcome: string }>;
    expect(linked.length).toBeGreaterThan(0);
    const outreach = linked.filter((row) =>
      row.outcome.includes("20 client outreach"),
    );
    expect(outreach.length).toBe(3);
    expect(
      linked.some(
        (row) =>
          row.title.includes("Research and contact 3 promotional partners") &&
          row.outcome.includes("promotional partners"),
      ),
    ).toBe(true);
    expect(
      linked.some((row) => row.title.includes("Publish Monday's selected post") && row.outcome === "Publish every day"),
    ).toBe(true);
  });

  it("cancels obsolete TODO work but preserves completed history and is idempotent", async () => {
    const userId = "reconcile-owner";
    await personalOwner(userId);
    const stamp = now();
    for (const title of JOB_BATCH_TITLES) {
      await db
        .prepare(
          `INSERT INTO tasks(id,user_id,title,category,priority,status,due_date,created_at,updated_at)
           VALUES (?,?,?,'Client Pipeline','high','todo','2026-11-02',?,?)`,
        )
        .run(id(), userId, title, stamp, stamp);
    }
    const completedId = id();
    await db
      .prepare(
        `INSERT INTO tasks(id,user_id,title,category,priority,status,due_date,created_at,updated_at)
         VALUES (?,?,?,'Personal','low','done','2026-11-01',?,?)`,
      )
      .run(completedId, userId, "Historical completed work", stamp, stamp);

    const first = await reconcilePersonalWorkspace(userId);
    expect(first.cancelled).toBe(3);
    expect(
      (await db.prepare("SELECT status FROM tasks WHERE id=?").get(completedId)),
    ).toMatchObject({ status: "done" });
    expect(
      (await db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND status='cancelled'").get(userId)),
    ).toMatchObject({ count: 3 });
    const second = await reconcilePersonalWorkspace(userId);
    expect(second.cancelled).toBe(0);
    expect(second.added).toBe(0);
  });
});

describe("unchanged planner behaviour", () => {
  it("creates a seven-day guest confirmation reminder once", async () => {
    await personalOwner("guest-owner");
    const stamp = now(),
      sessionId = id();
    await db
      .prepare(
        `INSERT INTO chapter_sessions(id,user_id,title,guest,session_date,session_time,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'16:00','Planning',?,?)`,
      )
      .run(sessionId, "guest-owner", "Next Chapter: Creative Work", "Guest Speaker", "2026-11-09", stamp, stamp);
    await ensureDailyPlan("guest-owner", day(2));
    const reminder = (await db
      .prepare("SELECT title,due_date,session_id FROM tasks WHERE user_id=? AND session_id=?")
      .get("guest-owner", sessionId)) as { title: string; due_date: string; session_id: string };
    expect(reminder.title).toContain("Confirm next week's Next Chapter guest");
    expect(reminder.due_date).toBe("2026-11-02");
    await ensureDailyPlan("guest-owner", new Date("2026-11-02T13:00:00.000Z"));
    const count = (await db
      .prepare("SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND session_id=?")
      .get("guest-owner", sessionId)) as { count: number };
    expect(count.count).toBe(1);
  });

  it("leaves unfinished work untouched until the owner chooses to carry it", async () => {
    await cleanOwner("carry-owner");
    const stamp = now();
    const originalId = id();
    await db
      .prepare(
        `INSERT INTO tasks(id,user_id,title,category,priority,status,due_date,estimated_minutes,created_at,updated_at)
      VALUES (?,?,?,'Creative Studio','high','in_progress','2026-11-01',90,?,?)`,
      )
      .run(originalId, "carry-owner", "Finish campaign concept", stamp, stamp);
    await ensureDailyPlan("carry-owner", day(2));
    await ensureDailyPlan("carry-owner", new Date("2026-11-02T13:00:00.000Z"));
    expect(
      await db.prepare("SELECT status,due_date FROM tasks WHERE id=?").get(originalId),
    ).toMatchObject({ status: "in_progress", due_date: "2026-11-01" });
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND carried_from_id=?")
        .get("carry-owner", originalId),
    ).toMatchObject({ count: 0 });
  });
});
