// Blueprint §7: progress must come from authoritative records, never from
// task checkboxes for sales/revenue/publishing/outreach/projects goals.
import { describe, expect, it } from "vitest";
import {
  asGoalLike,
  goalProgress,
  linkedTasks,
  weeklyGoalsFor,
  type GoalLike,
} from "../src/lib/goalProgress";
import type { Data, MonthlyGoal, WeeklyGoal } from "../src/types";

const base = (extra: Partial<Data> = {}): Data =>
  ({
    settings: { timezone: "Africa/Lagos" },
    sales: [],
    content_items: [],
    interactions: [],
    projects: [],
    tasks: [],
    monthly_goals: [],
    weekly_goals: [],
    goal_links: [],
    ...extra,
  }) as unknown as Data;

const goal = (overrides: Partial<GoalLike> = {}): GoalLike => ({
  id: "g1",
  title: "Goal",
  source: "manual",
  target: 10,
  unit: "units",
  baseline: 0,
  current: null,
  notes: "",
  start_date: "2026-11-01",
  end_date: "2026-11-30",
  week_start: null,
  week_end: null,
  ...overrides,
});

const sale = (id: string, status: string, amount: number, date: string) => ({
  id,
  status,
  amount,
  sale_date: date,
});
const content = (id: string, status: string, published: string | null) => ({
  id,
  status,
  published_date: published,
});
const interaction = (id: string, kind: string, date: string) => ({
  id,
  kind,
  occurred_date: date,
});
const project = (id: string, stage: string, completed: string | null) => ({
  id,
  stage,
  completed_at: completed,
});
const task = (id: string, status: string, weekly_goal_id: string | null = null) => ({
  id,
  status,
  weekly_goal_id,
  due_date: "2026-11-02",
});

describe("authoritative goal progress", () => {
  it("counts only positive-amount paid sales, excluding pending and refunded", () => {
    const data = base({
      sales: [
        sale("a", "paid", 14900, "2026-11-02"),
        sale("b", "pending", 14900, "2026-11-02"),
        sale("c", "refunded", 14900, "2026-11-02"),
        sale("d", "paid", 0, "2026-11-03"),
        sale("e", "paid", 14900, "2026-10-31"),
      ] as unknown as Data["sales"],
    });
    const p = goalProgress(data, goal({ source: "sales" }));
    expect(p.numerator).toBe(1);
    expect(p.recordIds).toEqual(["a"]);
    expect(p.sourceLabel).toContain("Paid Course Growth sales");
  });

  it("sums realised revenue from paid sales only", () => {
    const data = base({
      sales: [
        sale("a", "paid", 14900, "2026-11-02"),
        sale("b", "paid", 14900, "2026-11-03"),
        sale("c", "refunded", 999999, "2026-11-04"),
      ] as unknown as Data["sales"],
    });
    expect(goalProgress(data, goal({ source: "revenue" })).numerator).toBe(29800);
  });

  it("counts published content only with a real publication date in range", () => {
    const data = base({
      content_items: [
        content("a", "Published", "2026-11-02"),
        content("b", "Distributed", "2026-11-03"),
        content("c", "Draft", "2026-11-04"),
        content("d", "Published", null),
        content("e", "Published", "2026-12-01"),
      ] as unknown as Data["content_items"],
    });
    expect(goalProgress(data, goal({ source: "publishing" })).numerator).toBe(2);
  });

  it("distinguishes sent outreach from research, replies, calls and proposals", () => {
    const data = base({
      interactions: [
        interaction("a", "outreach", "2026-11-02"),
        interaction("b", "follow-up", "2026-11-02"),
        interaction("c", "reply", "2026-11-02"),
        interaction("d", "call", "2026-11-02"),
        interaction("e", "proposal", "2026-11-02"),
        interaction("f", "outreach", "2026-10-31"),
      ] as unknown as Data["interactions"],
    });
    expect(goalProgress(data, goal({ source: "outreach" })).numerator).toBe(2);
  });

  it("derives creative progress from completed project stages in Lagos time", () => {
    const data = base({
      projects: [
        project("a", "Completed", "2026-11-02T22:30:00.000Z"), // 23:30 Lagos, same day
        project("b", "Completed", "2026-11-03T09:00:00.000Z"),
        project("c", "In progress", "2026-11-04T09:00:00.000Z"),
        project("d", "Completed", null),
      ] as unknown as Data["projects"],
    });
    expect(goalProgress(data, goal({ source: "projects" })).numerator).toBe(2);
  });

  it("never double-counts a task and does not complete work by date", () => {
    const data = base({
      tasks: [
        task("a", "done", "w1"),
        task("b", "todo", "w1"),
      ] as unknown as Data["tasks"],
    });
    const p = goalProgress(data, goal({ source: "tasks" }), ["a", "a", "b"]);
    expect(p.numerator).toBe(1);
    expect(p.recordIds).toEqual(["a"]);
  });

  it("uses the stored manual value and reports it as such", () => {
    const p = goalProgress(base(), goal({ source: "manual", current: 7 }));
    expect(p.numerator).toBe(7);
    expect(p.sourceLabel).toBe("Manually recorded");
  });

  it("returns zero rather than fabricating progress when there are no records", () => {
    const p = goalProgress(base(), goal({ source: "sales" }));
    expect(p.numerator).toBe(0);
    expect(p.recordIds).toEqual([]);
    expect(p.period).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  });

  it("respects a weekly goal's own period", () => {
    const data = base({
      sales: [
        sale("in", "paid", 14900, "2026-11-04"),
        sale("out", "paid", 14900, "2026-11-10"),
      ] as unknown as Data["sales"],
    });
    const weekly = goal({
      source: "sales",
      week_start: "2026-11-02",
      week_end: "2026-11-08",
      start_date: null,
      end_date: null,
    });
    expect(goalProgress(data, weekly).numerator).toBe(1);
  });

  it("links tasks and weekly goals to their monthly parent without duplication", () => {
    const data = base({
      tasks: [
        task("t1", "todo", "w1"),
        task("t2", "done", "w1"),
        task("t3", "todo", null),
      ] as unknown as Data["tasks"],
      weekly_goals: [
        { id: "w1", monthly_goal_id: "m1", week_start: "2026-11-02" },
        { id: "w2", monthly_goal_id: null, week_start: "2026-11-02" },
      ] as unknown as Data["weekly_goals"],
      goal_links: [
        { weekly_goal_id: "w2", monthly_goal_id: "m1" },
      ] as unknown as Data["goal_links"],
    });
    expect(linkedTasks(data, "w1").map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(weeklyGoalsFor(data, "m1").map((g) => g.id)).toEqual(["w1", "w2"]);
  });

  it("maps monthly and weekly records onto the shared progress shape", () => {
    const monthly = {
      id: "m1",
      title: "Sell 68 seats",
      source: "sales",
      target: 68,
      unit: "paid seats",
      baseline: 0,
      notes: "",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
    } as MonthlyGoal;
    const weekly = {
      id: "w1",
      outcome: "Sell 17 seats",
      source: "sales",
      target: 17,
      unit: "paid seats",
      current: 0,
      notes: "",
      week_start: "2026-11-02",
      week_end: "2026-11-08",
    } as WeeklyGoal;
    expect(asGoalLike(monthly).title).toBe("Sell 68 seats");
    expect(asGoalLike(weekly).title).toBe("Sell 17 seats");
    expect(goalProgress(base(), asGoalLike(monthly)).period.start).toBe("2026-11-01");
    expect(goalProgress(base(), asGoalLike(weekly)).period.start).toBe("2026-11-02");
  });
});
