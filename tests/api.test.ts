import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

type Result = { status: number; body: any; cookie: string | null };
let server: ChildProcess;
let directory: string;
let base: string;
let port: number;
let cookie = "";
let csrf = "";
let cycleId = "";
let productId = "";
let taskId = "";
let prospectId = "";
let sessionId = "";
async function request(
  method: string,
  path: string,
  body?: unknown,
  useCsrf = true,
): Promise<Result> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf && useCsrf && method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie"),
  };
}
async function freePort() {
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
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "momentum-test-"));
  port = await freePort();
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
  server.stdout?.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr?.on("data", (chunk) => {
    logs += chunk;
  });
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      if ((await fetch(`${base}/auth/status`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Test server failed to start: ${logs}`);
}, 20000);
afterAll(async () => {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) resolve(null);
      else server.once("exit", resolve);
    });
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("private persistent workspace API", () => {
  it("requires authentication and creates a single owner with November defaults", async () => {
    expect((await request("GET", "/bootstrap")).status).toBe(401);
    expect((await request("GET", "/auth/status")).body.needsSetup).toBe(true);
    const result = await request("POST", "/auth/register", {
      name: "Test Owner",
      email: "owner@example.com",
      password: "a-strong-test-password",
    });
    expect(result.status).toBe(200);
    cookie = result.cookie!.split(";")[0];
    csrf = result.body.csrfToken;
    const data = (await request("GET", "/bootstrap")).body;
    expect(data.cycles[0]).toMatchObject({
      month: "2026-11",
      sales_target: 68,
      revenue_target: 1013200,
      outreach_target: 20,
      session_day: 5,
    });
    expect(data.settings).toMatchObject({
      timezone: "Africa/Lagos",
      work_start: "08:00",
      work_end: "17:00",
      theme: "light",
    });
    expect(data.products[0]).toMatchObject({
      name: "Graphic Design with AI",
      price: 14900,
    });
    cycleId = data.cycles[0].id;
    productId = data.products[0].id;
    expect(
      (
        await request("POST", "/auth/register", {
          name: "Another",
          email: "another@example.com",
          password: "another-strong-password",
        })
      ).status,
    ).toBe(403);
    expect(
      (await request("PATCH", "/settings", { name: "No CSRF" }, false)).status,
    ).toBe(403);
  });
  it("validates and persists automatic or manual appearance", async () => {
    expect(
      (await request("PATCH", "/settings", { theme: "dark" })).body.theme,
    ).toBe("dark");
    expect((await request("GET", "/bootstrap")).body.settings.theme).toBe(
      "dark",
    );
    expect(
      (await request("PATCH", "/settings", { theme: "light" })).body.theme,
    ).toBe("light");
    expect(
      (await request("PATCH", "/settings", { theme: "invalid" })).status,
    ).toBe(400);
    expect(
      (await request("PATCH", "/settings", { theme: "system" })).body.theme,
    ).toBe("system");
  });
  it("persists tasks and only counts confirmed paid transactions", async () => {
    let result = await request("POST", "/tasks", {
      cycle_id: cycleId,
      title: "Finish a real task",
      due_date: "2026-11-05",
      priority: "high",
    });
    expect(result.status).toBe(201);
    taskId = result.body.id;
    const pending = await request("POST", "/sales", {
      cycle_id: cycleId,
      product_id: productId,
      amount: 14900,
      sale_date: "2026-11-05",
      status: "pending",
    });
    const paid = await request("POST", "/sales", {
      cycle_id: cycleId,
      product_id: productId,
      amount: 14900,
      sale_date: "2026-11-05",
      status: "paid",
    });
    expect(pending.status).toBe(201);
    expect(paid.status).toBe(201);
    let data = (await request("GET", "/bootstrap")).body;
    expect(data.sales.filter((s: any) => s.status === "paid")).toHaveLength(1);
    expect(
      data.sales
        .filter((s: any) => s.status === "paid")
        .reduce((sum: number, s: any) => sum + s.amount, 0),
    ).toBe(14900);
    expect(
      (await request("PATCH", `/sales/${paid.body.id}`, { status: "refunded" }))
        .status,
    ).toBe(200);
    data = (await request("GET", "/bootstrap")).body;
    expect(data.sales.filter((s: any) => s.status === "paid")).toHaveLength(0);
    expect(
      (
        await request("POST", "/sales", {
          cycle_id: cycleId,
          amount: 100,
          sale_date: "2026-12-01",
          status: "paid",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("POST", "/sales", {
          cycle_id: cycleId,
          amount: 0,
          sale_date: "2026-11-05",
          status: "paid",
        })
      ).status,
    ).toBe(400);
  });
  it("records research separately from actual outreach and validates relationships", async () => {
    const prospect = await request("POST", "/prospects", {
      company: "A real prospect",
      researched_at: "2026-11-05",
    });
    expect(prospect.status).toBe(201);
    prospectId = prospect.body.id;
    let data = (await request("GET", "/bootstrap")).body;
    expect(data.prospects).toHaveLength(1);
    expect(data.interactions).toHaveLength(0);
    const interaction = await request("POST", "/interactions", {
      prospect_id: prospectId,
      kind: "outreach",
      channel: "Email",
      occurred_date: "2026-11-05",
    });
    expect(interaction.status).toBe(201);
    expect(
      (
        await request("POST", "/interactions", {
          prospect_id: "11111111-1111-4111-8111-111111111111",
          occurred_date: "2026-11-05",
        })
      ).status,
    ).toBe(400);
  });
  it("links projects and sessions to content, and requires human editorial approval", async () => {
    const project = await request("POST", "/projects", {
      cycle_id: cycleId,
      title: "Campaign project",
      stage: "Brief",
    });
    expect(project.status).toBe(201);
    const done = await request("PATCH", `/projects/${project.body.id}`, {
      stage: "Completed",
    });
    expect(done.body.completed_at).toBeTruthy();
    const session = await request("POST", "/chapter_sessions", {
      cycle_id: cycleId,
      title: "Future of creativity",
      session_date: "2026-11-06",
    });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
    let data = (await request("GET", "/bootstrap")).body;
    expect(
      data.session_checklists.filter((c: any) => c.session_id === sessionId),
    ).toHaveLength(9);
    const sessionTasks = data.tasks.filter((t: any) => t.session_id === sessionId);
    expect(sessionTasks).toHaveLength(4);
    expect(sessionTasks.some((task: any) => task.title.includes("Next Chapter"))).toBe(true);
    const rejected = await request("POST", "/content_items", {
      title: "AI session article",
      project_id: project.body.id,
      session_id: sessionId,
      ai_assisted: 1,
      status: "Published",
      human_approved: 0,
    });
    expect(rejected.status).toBe(400);
    const accepted = await request("POST", "/content_items", {
      title: "Reviewed article",
      project_id: project.body.id,
      session_id: sessionId,
      ai_assisted: 1,
      status: "Published",
      human_approved: 1,
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.project_id).toBe(project.body.id);
    expect(accepted.body.session_id).toBe(sessionId);
    expect(
      (
        await request("PATCH", `/content_items/${accepted.body.id}`, {
          body: "New unreviewed text",
        })
      ).status,
    ).toBe(400);
  });
  it("rolls over explicitly without deleting historical records", async () => {
    const result = await request("POST", "/cycles/rollover", {
      source_cycle_id: cycleId,
      month: "2026-12",
      theme: "New month",
      objective: "Continue",
      objectives: "Do the work",
      sales_target: 20,
      revenue_target: 200000,
      outreach_target: 10,
      projects_target: 1,
      chapter_content_target: 2,
      course_days: "2,3,5",
      session_day: 5,
      carry_tasks: true,
    });
    expect(result.status).toBe(201);
    const newId = result.body.id;
    const data = (await request("GET", "/bootstrap")).body;
    expect(data.cycles.find((c: any) => c.id === cycleId).status).toBe(
      "archived",
    );
    expect(data.cycles.find((c: any) => c.id === newId).status).toBe("active");
    expect(data.tasks.find((t: any) => t.id === taskId).status).toBe("carried");
    expect(
      data.tasks.some(
        (t: any) => t.carried_from_id === taskId && t.cycle_id === newId,
      ),
    ).toBe(true);
    expect(data.sales).toHaveLength(2);
    expect(data.prospects[0].id).toBe(prospectId);
    expect(data.chapter_sessions[0].id).toBe(sessionId);
    expect(
      (
        await request("POST", "/cycles/rollover", {
          source_cycle_id: cycleId,
          month: "2026-12",
          theme: "",
          objective: "",
          objectives: "",
          sales_target: 0,
          revenue_target: 0,
          outreach_target: 0,
          projects_target: 0,
          chapter_content_target: 0,
          course_days: "",
          session_day: 5,
          carry_tasks: false,
        })
      ).status,
    ).toBe(409);
    expect(
      (await request("PATCH", `/cycles/${cycleId}`, { month: "2027-01" }))
        .status,
    ).toBe(400);
  });
  it("saves daily and weekly reflections as dated records", async () => {
    const daily = await request("POST", "/daily_notes", {
      day: "2026-11-05",
      wins: "Finished a meaningful task",
      tomorrow: "Follow up",
    });
    expect(daily.status).toBe(201);
    const weekly = await request("POST", "/weekly_reviews", {
      week_start: "2026-11-02",
      wins: "Made progress",
      priorities: "Continue the work",
    });
    expect(weekly.status).toBe(201);
    expect(
      (
        await request("PATCH", `/weekly_reviews/${weekly.body.id}`, {
          lessons: "Protect focus time",
        })
      ).status,
    ).toBe(200);
    expect(
      (await request("POST", "/weekly_reviews", { week_start: "2026-11-02" }))
        .status,
    ).toBe(409);
    const data = (await request("GET", "/bootstrap")).body;
    expect(data.daily_notes[0].wins).toBe("Finished a meaningful task");
    expect(data.weekly_reviews[0].lessons).toBe("Protect focus time");
  });

  it("retains records through logout and sign-in and exports no credentials", async () => {
    const exported = await request("GET", "/export");
    expect(exported.body.format).toBe("momentum-os-export");
    expect(JSON.stringify(exported.body)).not.toContain("password_hash");
    expect((await request("POST", "/auth/logout")).status).toBe(200);
    cookie = "";
    csrf = "";
    expect((await request("GET", "/bootstrap")).status).toBe(401);
    const login = await request("POST", "/auth/login", {
      email: "owner@example.com",
      password: "a-strong-test-password",
    });
    expect(login.status).toBe(200);
    cookie = login.cookie!.split(";")[0];
    csrf = login.body.csrfToken;
    let data = (await request("GET", "/bootstrap")).body;
    expect(data.cycles).toHaveLength(2);
    expect(data.sales).toHaveLength(2);
    expect(data.prospects).toHaveLength(1);
    expect(
      (await request("PATCH", "/settings", { theme: "dark" })).status,
    ).toBe(200);
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
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
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${base}/auth/status`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(ready).toBe(true);
    data = (await request("GET", "/bootstrap")).body;
    expect(data.cycles).toHaveLength(2);
    expect(data.sales).toHaveLength(2);
    expect(data.prospects).toHaveLength(1);
    expect(data.settings.theme).toBe("dark");
  });
});
