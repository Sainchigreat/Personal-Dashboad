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
  directory = await mkdtemp(join(tmpdir(), "momentum-pg-health-"));
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        resolve(typeof address === "object" && address ? address.port : 0),
      );
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
        DATABASE_URL: "", // server-only secret deliberately absent
        MOMENTUM_IMPORT_ONLY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(`${base}/auth/status`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("API failed to start for the PostgreSQL health test.");
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

describe("server-side PostgreSQL connection endpoint", () => {
  it("fails closed and never leaks the connection string when DATABASE_URL is absent", async () => {
    const response = await fetch(`${base}/pg/health`);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; where: string };
    expect(body.error).toContain("DATABASE_URL");
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(JSON.stringify(body)).not.toContain("supabase.co");
  });

  it("keeps the existing local API working while the cloud connection is absent", async () => {
    const response = await fetch(`${base}/auth/status`);
    expect(response.ok).toBe(true);
    expect((await response.json()) as { previewEnabled: boolean }).toMatchObject({
      previewEnabled: true,
    });
  });
});
