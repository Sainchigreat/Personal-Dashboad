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
    theme: "system",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
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

  it("migrates untouched legacy appearance without losing records and preserves manual choices", async () => {
    const demo = makeDemo();
    await demo.request("POST", "/tasks", {
      title: "Keep my task",
      status: "todo",
    });
    const key = "momentum-os-browser-demo-v1";
    const previous = JSON.parse(demo.storage.get(key)!);
    previous.data.settings.theme = "dark";
    demo.storage.set(key, JSON.stringify(previous));
    let reopened = makeDemo(demo.storage);
    let data = (await reopened.request("GET", "/bootstrap")).body;
    expect(data.settings.theme).toBe("system");
    expect(data.tasks).toEqual([
      expect.objectContaining({ title: "Keep my task" }),
    ]);
    expect(
      (await reopened.request("PATCH", "/settings", { theme: "light" })).status,
    ).toBe(200);
    reopened = makeDemo(demo.storage);
    data = (await reopened.request("GET", "/bootstrap")).body;
    expect(data.settings.theme).toBe("light");
    expect(data.tasks).toHaveLength(1);
    expect(
      (await reopened.request("PATCH", "/settings", { theme: "invalid" }))
        .status,
    ).toBe(400);
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
  it("simulates a sample team locally without presenting invitations as real", async () => {
    const demo = makeDemo();
    const ownerTeam = (await demo.request("GET", "/team/bootstrap")).body;
    expect(ownerTeam.goals).toHaveLength(0);
    expect(ownerTeam.tasks).toHaveLength(0);
    expect(
      ownerTeam.members.find((m: any) => m.user_id === "sample-member").name,
    ).toBe("Sample teammate");
    expect(
      (
        await demo.request("POST", "/team/invites", {
          email: "someone@example.com",
          role: "member",
        })
      ).status,
    ).toBe(403);
    const goal = await demo.request("POST", "/team/goals", {
      title: "Sample goal",
      target: 3,
      current: 0,
      unit: "pieces",
    });
    const task = await demo.request("POST", "/team/tasks", {
      title: "Sample assignment",
      assignee_user_id: "sample-member",
      reviewer_user_id: ownerTeam.membership.user_id,
      goal_id: goal.body.id,
      priority: "medium",
    });
    expect(task.status).toBe(201);
    await demo.request("POST", "/team/demo-switch");
    expect((await demo.request("GET", "/auth/status")).body.accountType).toBe(
      "team",
    );
    expect((await demo.request("GET", "/bootstrap")).status).toBe(403);
    const memberTeam = (await demo.request("GET", "/team/bootstrap")).body;
    expect(memberTeam.tasks.map((t: any) => t.title)).toEqual([
      "Sample assignment",
    ]);
    expect(
      (
        await demo.request("PATCH", `/team/tasks/${task.body.id}/status`, {
          status: "in_progress",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await demo.request("PATCH", `/team/tasks/${task.body.id}/status`, {
          status: "submitted",
          submission: "Sample work",
        })
      ).status,
    ).toBe(200);
    await demo.request("POST", "/team/demo-switch");
    expect(
      (
        await demo.request("PATCH", `/team/tasks/${task.body.id}`, {
          reviewer_user_id: ownerTeam.membership.user_id,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await demo.request("PATCH", `/team/tasks/${task.body.id}/status`, {
          status: "approved",
          feedback: "Reviewed",
        })
      ).status,
    ).toBe(200);
    const reopened = makeDemo(demo.storage);
    const saved = (await reopened.request("GET", "/team/bootstrap")).body;
    expect(saved.tasks[0]).toMatchObject({
      title: "Sample assignment",
      status: "approved",
    });
    expect(saved.goals[0].current).toBe(0);
  });
});
