import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

let server: ChildProcess;
let directory: string;
let base: string;
type Client = { cookie: string; csrf: string };
const anonymous = (): Client => ({ cookie: "", csrf: "" });
async function request(
  client: Client,
  method: string,
  path: string,
  body?: unknown,
  csrf = true,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(client.cookie ? { Cookie: client.cookie } : {}),
      ...(csrf && client.csrf && method !== "GET"
        ? { "X-CSRF-Token": client.csrf }
        : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie"),
  };
}
async function authenticate(
  client: Client,
  body: {
    name?: string;
    email: string;
    password: string;
    inviteToken?: string;
  },
  login = false,
) {
  const result = await request(
    client,
    "POST",
    login ? "/auth/login" : "/auth/register",
    body,
  );
  if (result.status === 200) {
    client.cookie = result.cookie!.split(";")[0];
    client.csrf = result.body.csrfToken;
  }
  return result;
}
async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const listener = createServer();
    listener.on("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      const value = typeof address === "object" && address ? address.port : 0;
      listener.close(() => resolve(value));
    });
  });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "momentum-team-"));
  base = `http://127.0.0.1:${await freePort()}/api`;
  const port = new URL(base).port;
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: port,
      DATA_DIR: directory,
      NODE_ENV: "test",
      MOMENTUM_PREVIEW: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${base}/auth/status`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Team test server failed to start.");
}, 20000);
afterAll(async () => {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) =>
      server.exitCode !== null ? resolve(null) : server.once("exit", resolve),
    );
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("integrated private team portals", () => {
  const owner = anonymous(),
    member = anonymous(),
    teammate = anonymous(),
    manager = anonymous();
  let memberId = "",
    teammateId = "",
    managerId = "",
    goalId = "",
    taskId = "",
    otherTaskId = "";

  it("creates a single owner and one shared workspace without exposing personal records", async () => {
    expect(
      (
        await authenticate(owner, {
          name: "Owner",
          email: "owner@example.com",
          password: "a-strong-owner-password",
        })
      ).status,
    ).toBe(200);
    const team = await request(owner, "GET", "/team/bootstrap");
    expect(team.status).toBe(200);
    expect(team.body.membership.role).toBe("owner");
    expect(team.body.goals).toEqual([]);
    expect(team.body.tasks).toEqual([]);
    expect(
      (await request(owner, "POST", "/tasks", { title: "Owner private task" }))
        .status,
    ).toBe(201);
    expect(
      (
        await request(
          owner,
          "POST",
          "/team/goals",
          { title: "No CSRF", target: 1 },
          false,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await authenticate(anonymous(), {
          name: "Uninvited",
          email: "other@example.com",
          password: "a-long-enough-password",
        })
      ).status,
    ).toBe(403);
  });

  it("issues single-use invitations bound to an email and creates team-only accounts", async () => {
    const invitation = await request(owner, "POST", "/team/invites", {
      email: "member@example.com",
      role: "member",
    });
    expect(invitation.status).toBe(201);
    expect(invitation.body.join_path).toContain(invitation.body.token);
    expect(
      (
        await authenticate(anonymous(), {
          name: "Wrong",
          email: "wrong@example.com",
          password: "a-long-enough-password",
          inviteToken: invitation.body.token,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await authenticate(member, {
          name: "Member One",
          email: "member@example.com",
          password: "a-long-enough-password",
          inviteToken: invitation.body.token,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await authenticate(anonymous(), {
          name: "Duplicate",
          email: "member@example.com",
          password: "a-long-enough-password",
          inviteToken: invitation.body.token,
        })
      ).status,
    ).toBe(403);
    expect(
      (await request(member, "GET", "/auth/status")).body.accountType,
    ).toBe("team");
    for (const path of ["/bootstrap", "/tasks", "/sales", "/export"])
      expect((await request(member, "GET", path)).status).toBe(403);
    expect(
      (await request(member, "PATCH", "/settings", { name: "Attack" })).status,
    ).toBe(403);
    const own = await request(member, "GET", "/team/bootstrap");
    memberId = own.body.membership.user_id;
    const database = new DatabaseSync(join(directory, "momentum.sqlite"));
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM cycles WHERE user_id=?")
        .get(memberId)?.count,
    ).toBe(0);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM tasks WHERE user_id=?")
        .get(memberId)?.count,
    ).toBe(0);
    database.close();
    expect(JSON.stringify(own.body)).not.toContain("Owner private task");
    expect(
      (
        await request(member, "POST", "/team/invites", {
          email: "bad@example.com",
          role: "member",
        })
      ).status,
    ).toBe(403);
    const next = await request(owner, "POST", "/team/invites", {
      email: "teammate@example.com",
      role: "member",
    });
    expect(
      (
        await authenticate(teammate, {
          name: "Member Two",
          email: "teammate@example.com",
          password: "a-long-enough-password",
          inviteToken: next.body.token,
        })
      ).status,
    ).toBe(200);
    teammateId = (await request(teammate, "GET", "/team/bootstrap")).body
      .membership.user_id;
    const managerInvite = await request(owner, "POST", "/team/invites", {
      email: "manager@example.com",
      role: "manager",
    });
    expect(
      (
        await authenticate(manager, {
          name: "Manager",
          email: "manager@example.com",
          password: "a-long-enough-password",
          inviteToken: managerInvite.body.token,
        })
      ).status,
    ).toBe(200);
    managerId = (await request(manager, "GET", "/team/bootstrap")).body
      .membership.user_id;
    expect(
      (
        await request(manager, "POST", "/team/invites", {
          email: "newmanager@example.com",
          role: "manager",
        })
      ).status,
    ).toBe(403);
    expect(
      (await request(member, "GET", "/team/bootstrap")).body.members.find(
        (m: any) => m.user_id === teammateId,
      ).email,
    ).toBeNull();
  });

  it("scopes goals and assignments, and enforces real submission and review", async () => {
    const goal = await request(owner, "POST", "/team/goals", {
      title: "Shared outcome",
      description: "Keep this description",
      target: 4,
      current: 1,
      unit: "deliverables",
      due_date: "2026-11-30",
    });
    expect(goal.status).toBe(201);
    goalId = goal.body.id;
    const partial = await request(owner, "PATCH", `/team/goals/${goalId}`, {
      current: 2,
    });
    expect(partial.body).toMatchObject({
      description: "Keep this description",
      target: 4,
      current: 2,
      unit: "deliverables",
      due_date: "2026-11-30",
    });
    expect(
      (
        await request(member, "POST", "/team/goals", {
          title: "Unauthorized",
          target: 2,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(owner, "POST", "/team/tasks", {
          title: "Bad reference",
          assignee_user_id: memberId,
          goal_id: "11111111-1111-4111-8111-111111111111",
        })
      ).status,
    ).toBe(400);
    const first = await request(owner, "POST", "/team/tasks", {
      title: "Write a shared draft",
      assignee_user_id: memberId,
      reviewer_user_id: managerId,
      goal_id: goalId,
      due_date: "2026-11-05",
    });
    expect(first.status).toBe(201);
    taskId = first.body.id;
    const second = await request(owner, "POST", "/team/tasks", {
      title: "Other person's work",
      assignee_user_id: teammateId,
    });
    expect(second.status).toBe(201);
    otherTaskId = second.body.id;
    expect(
      (
        await request(owner, "PATCH", `/team/tasks/${taskId}`, {
          due_date: "2026-11-06",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${taskId}`, {
          title: "Not authorized",
        })
      ).status,
    ).toBe(403);
    const ownerId = (await request(owner, "GET", "/team/bootstrap")).body
      .membership.user_id;
    expect(
      (
        await request(owner, "POST", "/team/tasks", {
          title: "No self-review",
          assignee_user_id: ownerId,
          reviewer_user_id: ownerId,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(owner, "POST", `/team/tasks/${otherTaskId}/comments`, {
          body: "A private comment about other work",
        })
      ).status,
    ).toBe(201);
    const visible = (await request(member, "GET", "/team/bootstrap")).body;
    expect(JSON.stringify(visible)).not.toContain(
      "A private comment about other work",
    );
    expect(visible.goals.map((g: any) => g.title)).toContain("Shared outcome");
    expect(visible.tasks.map((t: any) => t.title)).toEqual([
      "Write a shared draft",
    ]);
    expect(JSON.stringify(visible)).not.toContain("Other person's work");
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${otherTaskId}/status`, {
          status: "in_progress",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(member, "POST", `/team/tasks/${otherTaskId}/comments`, {
          body: "Not mine",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "approved",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "submitted",
          submission: "Finished",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "in_progress",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "submitted",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "submitted",
          submission: "Draft is ready for review",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(owner, "PATCH", `/team/tasks/${taskId}`, {
          title: "Changed after submission",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(manager, "PATCH", `/team/tasks/${taskId}`, {
          reviewer_user_id: ownerId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(owner, "PATCH", `/team/tasks/${taskId}`, {
          reviewer_user_id: ownerId,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(owner, "PATCH", `/team/tasks/${taskId}`, {
          reviewer_user_id: managerId,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(manager, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "revision_requested",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(manager, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "revision_requested",
          feedback: "Please clarify the introduction.",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(member, "POST", `/team/tasks/${taskId}/comments`, {
          body: "I will revise it.",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "in_progress",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(member, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "submitted",
          submission: "Revised draft",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(manager, "PATCH", `/team/tasks/${taskId}/status`, {
          status: "approved",
          feedback: "Reviewed.",
        })
      ).status,
    ).toBe(200);
    expect(
      (await request(owner, "GET", "/team/bootstrap")).body.goals[0].current,
    ).toBe(2);
    const exported = (await request(owner, "GET", "/export")).body;
    expect(exported.team.tasks.some((task: any) => task.id === taskId)).toBe(
      true,
    );
    expect(JSON.stringify(exported)).not.toContain("token_hash");
    expect(JSON.stringify(exported)).not.toContain("password_hash");
    const managerOwn = await request(owner, "POST", "/team/tasks", {
      title: "A manager's assignment",
      assignee_user_id: managerId,
      reviewer_user_id: ownerId,
    });
    expect(managerOwn.status).toBe(201);
    expect(
      (
        await request(
          manager,
          "PATCH",
          `/team/tasks/${managerOwn.body.id}/status`,
          { status: "in_progress" },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          manager,
          "PATCH",
          `/team/tasks/${managerOwn.body.id}/status`,
          { status: "submitted", submission: "Ready for the owner" },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          manager,
          "PATCH",
          `/team/tasks/${managerOwn.body.id}/status`,
          { status: "approved" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          owner,
          "PATCH",
          `/team/tasks/${managerOwn.body.id}/status`,
          { status: "approved" },
        )
      ).status,
    ).toBe(200);
    const privateData = (await request(owner, "GET", "/bootstrap")).body;
    expect(
      privateData.tasks.some((t: any) => t.title === "Owner private task"),
    ).toBe(true);
    expect(
      privateData.tasks.some((t: any) => t.title === "Write a shared draft"),
    ).toBe(false);
  });

  it("keeps invitation secrets hashed and rejects expired or revoked links", async () => {
    const reserved = await request(owner, "POST", "/team/invites", {
      email: "reserved@example.com",
      role: "manager",
    });
    expect(reserved.status).toBe(201);
    expect(
      (
        await request(manager, "POST", "/team/invites", {
          email: "reserved@example.com",
          role: "member",
        })
      ).status,
    ).toBe(403);
    const database = new DatabaseSync(join(directory, "momentum.sqlite"));
    const stored = database
      .prepare("SELECT token_hash FROM team_invites WHERE id=?")
      .get(reserved.body.id);
    expect(stored?.token_hash).not.toBe(reserved.body.token);
    expect(String(stored?.token_hash)).toHaveLength(64);
    database
      .prepare("UPDATE team_invites SET expires_at=? WHERE id=?")
      .run(Date.now() - 1000, reserved.body.id);
    database.close();
    expect(
      (
        await authenticate(anonymous(), {
          name: "Late",
          email: "reserved@example.com",
          password: "a-long-enough-password",
          inviteToken: reserved.body.token,
        })
      ).status,
    ).toBe(403);
    const revoked = await request(owner, "POST", "/team/invites", {
      email: "revoked@example.com",
      role: "member",
    });
    expect(
      (await request(owner, "DELETE", `/team/invites/${revoked.body.id}`))
        .status,
    ).toBe(200);
    expect(
      (
        await authenticate(anonymous(), {
          name: "Revoked",
          email: "revoked@example.com",
          password: "a-long-enough-password",
          inviteToken: revoked.body.token,
        })
      ).status,
    ).toBe(403);
  });

  it("enforces member access changes and revokes existing sessions", async () => {
    expect(
      (
        await request(manager, "PATCH", `/team/members/${managerId}`, {
          status: "suspended",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(owner, "PATCH", `/team/members/${memberId}`, {
          status: "suspended",
        })
      ).status,
    ).toBe(200);
    expect((await request(member, "GET", "/team/bootstrap")).status).toBe(401);
    expect(
      (
        await request(owner, "PATCH", `/team/members/${memberId}`, {
          status: "active",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await authenticate(
          member,
          { email: "member@example.com", password: "a-long-enough-password" },
          true,
        )
      ).status,
    ).toBe(200);
    const restored = (await request(member, "GET", "/team/bootstrap")).body;
    expect(restored.tasks[0]).toMatchObject({
      id: taskId,
      status: "approved",
      submission: "Revised draft",
    });
  });
  it("retains team work and sessions across a server restart", async () => {
    server.kill("SIGTERM");
    await new Promise((resolve) =>
      server.exitCode !== null ? resolve(null) : server.once("exit", resolve),
    );
    server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: new URL(base).port,
        DATA_DIR: directory,
        NODE_ENV: "test",
        MOMENTUM_PREVIEW: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${base}/auth/status`)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const memberData = await request(member, "GET", "/team/bootstrap");
    expect(memberData.status).toBe(200);
    expect(memberData.body.tasks).toEqual([
      expect.objectContaining({
        id: taskId,
        status: "approved",
        submission: "Revised draft",
      }),
    ]);
    expect(
      (await request(owner, "GET", "/team/bootstrap")).body.goals[0],
    ).toMatchObject({ id: goalId, current: 2 });
  });
  it("consumes an invitation only once even when registrations race", async () => {
    const invitation = await request(owner, "POST", "/team/invites", {
      email: "race@example.com",
      role: "member",
    });
    const details = {
      name: "Racing user",
      email: "race@example.com",
      password: "a-long-enough-password",
      inviteToken: invitation.body.token,
    };
    const attempts = await Promise.all([
      authenticate(anonymous(), details),
      authenticate(anonymous(), details),
    ]);
    expect(attempts.map((item) => item.status).sort()).toEqual([200, 403]);
    const database = new DatabaseSync(join(directory, "momentum.sqlite"));
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM users WHERE email=?")
        .get("race@example.com")?.count,
    ).toBe(1);
    database.close();
  });
});
