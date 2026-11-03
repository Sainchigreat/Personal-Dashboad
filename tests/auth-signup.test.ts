// Brief §3F: authentication and multi-user workspace verification.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

const directory = mkdtempSync(join(tmpdir(), "momentum-signup-"));
let server: ChildProcess;
let base = "";

type Client = { cookie: string; csrf: string };
const anonymous = (): Client => ({ cookie: "", csrf: "" });

async function freePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const listener = createServer();
    listener.on("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() =>
        resolve(typeof address === "object" && address ? address.port : 0),
      );
    });
  });
}

async function request(
  client: Client,
  method: string,
  path: string,
  body?: unknown,
  useCsrf = true,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(client.cookie ? { Cookie: client.cookie } : {}),
      ...(client.csrf && useCsrf && method !== "GET"
        ? { "X-CSRF-Token": client.csrf }
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

async function register(client: Client, name: string, email: string, password: string) {
  const result = await request(client, "POST", "/auth/register", {
    name,
    email,
    password,
  });
  if (result.status === 200) {
    client.cookie = result.cookie!.split(";")[0];
    client.csrf = result.body.csrfToken;
  }
  return result;
}
async function login(client: Client, email: string, password: string) {
  const result = await request(client, "POST", "/auth/login", { email, password });
  if (result.status === 200) {
    client.cookie = result.cookie!.split(";")[0];
    client.csrf = result.body.csrfToken;
  }
  return result;
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
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!(await fetch(`${base}/auth/status`).catch(() => null)))
    throw new Error(`Signup test server failed to start: ${logs}`);
}, 30000);

afterAll(async () => {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) resolve(null);
      else server.once("exit", resolve);
    });
  }
  rmSync(directory, { recursive: true, force: true });
});

describe("platform-wide authentication", () => {
  const alice = anonymous();
  const bob = anonymous();

  it("1. shows both Create account and Sign in options to every visitor", () => {
    const source = readFileSync(
      join(process.cwd(), "src/pages/Auth.tsx"),
      "utf8",
    );
    expect(source).toContain("Create account");
    expect(source).toContain("Sign in");
    expect(source).toContain('role="tablist"');
    expect(source).toContain('status.needsSetup ? "signup" : "signin"');
    expect(source).toContain('name="name"');
    expect(source).toContain("minLength={signingUp ? 12 : undefined}");
    const css = readFileSync(
      join(process.cwd(), "src/styles/auth.css"),
      "utf8",
    );
    expect(css).toContain(".auth-tabs");
    expect(css).toContain("@media(max-width:680px)");
  });

  it("2. lets a new visitor create an account", async () => {
    expect((await request(anonymous(), "GET", "/auth/status")).body.needsSetup).toBe(true);
    const created = await register(alice, "Alice", "alice@example.com", "a-strong-test-password");
    expect(created.status).toBe(200);
    expect(created.body.csrfToken).toBeTruthy();
  });

  it("3. gives the new account an independent, clean workspace", async () => {
    const data = (await request(alice, "GET", "/bootstrap")).body;
    expect(data.settings.name).toBe("Alice");
    expect(data.cycles).toHaveLength(1);
    expect(data.cycles[0]).toMatchObject({ sales_target: 0, revenue_target: 0 });
    expect(data.products).toEqual([]);
    expect(data.monthly_goals).toEqual([]);
    expect(data.weekly_goals).toEqual([]);
    expect(data.tasks).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("Graphic Design with AI");
    expect(JSON.stringify(data)).not.toContain("5 AM batch");
  });

  it("4/5. lets a returning user switch to Sign in and authenticate", async () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Auth.tsx"), "utf8");
    expect(source).toContain('switchMode("signin")');
    expect(source).toContain('signingUp ? "/auth/register" : "/auth/login"');
    const returning = anonymous();
    const result = await login(returning, "alice@example.com", "a-strong-test-password");
    expect(result.status).toBe(200);
    const status = (await request(returning, "GET", "/auth/status")).body;
    expect(status.authenticated).toBe(true);
    expect(status.email).toBe("alice@example.com");
  });

  it("6. rejects duplicate email registration with an appropriate message", async () => {
    const duplicate = await register(
      anonymous(),
      "Alice Again",
      "alice@example.com",
      "another-strong-password",
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/already has an account/i);
    // Original account is untouched.
    expect((await login(anonymous(), "alice@example.com", "a-strong-test-password")).status).toBe(200);
  });

  it("8. isolates private goals and tasks between two accounts", async () => {
    const created = await register(bob, "Bob", "bob@example.com", "bobs-strong-password");
    expect(created.status).toBe(200);
    const goal = await request(alice, "POST", "/monthly_goals", {
      title: "Alice private goal",
      target: 3,
      source: "manual",
    });
    expect(goal.status).toBe(201);
    const task = await request(alice, "POST", "/tasks", {
      title: "Alice private task",
      priority: "high",
    });
    expect(task.status).toBe(201);

    const bobData = (await request(bob, "GET", "/bootstrap")).body;
    expect(bobData.monthly_goals).toEqual([]);
    expect(bobData.tasks).toEqual([]);
    expect(JSON.stringify(bobData)).not.toContain("Alice private");
    expect((await request(bob, "PATCH", `/monthly_goals/${goal.body.id}`, { title: "stolen" })).status).toBe(404);
    expect((await request(bob, "PATCH", `/tasks/${task.body.id}`, { title: "stolen" })).status).toBe(404);

    const aliceData = (await request(alice, "GET", "/bootstrap")).body;
    expect(aliceData.monthly_goals).toHaveLength(1);
    expect(aliceData.tasks).toHaveLength(1);
  });

  it("7. preserves invitation acceptance", async () => {
    const invite = await request(alice, "POST", "/team/invites", {
      email: "invited@example.com",
      role: "member",
    });
    expect(invite.status).toBe(201);
    const invited = anonymous();
    const joined = await request(invited, "POST", "/auth/register", {
      name: "Invited",
      email: "invited@example.com",
      password: "invited-strong-password",
      inviteToken: invite.body.token,
    });
    expect(joined.status).toBe(200);
    invited.cookie = joined.cookie!.split(";")[0];
    invited.csrf = joined.body.csrfToken;
    expect((await request(invited, "GET", "/bootstrap")).status).toBe(403);
    expect((await request(invited, "GET", "/team/bootstrap")).status).toBe(200);
  });

  it("9. logging out and back in preserves the correct user's data", async () => {
    const fresh = anonymous();
    expect((await login(fresh, "alice@example.com", "a-strong-test-password")).status).toBe(200);
    const before = (await request(fresh, "GET", "/bootstrap")).body;
    expect((await request(fresh, "POST", "/auth/logout", {})).status).toBe(200);
    expect((await request(fresh, "GET", "/bootstrap")).status).toBe(401);
    expect((await login(fresh, "alice@example.com", "a-strong-test-password")).status).toBe(200);
    const after = (await request(fresh, "GET", "/bootstrap")).body;
    expect(after.monthly_goals).toHaveLength(before.monthly_goals.length);
    expect(after.tasks).toHaveLength(before.tasks.length);
    expect(after.monthly_goals[0].title).toBe("Alice private goal");
    expect((await request(fresh, "GET", "/auth/status")).body.email).toBe("alice@example.com");
  });
});
