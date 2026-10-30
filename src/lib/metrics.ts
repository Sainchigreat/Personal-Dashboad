import type { Cycle, Data, Task } from "../types";
import { addDays, inRange, localDateTime, weekStart } from "./date";

export const currency = (value: number) =>
  `₦${Math.round(value).toLocaleString("en-NG")}`;
export const percentage = (value: number, target: number) =>
  target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
export const isOpenTask = (task: Task) =>
  !["done", "cancelled", "carried"].includes(task.status);
export function dayTasks(data: Data, day: string) {
  return data.tasks
    .filter(
      (task) =>
        task.due_date === day &&
        !["cancelled", "carried"].includes(task.status),
    )
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
    );
}
export function cycleMetrics(data: Data, cycle: Cycle, today: string) {
  const paid = data.sales.filter(
    (sale) => sale.cycle_id === cycle.id && sale.status === "paid",
  );
  const revenue = paid.reduce((sum, sale) => sum + sale.amount, 0);
  const tasks = dayTasks(data, today);
  const start = weekStart(today);
  const end = addDays(start, 6);
  const projectsDone = data.projects.filter((project) =>
    inRange(
      localDateTime(project.completed_at, data.settings.timezone),
      start,
      end,
    ),
  ).length;
  return {
    sales: paid.length,
    revenue,
    salesRemaining: Math.max(0, cycle.sales_target - paid.length),
    revenueRemaining: Math.max(0, cycle.revenue_target - revenue),
    outreach: data.interactions.filter(
      (item) =>
        ["outreach", "follow-up"].includes(item.kind) &&
        item.occurred_date === today,
    ).length,
    researched: data.prospects.filter((item) => item.researched_at === today)
      .length,
    projectsDone,
    tasks,
    done: tasks.filter((task) => task.status === "done").length,
  };
}
export function weekMetrics(data: Data, start: string) {
  const end = addDays(start, 6);
  const paid = data.sales.filter(
    (sale) => sale.status === "paid" && inRange(sale.sale_date, start, end),
  );
  return {
    sales: paid.length,
    revenue: paid.reduce((sum, sale) => sum + sale.amount, 0),
    done: data.tasks.filter(
      (task) =>
        task.status === "done" &&
        inRange(
          localDateTime(task.completed_at, data.settings.timezone),
          start,
          end,
        ),
    ).length,
    incomplete: data.tasks.filter(
      (task) => isOpenTask(task) && inRange(task.due_date, start, end),
    ).length,
    researched: data.prospects.filter((prospect) =>
      inRange(prospect.researched_at, start, end),
    ).length,
    outreach: data.interactions.filter(
      (interaction) =>
        ["outreach", "follow-up"].includes(interaction.kind) &&
        inRange(interaction.occurred_date, start, end),
    ).length,
    replies: data.interactions.filter(
      (interaction) =>
        interaction.kind === "reply" &&
        inRange(interaction.occurred_date, start, end),
    ).length,
    calls: data.interactions.filter(
      (interaction) =>
        interaction.kind === "call" &&
        inRange(interaction.occurred_date, start, end),
    ).length,
    proposals: data.interactions.filter(
      (interaction) =>
        interaction.kind === "proposal" &&
        inRange(interaction.occurred_date, start, end),
    ).length,
    projects: data.projects.filter((project) =>
      inRange(
        localDateTime(project.completed_at, data.settings.timezone),
        start,
        end,
      ),
    ).length,
    published: data.content_items.filter(
      (item) =>
        ["Published", "Distributed"].includes(item.status) &&
        inRange(item.published_date, start, end),
    ).length,
    sessions: data.chapter_sessions.filter(
      (session) =>
        ["Completed", "Archived"].includes(session.status) &&
        inRange(session.session_date, start, end),
    ).length,
  };
}
