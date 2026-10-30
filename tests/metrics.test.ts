import { describe, expect, it } from "vitest";
import { addDays, todayInZone, weekStart } from "../src/lib/date";
import { cycleMetrics, percentage, weekMetrics } from "../src/lib/metrics";
import type { Cycle, Data } from "../src/types";

const cycle = {
  id: "november",
  month: "2026-11",
  sales_target: 68,
  revenue_target: 1013200,
  outreach_target: 20,
  projects_target: 2,
} as Cycle;
const fixture = {
  settings: { timezone: "Africa/Lagos" },
  cycles: [cycle],
  sales: [
    {
      cycle_id: "november",
      status: "paid",
      amount: 14900,
      sale_date: "2026-11-02",
    },
    {
      cycle_id: "november",
      status: "pending",
      amount: 14900,
      sale_date: "2026-11-02",
    },
    {
      cycle_id: "november",
      status: "refunded",
      amount: 14900,
      sale_date: "2026-11-02",
    },
    {
      cycle_id: "other",
      status: "paid",
      amount: 5000,
      sale_date: "2026-10-02",
    },
  ],
  tasks: [
    {
      id: "one",
      due_date: "2026-11-02",
      status: "done",
      sort_order: 0,
      created_at: "2026-11-02",
      completed_at: "2026-11-02T09:00:00Z",
    },
    {
      id: "two",
      due_date: "2026-11-02",
      status: "todo",
      sort_order: 1,
      created_at: "2026-11-02",
    },
  ],
  prospects: [{ researched_at: "2026-11-02" }],
  interactions: [
    { kind: "outreach", occurred_date: "2026-11-02" },
    { kind: "follow-up", occurred_date: "2026-11-02" },
    { kind: "reply", occurred_date: "2026-11-02" },
  ],
  projects: [],
  content_items: [],
  chapter_sessions: [],
} as unknown as Data;

describe("date and metric rules", () => {
  it("uses local Lagos dates and Monday-based weeks across month boundaries", () => {
    expect(todayInZone("Africa/Lagos", new Date("2026-10-31T23:30:00Z"))).toBe(
      "2026-11-01",
    );
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("counts only confirmed payments, not pending, refunded or other cycles", () => {
    const result = cycleMetrics(fixture, cycle, "2026-11-02");
    expect(result.sales).toBe(1);
    expect(result.revenue).toBe(14900);
    expect(result.salesRemaining).toBe(67);
    expect(result.revenueRemaining).toBe(998300);
  });
  it("keeps researched prospects distinct from sent outreach and follow-ups", () => {
    const result = cycleMetrics(fixture, cycle, "2026-11-02");
    expect(result.researched).toBe(1);
    expect(result.outreach).toBe(2);
    expect(result.done).toBe(1);
    expect(weekMetrics(fixture, "2026-11-02").replies).toBe(1);
  });
  it("handles zero targets and caps progress indicators without altering totals", () => {
    expect(percentage(2, 0)).toBe(0);
    expect(percentage(90, 68)).toBe(100);
  });
});
