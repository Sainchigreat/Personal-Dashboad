// End-to-end acceptance test for the async PostgreSQL conversion.
// `pg` is mocked with a real PostgreSQL engine (PGlite, WASM, no network) so
// the actual Express routes, SQL translation, transactions and persistence are
// exercised against PostgreSQL semantics rather than SQLite.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({ engine: null as any }));

vi.mock("pg", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const engine = new PGlite();
  const ddl = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261102000400_momentum_os_compat.sql",
    ),
    "utf8",
  )
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/comment on schema[\s\S]*?;\s*$/i, "");
  const goalDdl = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261102000500_goal_hierarchy.sql",
    ),
    "utf8",
  )
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  await engine.exec(ddl);
  await engine.exec(goalDdl);
  state.engine = engine;
  class Pool {
    async query(sql: string, params: unknown[] = []) {
      const result = await engine.query(sql, params as any[]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    }
    async connect() {
      return {
        query: (sql: string, params: unknown[] = []) => this.query(sql, params),
        release: () => undefined,
      };
    }
    on() {
      return this;
    }
    async end() {}
  }
  return { Pool, default: { Pool } };
});

type Result = { status: number; body: any; cookie: string | null };
let httpServer: Server;
let base = "";
let cookie = "";
let csrf = "";
let cycleId = "";
let taskId = "";

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
      ...(csrf && useCsrf && method !== "GET"
        ? { "X-CSRF-Token": csrf }
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

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const result = await state.engine.query(sql, params as any[]);
  return Number(result.rows[0].count);
}

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://pglite-acceptance";
  process.env.MOMENTUM_IMPORT_ONLY = "1";
  process.env.MOMENTUM_PREVIEW = "0";
  process.env.NODE_ENV = "test";
  const { app } = await import("../server/index");
  httpServer = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "0.0.0.0", () => resolve(listener));
  });
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  base = `http://127.0.0.1:${port}/api`;
}, 30000);

afterAll(async () => {
  if (httpServer)
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  const { db } = await import("../server/db");
  await db.close();
  if (state.engine) await state.engine.close();
});

