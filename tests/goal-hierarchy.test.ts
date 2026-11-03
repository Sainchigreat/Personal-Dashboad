// Acceptance tests for the additive goal hierarchy (blueprint §6, §7, §10).
// Exercises: additive schema, clean new accounts, owner-scoped generic API,
// no cross-account leakage, monthly->weekly->daily links, and an idempotent
// owner-only backfill that never touches another account or existing history.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import bcrypt from "bcryptjs";

const directory = mkdtempSync(join(tmpdir(), "momentum-goals-"));
process.env.DATA_DIR = directory;
const { db, createWorkspace, id } = await import("../server/db");

let server: ChildProcess;
let base = "";
let cookieA = "";
let csrfA = "";
let cookieB = "";
let csrfB = "";
let ownerA = "";
let ownerB = "";
let ownerC = "";

async function freePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const listener = createServer();
    listener.on("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      const port = typeof address === "object" && address ? address.port : 0;
      listener.close(() => resolve(port));
    });
  });
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  auth?: { cookie: string; csrf: string },
  useCsrf = true,
) {
  const active = auth || { cookie: cookieA, csrf: csrfA };
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(active.cookie ? { Cookie: active.cookie } : {}),
      ...(active.csrf && useCsrf && method !== "GET"
        ? { "X-CSRF-Token": active.csrf }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie"),
  };
}

async function countFor(table: string, owner: string): Promise<number> {
  const row = (await db
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id=?`)
    .get(owner)) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

beforeAll(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}/api`;
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: directory,
      NODE_ENV: "test",
      MOMENTUM_PREVIEW: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout?.on("data", (chunk) => (logs += chunk));
  server.stderr?.on("data", (chunk) => (logs += chunk));
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try {
      if ((await fetch(`${base}/auth/status`)).ok) break;
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!(await fetch(`${base}/auth/status`).catch(() => null)))
    throw new Error(`Test server failed to start: ${logs}`);

  const register = await request("POST", "/auth/register", {
    name: "Owner A",
    email: "owner-a@goals.test",
    password: "a-strong-test-password",
  });
  expect(register.status).toBe(200);
  cookieA = register.cookie!.split(";")[0];
  csrfA = register.body.csrfToken;

  const ownerARow = (await db
    .prepare("SELECT id FROM users WHERE email=?")
    .get("owner-a@goals.test")) as { id: string } | undefined;
  ownerA = ownerARow!.id;

  ownerB = id();
  await createWorkspace(
    ownerB,
    "owner-b@goals.test",
    bcrypt.hashSync("another-strong-password", 10),
    "Owner B",
  );
  const loginB = await request("POST", "/auth/login", {
    email: "owner-b@goals.test",
    password: "another-strong-password",
  });
  expect(loginB.status).toBe(200);
  cookieB = loginB.cookie!.split(";")[0];
  csrfB = loginB.body.csrfToken;

  ownerC = id();
  await createWorkspace(
    ownerC,
    "owner-c@goals.test",
    bcrypt.hashSync("third-strong-password", 10),
    "Owner C",
  );
}, 30000);

afterAll(async () => {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) resolve(null);
      else server.once("exit", resolve);
    });
  }
  await db.close().catch(() => undefined);
  rmSync(directory, { recursive: true, force: true });
});

const authB = () => ({ cookie: cookieB, csrf: csrfB });

