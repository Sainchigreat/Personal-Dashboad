// Verifies the Netlify Functions wrapper + routing as far as this sandbox can:
// real PostgreSQL engine via PGlite with `pg` mocked, so no network/secret is
// needed. Covers the fail-closed check, both redirect path shapes, /health,
// auth, write persistence and retrieval through the actual function handler.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

type InvokeResult = {
  status: number;
  headers: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body: any;
};
let handler: (event: any, context: any) => Promise<any>;
let normalizeEvent: (event: any) => any;
let cookie = "";
let csrf = "";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://netlify-function-acceptance";
  process.env.MOMENTUM_PREVIEW = "0";
  process.env.NODE_ENV = "test";
  process.env.MOMENTUM_IMPORT_ONLY = "1";
  const module = await import("../netlify/functions/api.ts");
  handler = module.handler;
  normalizeEvent = module.normalizeEvent;
}, 30000);

async function invoke(
  method: string,
  path: string,
  body?: unknown,
  options: { rewritten?: boolean; useCsrf?: boolean } = {},
): Promise<InvokeResult> {
  const rewritten = options.rewritten ?? false;
  const eventPath = rewritten
    ? `/.netlify/functions/api${path.slice("/api".length)}`
    : path;
  const result = await handler(
    {
      path: eventPath,
      rawUrl: `https://preview.netlify.app${path}`,
      httpMethod: method,
      headers: {
        host: "preview.netlify.app",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(csrf && options.useCsrf !== false && method !== "GET"
          ? { "x-csrf-token": csrf }
          : {}),
      },
      body: body === undefined ? null : JSON.stringify(body),
      isBase64Encoded: false,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      requestContext: {},
    },
    {},
  );
  return {
    status: result.statusCode,
    headers: result.headers || {},
    multiValueHeaders: result.multiValueHeaders || {},
    body: result.body ? JSON.parse(result.body) : null,
  };
}

describe("Netlify Functions wrapper", () => {
  it("normalises both redirect path shapes onto /api", () => {
    expect(normalizeEvent({ path: "/api/auth/status" }).path).toBe(
      "/api/auth/status",
    );
    expect(
      normalizeEvent({ path: "/.netlify/functions/api/auth/status" }).path,
    ).toBe("/api/auth/status");
    expect(normalizeEvent({ path: "/.netlify/functions/api" }).path).toBe(
      "/api",
    );
    expect(normalizeEvent({ path: "/api/bootstrap", body: null }).body).toBe("");
  });

  it("fails closed with 503 when DATABASE_URL is missing", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const result = await invoke("GET", "/api/auth/status");
      expect(result.status).toBe(503);
      expect(result.body.error).toContain("DATABASE_URL is not configured");
      expect(result.headers["Cache-Control"]).toBe("no-store");
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });

  it("has the correct build/routing configuration", () => {
    const toml = readFileSync(resolve(process.cwd(), "netlify.toml"), "utf8");
    expect(toml).toContain('publish = "dist"');
    expect(toml).toContain('functions = "netlify/functions"');
    expect(toml).toContain('command = "npm run build"');
    expect(toml).toContain('node_bundler = "esbuild"');
    expect(toml).toContain('to = "/.netlify/functions/api/:splat"');
    expect(toml.indexOf('from = "/api/*"')).toBeLessThan(
      toml.indexOf('to = "/index.html"'),
    );
  });

  it("reports a real database round trip through /api/pg/health", async () => {
    const result = await invoke("GET", "/api/pg/health");
    expect(result.status).toBe(200);
    expect(result.body.database).toBeTruthy();
    expect(result.body.roundTrip.id).toBe("api-pg-health");
    const rows = await state.engine.query(
      "select id from momentum_os.integration_checks where id=$1",
      ["api-pg-health"],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("serves /api/auth/status via the original rewrite path", async () => {
    const result = await invoke("GET", "/api/auth/status");
    expect(result.status).toBe(200);
    expect(result.body.needsSetup).toBe(true);
  });

  it("serves /api/auth/status via the rewritten function path", async () => {
    const result = await invoke("GET", "/api/auth/status", undefined, {
      rewritten: true,
    });
    expect(result.status).toBe(200);
    expect(result.body.needsSetup).toBe(true);
  });

  it("registers an owner, persists a record and retrieves it", async () => {
    const register = await invoke("POST", "/api/auth/register", {
      name: "Netlify Owner",
      email: "owner@netlify.test",
      password: "a-strong-test-password",
    });
    expect(register.status).toBe(200);
    expect(register.body.csrfToken).toBeTruthy();
    const setCookie =
      register.headers["set-cookie"] ||
      register.multiValueHeaders?.["set-cookie"]?.[0];
    expect(setCookie).toBeTruthy();
    cookie = String(setCookie).split(";")[0];
    csrf = register.body.csrfToken;

    const bootstrap = await invoke("GET", "/api/bootstrap", undefined, {
      rewritten: true,
    });
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.cycles[0].sales_target).toBe(0);

    const created = await invoke("POST", "/api/tasks", {
      cycle_id: bootstrap.body.cycles[0].id,
      title: "Netlify persistence check",
      category: "Personal",
      priority: "high",
    });
    expect(created.status).toBe(201);
    const taskId = created.body.id;

    const retrieved = await invoke("GET", "/api/bootstrap");
    expect(
      retrieved.body.tasks.some((task: any) => task.id === taskId),
    ).toBe(true);
    const rows = await state.engine.query(
      "select id, title from momentum_os.tasks where id=$1",
      [taskId],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("rejects a state-changing request without CSRF", async () => {
    const result = await invoke(
      "POST",
      "/api/tasks",
      { title: "Should be rejected" },
      { useCsrf: false },
    );
    expect(result.status).toBe(403);
  });
});