describe("async Express API on PostgreSQL", () => {
  it("uses the momentum_os schema and starts with no users", async () => {
    const row = await state.engine.query(
      "select count(*)::int as count from momentum_os.users",
    );
    expect(row.rows[0].count).toBe(0);
    expect((await request("GET", "/auth/status")).body.needsSetup).toBe(true);
  });

  it("registers the owner and seeds defaults in one transaction", async () => {
    const result = await request("POST", "/auth/register", {
      name: "Postgres Owner",
      email: "owner@postgres.test",
      password: "a-strong-test-password",
    });
    expect(result.status).toBe(200);
    expect(result.body.csrfToken).toBeTruthy();
    cookie = result.cookie!.split(";")[0];
    csrf = result.body.csrfToken;
    expect(await count("select count(*)::int as count from momentum_os.users")).toBe(1);
    expect(await count("select count(*)::int as count from momentum_os.settings")).toBe(1);
    expect(await count("select count(*)::int as count from momentum_os.cycles")).toBe(1);
    expect(await count("select count(*)::int as count from momentum_os.products")).toBe(1);
    const sessions = await state.engine.query(
      "select token_hash, csrf_token, expires_at from momentum_os.auth_sessions",
    );
    expect(sessions.rows).toHaveLength(1);
  });

  it("rejects state-changing requests without the CSRF token", async () => {
    const result = await request("POST", "/tasks", { title: "No CSRF" }, false);
    expect(result.status).toBe(403);
  });

  it("generates an idempotent daily plan on bootstrap", async () => {
    const first = await request("GET", "/bootstrap");
    expect(first.status).toBe(200);
    cycleId = first.body.cycles[0].id;
    expect(first.body.cycles[0]).toMatchObject({
      month: "2026-11",
      sales_target: 68,
      revenue_target: 1013200,
      outreach_target: 20,
    });
    const afterFirst = await count(
      "select count(*)::int as count from momentum_os.tasks",
    );
    const generated = await count(
      "select count(*)::int as count from momentum_os.generated_days",
    );
    expect(generated).toBe(1);
    await request("GET", "/bootstrap");
    expect(
      await count("select count(*)::int as count from momentum_os.tasks"),
    ).toBe(afterFirst);
    expect(
      await count("select count(*)::int as count from momentum_os.generated_days"),
    ).toBe(1);
  });

  it("persists a write and reads it back on a separate request", async () => {
    const created = await request("POST", "/tasks", {
      cycle_id: cycleId,
      title: "Postgres round trip",
      category: "Personal",
      priority: "high",
    });
    expect(created.status).toBe(201);
    taskId = created.body.id;
    const data = (await request("GET", "/bootstrap")).body;
    expect(
      data.tasks.some((task: any) => task.id === taskId),
    ).toBe(true);
    expect(
      await count(
        "select count(*)::int as count from momentum_os.tasks where id=$1",
        [taskId],
      ),
    ).toBe(1);
  });

  it("creates Next Chapter checklists and tasks atomically", async () => {
    const session = await request("POST", "/chapter_sessions", {
      cycle_id: cycleId,
      title: "Future of creativity",
      session_date: "2026-11-06",
    });
    expect(session.status).toBe(201);
    expect(
      await count(
        "select count(*)::int as count from momentum_os.session_checklists where session_id=$1",
        [session.body.id],
      ),
    ).toBe(9);
    expect(
      await count(
        "select count(*)::int as count from momentum_os.tasks where session_id=$1",
        [session.body.id],
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it("rolls the cycle over atomically and carries eligible tasks once", async () => {
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
    expect(
      await count(
        "select count(*)::int as count from momentum_os.cycles where status='archived'",
      ),
    ).toBe(1);
    expect(
      await count(
        "select count(*)::int as count from momentum_os.cycles where month='2026-12'",
      ),
    ).toBe(1);
    const duplicate = await request("POST", "/cycles/rollover", {
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
    expect(duplicate.status).toBe(409);
  });

  it("exports without password hashes, session tokens or CSRF secrets", async () => {
    const exportResult = await request("GET", "/export");
    expect(exportResult.status).toBe(200);
    const json = JSON.stringify(exportResult.body);
    expect(json).not.toContain("password_hash");
    expect(json).not.toContain("token_hash");
    expect(json).not.toContain("csrf_token");
    expect(json).toContain("momentum-os-export");
  });

  it("isolates team-only accounts from owner personal APIs", async () => {
    const invite = await request("POST", "/team/invites", {
      email: "member@postgres.test",
      role: "member",
    });
    expect(invite.status).toBe(201);
    const teamRegister = await request("POST", "/auth/register", {
      name: "Team Member",
      email: "member@postgres.test",
      password: "a-strong-test-password",
      inviteToken: invite.body.token,
    });
    expect(teamRegister.status).toBe(200);
    const teamCookie = teamRegister.cookie!.split(";")[0];
    const teamCsrf = teamRegister.body.csrfToken;
    const teamBootstrap = await fetch(`${base}/team/bootstrap`, {
      headers: { Cookie: teamCookie },
    });
    expect(teamBootstrap.status).toBe(200);
    const personal = await fetch(`${base}/bootstrap`, {
      headers: { Cookie: teamCookie },
    });
    expect(personal.status).toBe(403);
    const teamUser = await state.engine.query(
      "select id from momentum_os.users where email=$1",
      ["member@postgres.test"],
    );
    expect(
      await count(
        "select count(*)::int as count from momentum_os.tasks where user_id=$1",
        [teamUser.rows[0].id],
      ),
    ).toBe(0);
  });

  it("keeps data after logout and a fresh sign-in", async () => {
    expect((await request("POST", "/auth/logout")).status).toBe(200);
    const login = await request("POST", "/auth/login", {
      email: "owner@postgres.test",
      password: "a-strong-test-password",
    });
    expect(login.status).toBe(200);
    cookie = login.cookie!.split(";")[0];
    csrf = login.body.csrfToken;
    const data = (await request("GET", "/bootstrap")).body;
    expect(data.tasks.some((task: any) => task.id === taskId)).toBe(true);
  });
});