describe("additive goal hierarchy", () => {
  it("adds the schema without removing anything and keeps new accounts clean", async () => {
    const columns = (await db.prepare("PRAGMA table_info(tasks)").all()) as Array<{
      name: string;
    }>;
    expect(columns.some((c) => c.name === "weekly_goal_id")).toBe(true);
    for (const table of ["monthly_goals", "weekly_goals", "goal_links"]) {
      const tables = (await db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table)) as { name: string } | undefined;
      expect(tables?.name).toBe(table);
    }
    // Fresh accounts (A, B, C) receive NO owner-specific goals or plan seed.
    for (const owner of [ownerA, ownerB, ownerC]) {
      expect(await countFor("monthly_goals", owner)).toBe(0);
      expect(await countFor("weekly_goals", owner)).toBe(0);
      expect(await countFor("weekly_reviews", owner)).toBe(0);
    }
    expect(await countFor("cycles", ownerC)).toBe(1);
  });

  it("scopes goal resources by owner and returns no data rather than leaking existence", async () => {
    const created = await request("POST", "/monthly_goals", {
      title: "Owner A private monthly goal",
      metric_type: "outcome",
      source: "manual",
      target: 5,
      unit: "outcomes",
    });
    expect(created.status).toBe(201);
    const goalId = created.body.id as string;
    expect(await countFor("monthly_goals", ownerA)).toBe(1);
    expect(await countFor("monthly_goals", ownerB)).toBe(0);

    const bootstrapB = await request("GET", "/bootstrap", undefined, authB());
    expect(bootstrapB.status).toBe(200);
    expect(bootstrapB.body.monthly_goals).toHaveLength(0);

    const patch = await request(
      "PATCH",
      `/monthly_goals/${goalId}`,
      { title: "stolen" },
      authB(),
    );
    expect(patch.status).toBe(404);
    const remove = await request(
      "DELETE",
      `/monthly_goals/${goalId}`,
      undefined,
      authB(),
    );
    expect(remove.status).toBe(404);
    const still = await request("GET", "/bootstrap");
    expect(still.body.monthly_goals).toHaveLength(1);
  });

  it("links monthly -> weekly -> daily and enforces referential integrity", async () => {
    const monthly = await request("POST", "/monthly_goals", {
      title: "Monthly outcome",
      source: "sales",
      target: 68,
      unit: "paid seats",
    });
    expect(monthly.status).toBe(201);
    const weekly = await request("POST", "/weekly_goals", {
      monthly_goal_id: monthly.body.id,
      week_start: "2026-11-02",
      week_end: "2026-11-08",
      outcome: "17 paid seats this week",
      target: 17,
      unit: "paid seats",
      source: "sales",
      visibility: "private",
    });
    expect(weekly.status).toBe(201);
    expect(weekly.body.monthly_goal_id).toBe(monthly.body.id);

    const task = await request("POST", "/tasks", {
      title: "Log a paid sale",
      weekly_goal_id: weekly.body.id,
      category: "Course Growth",
      priority: "high",
    });
    expect(task.status).toBe(201);
    expect(task.body.weekly_goal_id).toBe(weekly.body.id);
    expect(task.body.status).toBe("todo");

    // Invalid references are rejected server-side.
    const invalid = await request("POST", "/tasks", {
      title: "Bad link",
      weekly_goal_id: id(),
    });
    expect(invalid.status).toBe(400);

    // Record-backed goals must never be driven by task completion.
    const stored = (await db
      .prepare("SELECT source, target FROM weekly_goals WHERE id=?")
      .get(weekly.body.id)) as { source: string; target: number };
    expect(stored.source).toBe("sales");
    expect(stored.target).toBe(17);
  });

  it("backfills only the verified owner, idempotently, preserving history", async () => {
    const beforeTasks = await countFor("tasks", ownerC);
    const beforeCycles = await countFor("cycles", ownerC);
    const run = (apply: boolean) =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/backfill-goals.ts",
          "--owner-id",
          ownerC,
          ...(apply ? ["--apply"] : []),
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATA_DIR: directory, NODE_ENV: "test" },
          encoding: "utf8",
        },
      );

    const dry = run(false);
    expect(dry).toContain("DRY RUN (no writes)");
    expect(await countFor("monthly_goals", ownerC)).toBe(0);

    run(true);
    expect(await countFor("monthly_goals", ownerC)).toBe(3);
    expect(await countFor("weekly_goals", ownerC)).toBe(7);
    // 17 is a slice of 68, not an additional monthly target.
    const salesWeekly = (await db
      .prepare("SELECT target, source FROM weekly_goals WHERE user_id=? AND outcome=?")
      .get(ownerC, "Sell Graphic Design with AI")) as {
      target: number;
      source: string;
    };
    expect(salesWeekly.target).toBe(17);
    expect(salesWeekly.source).toBe("sales");
    const salesMonthly = (await db
      .prepare("SELECT target FROM monthly_goals WHERE user_id=? AND title=?")
      .get(ownerC, "Sell 68 paid course seats")) as { target: number };
    expect(salesMonthly.target).toBe(68);

    const second = run(true);
    expect(second).toContain("Planned inserts:  0");
    expect(await countFor("monthly_goals", ownerC)).toBe(3);
    expect(await countFor("weekly_goals", ownerC)).toBe(7);
    expect(await countFor("tasks", ownerC)).toBe(beforeTasks);
    expect(await countFor("cycles", ownerC)).toBe(beforeCycles);

    // Other accounts are untouched by the owner-only backfill.
    expect(await countFor("monthly_goals", ownerB)).toBe(0);
    expect(await countFor("weekly_goals", ownerB)).toBe(0);
    expect(await countFor("monthly_goals", ownerA)).toBe(2);
  });

  it("starts new accounts with onboarding pending and no owner-specific seed", async () => {
    for (const owner of [ownerA, ownerB, ownerC]) {
      const settings = (await db
        .prepare(
          "SELECT onboarding_completed, onboarding_profile, timezone FROM settings WHERE user_id=?",
        )
        .get(owner)) as {
        onboarding_completed: number;
        onboarding_profile: string;
        timezone: string;
      };
      expect(settings.onboarding_completed).toBe(0);
      expect(settings.onboarding_profile).toBe("{}");
      expect(settings.timezone).toBe("Africa/Lagos");
    }
  });

  it("completes onboarding for one account without changing another", async () => {
    const save = await request("PATCH", "/settings", {
      timezone: "Africa/Lagos",
      work_start: "09:00",
      work_end: "18:00",
      onboarding_completed: 1,
      onboarding_profile: JSON.stringify({
        role: "business",
        useCase: "Launch a course",
        workingDays: "1,2,3,4,5",
        focusAreas: ["Course growth"],
        configuredAt: "2026-11-02T00:00:00.000Z",
      }),
    });
    expect(save.status).toBe(200);
    const mine = (await db
      .prepare("SELECT onboarding_completed, onboarding_profile FROM settings WHERE user_id=?")
      .get(ownerA)) as { onboarding_completed: number; onboarding_profile: string };
    expect(mine.onboarding_completed).toBe(1);
    expect(JSON.parse(mine.onboarding_profile).role).toBe("business");

    const other = (await db
      .prepare("SELECT onboarding_completed FROM settings WHERE user_id=?")
      .get(ownerB)) as { onboarding_completed: number };
    expect(other.onboarding_completed).toBe(0);

    // Reopen from Settings (skippable and returnable).
    const reopen = await request("PATCH", "/settings", { onboarding_completed: 0 });
    expect(reopen.status).toBe(200);
    const reopened = (await db
      .prepare("SELECT onboarding_completed FROM settings WHERE user_id=?")
      .get(ownerA)) as { onboarding_completed: number };
    expect(reopened.onboarding_completed).toBe(0);
  });

  it("keeps the Next Chapter speaker register owner-scoped and separate from course partners", async () => {
    const created = await request("POST", "/speakers", {
      name: "Guest Speaker",
      topic: "Designing with AI",
      invitation_status: "invited",
      confirmation_status: "pending",
    });
    expect(created.status).toBe(201);
    const speakerId = created.body.id as string;

    const followup = await request("POST", "/speaker_followups", {
      speaker_id: speakerId,
      occurred_date: "2026-11-02",
      channel: "email",
      summary: "Invitation sent; awaiting response.",
    });
    expect(followup.status).toBe(201);

    const bootstrapB = await request("GET", "/bootstrap", undefined, authB());
    expect(bootstrapB.body.speakers).toHaveLength(0);
    expect(bootstrapB.body.speaker_followups).toHaveLength(0);

    const cross = await request(
      "PATCH",
      `/speakers/${speakerId}`,
      { name: "stolen" },
      authB(),
    );
    expect(cross.status).toBe(404);

    const mine = await request("GET", "/bootstrap");
    expect(mine.body.speakers).toHaveLength(1);
    expect(mine.body.speaker_followups).toHaveLength(1);

    // Promotional partners remain a Course Growth daily-routine concept, not
    // speaker records: no speaker was auto-created from the November routine.
    expect(
      mine.body.speakers.every(
        (speaker: { name: string }) => !speaker.name.toLowerCase().includes("promotional partner"),
      ),
    ).toBe(true);
  });

  it("refuses to run without a verified owner id", () => {
    let failed = false;
    try {
      execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/backfill-goals.ts", "--apply"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATA_DIR: directory,
            NODE_ENV: "test",
            MOMENTUM_OWNER_ID: "",
          },
          encoding: "utf8",
        },
      );
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
