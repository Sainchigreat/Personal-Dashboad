import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

let processHandle: ChildProcess;
let directory: string;
let base: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "momentum-preview-"));
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const value = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(value));
    });
  });
  base = `http://127.0.0.1:${port}/api`;
  processHandle = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: directory,
        NODE_ENV: "test",
        MOMENTUM_PREVIEW: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/auth/status`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Preview API failed to start.");
}, 20000);
afterAll(async () => {
  if (processHandle) {
    processHandle.kill("SIGTERM");
    await new Promise((resolve) => {
      if (processHandle.exitCode !== null) resolve(null);
      else processHandle.once("exit", resolve);
    });
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("isolated preview mode", () => {
  it("works without third-party cookies but still checks CSRF and revokes the preview session", async () => {
    const login = await fetch(`${base}/auth/preview`, { method: "POST" });
    const session = (await login.json()) as {
      previewToken: string;
      csrfToken: string;
    };
    expect(session.previewToken).toBeTruthy();
    // Successful users behind one shared IP do not consume the failure budget.
    for (let i = 0; i < 15; i++)
      expect(
        (await fetch(`${base}/auth/preview`, { method: "POST" })).status,
      ).toBe(200);
    const headers = { Authorization: `Bearer ${session.previewToken}` };
    expect((await fetch(`${base}/bootstrap`, { headers })).status).toBe(200);
    const invitation = await fetch(`${base}/team/invites`, {
      method: "POST",
      headers: {
        ...headers,
        "X-CSRF-Token": session.csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "demo@example.com", role: "member" }),
    });
    expect(invitation.status).toBe(403);
    expect(
      (
        await fetch(`${base}/settings`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Changed" }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/auth/logout`, {
          method: "POST",
          headers: { ...headers, "X-CSRF-Token": session.csrfToken },
        })
      ).status,
    ).toBe(200);
    expect((await fetch(`${base}/bootstrap`, { headers })).status).toBe(401);
    for (let i = 0; i < 12; i++) {
      const failed = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid", password: "x" }),
      });
      expect(failed.status).toBe(400);
    }
    expect(
      (
        await fetch(`${base}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid", password: "x" }),
        })
      ).status,
    ).toBe(429);
  });
});
