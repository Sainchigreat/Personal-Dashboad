/**
 * Authoritative goal progress (implementation blueprint §7).
 *
 * Progress is derived from real records, never from a task checkbox when the
 * goal is sales / revenue / publishing / outreach / project based. Every
 * result carries the numerator, denominator, unit, reporting period and the
 * source of truth so the UI can show exactly where the number came from.
 */
import type {
  Data,
  MonthlyGoal,
  WeeklyGoal,
  Task,
} from "../types";
import { inRange, localDateTime } from "./date";

export type GoalSource =
  | "manual"
  | "tasks"
  | "sales"
  | "revenue"
  | "publishing"
  | "outreach"
  | "projects";

export type GoalLike = Pick<
  MonthlyGoal,
  "source" | "target" | "unit" | "baseline" | "notes" | "title"
> & {
  id: string;
  current?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  week_start?: string | null;
  week_end?: string | null;
};

export type Progress = {
  numerator: number;
  denominator: number;
  unit: string;
  period: { start: string; end: string };
  sourceLabel: string;
  detail: string;
  /** Records that produced the numerator, de-duplicated by id. */
  recordIds: string[];
};

export const SOURCE_LABELS: Record<GoalSource, string> = {
  manual: "Manually recorded",
  tasks: "Linked completed tasks",
  sales: "Paid Course Growth sales",
  revenue: "Realised revenue (paid sales)",
  publishing: "Published content records",
  outreach: "Sent outreach / follow-ups",
  projects: "Completed Creative Studio projects",
};

const unique = <T extends { id: string }>(rows: T[]): T[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};

export function periodFor(goal: GoalLike): { start: string; end: string } {
  const start = goal.week_start || goal.start_date || "1970-01-01";
  const end = goal.week_end || goal.end_date || "9999-12-31";
  return { start, end };
}

/** Count linked completed tasks once, never double-counting within one goal. */
export function taskProgress(data: Data, goal: GoalLike, linkedIds: string[]): number {
  const ids = new Set(linkedIds);
  return unique(
    data.tasks.filter(
      (task) => ids.has(task.id) && task.status === "done",
    ),
  ).length;
}

export function goalProgress(
  data: Data,
  goal: GoalLike,
  linkedTaskIds: string[] = [],
): Progress {
  const { start, end } = periodFor(goal);
  const zone = data.settings.timezone || "Africa/Lagos";
  const period = { start, end };
  const denominator = Math.max(0, Number(goal.target) || 0);
  const source = (goal.source || "manual") as GoalSource;
  let numerator = 0;
  let recordIds: string[] = [];
  let detail = "";

  switch (source) {
    case "sales": {
      // Only positive-amount paid sales count. Pending and refunded are excluded.
      const paid = unique(
        data.sales.filter(
          (sale) =>
            sale.status === "paid" &&
            Number(sale.amount) > 0 &&
            inRange(sale.sale_date, start, end),
        ),
      );
      numerator = paid.length;
      recordIds = paid.map((row) => row.id);
      detail = `${paid.length} paid sale(s) with amount > 0; pending/refunded excluded.`;
      break;
    }
    case "revenue": {
      const paid = unique(
        data.sales.filter(
          (sale) =>
            sale.status === "paid" &&
            Number(sale.amount) > 0 &&
            inRange(sale.sale_date, start, end),
        ),
      );
      numerator = paid.reduce((sum, sale) => sum + Number(sale.amount), 0);
      recordIds = paid.map((row) => row.id);
      detail = `Sum of ${paid.length} paid sale(s); pending/refunded excluded.`;
      break;
    }
    case "publishing": {
      const published = unique(
        data.content_items.filter(
          (item) =>
            ["Published", "Distributed"].includes(item.status) &&
            inRange(item.published_date, start, end),
        ),
      );
      numerator = published.length;
      recordIds = published.map((row) => row.id);
      detail = `${published.length} content record(s) with status Published/Distributed and a real publication date.`;
      break;
    }
    case "outreach": {
      // Research, replies, calls and proposals are deliberately NOT counted as
      // sent outreach. Only actual outreach and follow-up interactions count.
      const sent = unique(
        data.interactions.filter(
          (item) =>
            ["outreach", "follow-up"].includes(item.kind) &&
            inRange(item.occurred_date, start, end),
        ),
      );
      numerator = sent.length;
      recordIds = sent.map((row) => row.id);
      detail = `${sent.length} sent outreach/follow-up interaction(s); research, replies, calls and proposals excluded.`;
      break;
    }
    case "projects": {
      const completed = unique(
        data.projects.filter(
          (project) =>
            project.stage === "Completed" &&
            inRange(localDateTime(project.completed_at, zone), start, end),
        ),
      );
      numerator = completed.length;
      recordIds = completed.map((row) => row.id);
      detail = `${completed.length} project(s) at stage Completed with a completion time in the period.`;
      break;
    }
    case "tasks": {
      const ids = new Set(linkedTaskIds);
      const done = unique(
        data.tasks.filter(
          (task: Task) => ids.has(task.id) && task.status === "done",
        ),
      );
      numerator = done.length;
      recordIds = done.map((row) => row.id);
      detail = `${done.length} linked, completed task(s); each task counted once.`;
      break;
    }
    case "manual":
    default: {
      numerator = Math.max(
        Number(goal.current ?? goal.baseline) || 0,
        0,
      );
      detail = "Manually recorded value. Adjustments are saved with the goal's notes and updated_at.";
      break;
    }
  }

  return {
    numerator,
    denominator,
    unit: goal.unit || "",
    period,
    sourceLabel: SOURCE_LABELS[source],
    detail,
    recordIds,
  };
}

/** Linked tasks for a weekly goal (dedupe by id; ad hoc tasks stay unlinked). */
export function linkedTasks(data: Data, weeklyGoalId: string): Task[] {
  return unique(
    data.tasks.filter((task) => task.weekly_goal_id === weeklyGoalId),
  );
}

/** Weekly goals belonging to a monthly goal, including additional goal_links. */
export function weeklyGoalsFor(
  data: Data,
  monthlyGoalId: string,
): WeeklyGoal[] {
  const extra = new Set(
    data.goal_links
      .filter((link) => link.monthly_goal_id === monthlyGoalId)
      .map((link) => link.weekly_goal_id),
  );
  return data.weekly_goals.filter(
    (goal) => goal.monthly_goal_id === monthlyGoalId || extra.has(goal.id),
  );
}

export function asGoalLike(goal: MonthlyGoal | WeeklyGoal): GoalLike {
  const monthly = goal as MonthlyGoal;
  const weekly = goal as WeeklyGoal;
  return {
    id: goal.id,
    title: "title" in goal ? monthly.title : weekly.outcome,
    source: goal.source,
    target: goal.target,
    unit: goal.unit,
    baseline: "baseline" in goal ? monthly.baseline : 0,
    current: "current" in goal ? weekly.current : null,
    notes: goal.notes,
    start_date: "start_date" in goal ? monthly.start_date : null,
    end_date: "end_date" in goal ? monthly.end_date : null,
    week_start: "week_start" in goal ? weekly.week_start : null,
    week_end: "week_end" in goal ? weekly.week_end : null,
  };
}
