import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { configs, foreignKeys } from "../server/validation";

function makeDemo(storage = new Map<string, string>()) {
  const resources = Object.keys(configs);
  const data: Record<string, unknown> = Object.fromEntries(
    resources.map((name) => [name, []]),
  );
  data.settings = {
    user_id: "demo-user",
    timezone: "Africa/Lagos",
    auto_plan: 0,
    daily_templates: "[]",
    work_start: "08:00",
    work_end: "17:00",
  };
  data.cycles = [{ id: "cycle-one", month: "2026-11", status: "active" }];
  const defaults = Object.fromEntries(resources.map((name) => [name, {}]));
  const required = Object.fromEntries(
    Object.entries(configs).map(([name, config]) => [name, config.required]),
  );
  const source = readFileSync("scripts/preview-api.js", "utf8")
    .replace("__PREVIEW_SEED__", JSON.stringify(data))
    .replace("__PREVIEW_DEFAULTS__", JSON.stringify(defaults))
    .replace("__PREVIEW_REQUIRED__", JSON.stringify(required))
    .replace("__PREVIEW_REFERENCES__", JSON.stringify(foreignKeys));
  const window = { fetch: vi.fn(), crypto: { randomUUID } };
  runInNewContext(source, {
    window,
    Response,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  const request = async (method: string, path: string, body?: unknown) => {
    const response = (await window.fetch(`/api${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    })) as Response;
    return { status: response.status, body: await response.json() };
  };
  return { request, storage };
}

describe("browser-only preview adapter", () => {
  it("saves demo tasks across reloads and tracks actual completion", async () => {
    const demo = makeDemo();
    const created = await demo.request("POST", "/tasks", {
      title: "Preview task",
      status: "todo",
    });
    expect(created.status).toBe(201);
    const updated = await demo.request("PATCH", `/tasks/${created.body.id}`, {
      status: "done",
    });
    expect(updated.body.completed_at).toBeTruthy();
    const reopened = makeDemo(demo.storage);
    expect((await reopened.request("GET", "/bootstrap")).body.tasks).toEqual([
      expect.objectContaining({ title: "Preview task", status: "done" }),
    ]);
  });

  it("does not count invalid paid sales or publish unapproved AI content", async () => {
    const demo = makeDemo();
    const badSale = await demo.request("POST", "/sales", {
      sale_date: "2026-11-05",
      cycle_id: "cycle-one",
      status: "paid",
      amount: 0,
    });
    expect(badSale.status).toBe(400);
    const badContent = await demo.request("POST", "/content_items", {
      title: "Draft",
      status: "Published",
      ai_assisted: 1,
      human_approved: 0,
    });
    expect(badContent.status).toBe(400);
    const data = (await demo.request("GET", "/bootstrap")).body;
    expect(data.sales).toHaveLength(0);
    expect(data.content_items).toHaveLength(0);
  });

  it("creates session checklists and returns to preview after sign-out", async () => {
    const demo = makeDemo();
    const session = await demo.request("POST", "/chapter_sessions", {
      title: "A conversation",
      session_date: "2026-11-06",
    });
    expect(session.status).toBe(201);
    const data = (await demo.request("GET", "/bootstrap")).body;
    expect(data.session_checklists).toHaveLength(9);
    expect(data.tasks).toHaveLength(3);
    await demo.request("POST", "/auth/logout");
    expect((await demo.request("GET", "/auth/status")).body.authenticated).toBe(
      false,
    );
    await demo.request("POST", "/auth/preview");
    expect((await demo.request("GET", "/auth/status")).body.authenticated).toBe(
      true,
    );
  });
});
