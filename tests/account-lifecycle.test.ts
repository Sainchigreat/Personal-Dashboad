// Blueprint §5.2 / §10: invitation acceptance, member removal, leaving a
// team and safe account deletion. Cross-account isolation is enforced.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

const directory = mkdtempSync(join(tmpdir(), "momentum-lifecycle-"));
let server: ChildProcess;
let base = "";
let ownerCookie = "";
let ownerCsrf = "";

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

async function call(
  method: string,
  path: string,
  body?: unknown,
  auth: { cookie: string; csrf: string } | null = null,
) {
  const active = auth || { cookie: ownerCookie, csrf: ownerCsrf };
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(active.cookie ? { Cookie: active.cookie } : {}),
      ...(active.csrf && method !== "GET"
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

async function login(email: string, password: string) {
  const result = await call("POST", "/auth/login", { email, password }, {
    cookie: "",
    csrf: "",
  });
  expect(result.status).toBe(200);
  return {
    cookie: result.cookie!.split(";")[0],
    csrf: result.body.csrfToken as string,
  };
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
    throw new Error(`Test server failed to start: ${logs}`);

  const register = await call("POST", "/auth/register", {
    name: "Lifecycle Owner",
    email: "lifecycle-owner@test.local",
    password: "a-strong-test-password",
  });
  expect(register.status).toBe(200);
  ownerCookie = register.cookie!.split(";")[0];
  ownerCsrf = register.body.csrfToken;
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

describe("team lifecycle and account deletion", () => {
  it("invites a member, lets them leave, and lets the owner remove a member", async () => {
    const invite = await call("POST", "/team/invites", {
      email: "lifecycle-member@test.local",
      role: "member",
    });
    expect(invite.status).toBe(201);
    const joined = await call("POST", "/auth/register", {
      name: "Lifecycle Member",
      email: "lifecycle-member@test.local",
      password: "another-strong-password",
      inviteToken: invite.body.token,
    });
    expect(joined.status).toBe(200);
    const memberAuth = await login(
      "lifecycle-member@test.local",
      "another-strong-password",
    );

    // Personal APIs stay closed to team accounts.
    const personal = await call("GET", "/bootstrap", undefined, memberAuth);
    expect(personal.status).toBe(403);

    // Member leaves explicitly. Their session is no longer valid because
    // requireUser only admits team accounts with an active membership (401),
    // which is the correct "no access / no existence leak" outcome.
    const leave = await call("POST", "/team/leave", {}, memberAuth);
    expect(leave.status).toBe(200);
    const afterLeave = await call("GET", "/team/bootstrap", undefined, memberAuth);
    expect([401, 403]).toContain(afterLeave.status);

    // A fresh invite can be removed by the owner.
    const invite2 = await call("POST", "/team/invites", {
      email: "remove-me@test.local",
      role: "member",
    });
    expect(invite2.status).toBe(201);
    const joined2 = await call("POST", "/auth/register", {
      name: "Remove Me",
      email: "remove-me@test.local",
      password: "third-strong-password",
      inviteToken: invite2.body.token,
    });
    expect(joined2.status).toBe(200);
    const bootstrap = await call("GET", "/team/bootstrap");
    expect(bootstrap.status).toBe(200);
    const target = (bootstrap.body.members as Array<{ user_id: string; role: string }>).find(
      (m) => m.role === "member",
    );
    expect(target).toBeTruthy();
    const removed = await call("DELETE", `/team/members/${target!.user_id}`);
    expect(removed.status).toBe(200);
    const after = await call("GET", "/team/bootstrap");
    expect(
      (after.body.members as Array<{ user_id: string }>).some(
        (m) => m.user_id === target!.user_id,
      ),
    ).toBe(false);
  });

  it("refuses deletion without password / confirmation and when members remain", async () => {
    const wrongConfirm = await call("DELETE", "/account", {
      password: "a-strong-test-password",
      confirm: "delete",
    });
    expect(wrongConfirm.status).toBe(400);
    const wrongPassword = await call("DELETE", "/account", {
      password: "not-the-password",
      confirm: "DELETE MY ACCOUNT",
    });
    expect(wrongPassword.status).toBe(401);

    // Add an active member; deletion must be blocked rather than orphaning them.
    const invite = await call("POST", "/team/invites", {
      email: "blocking-member@test.local",
      role: "member",
    });
    expect(invite.status).toBe(201);
    const joined = await call("POST", "/auth/register", {
      name: "Blocking Member",
      email: "blocking-member@test.local",
      password: "fourth-strong-password",
      inviteToken: invite.body.token,
    });
    expect(joined.status).toBe(200);
    const blocked = await call("DELETE", "/account", {
      password: "a-strong-test-password",
      confirm: "DELETE MY ACCOUNT",
    });
    expect(blocked.status).toBe(409);

    // Removing that member unblocks deletion.
    const bootstrap = await call("GET", "/team/bootstrap");
    const target = (bootstrap.body.members as Array<{ user_id: string; role: string }>).find(
      (m) => m.role === "member",
    );
    expect(target).toBeTruthy();
    expect((await call("DELETE", `/team/members/${target!.user_id}`)).status).toBe(200);
  });

  it("deletes an isolated account and revokes its session", async () => {
    const deleted = await call("DELETE", "/account", {
      password: "a-strong-test-password",
      confirm: "DELETE MY ACCOUNT",
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(true);
    const status = await call("GET", "/auth/status");
    expect(status.body.authenticated).toBe(false);
    // Other invited accounts still exist, so needsSetup is not necessarily
    // true; what matters is that the deleted owner can no longer sign in.
    const relogin = await call("POST", "/auth/login", {
      email: "lifecycle-owner@test.local",
      password: "a-strong-test-password",
    }, { cookie: "", csrf: "" });
    expect(relogin.status).toBe(401);
    const bootstrap = await call("GET", "/bootstrap");
    expect(bootstrap.status).toBe(401);
  });
});
