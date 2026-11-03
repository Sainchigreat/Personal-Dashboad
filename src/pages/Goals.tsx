import { useMemo, useState, type FormEvent } from "react";
import { addDays, displayDate, weekStart } from "../lib/date";
import { useApp } from "../lib/store";
import { Button, IconButton, PageHeader, SectionHeading } from "../components/UI";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Target,
  Plus,
  Archive,
  Link2,
  ArrowRight,
} from "lucide-react";
import {
  SOURCE_LABELS,
  asGoalLike,
  goalProgress,
  linkedTasks,
  weeklyGoalsFor,
  type GoalSource,
} from "../lib/goalProgress";
import type { MonthlyGoal, WeeklyGoal } from "../types";

const SOURCES: GoalSource[] = [
  "manual",
  "tasks",
  "sales",
  "revenue",
  "publishing",
  "outreach",
  "projects",
];

function monthBounds(day: string) {
  const month = day.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, "0")}`,
  };
}

export default function Goals() {
  const { data, today, create, update, toast, setPage } = useApp();
  const [week, setWeek] = useState(weekStart(today));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newMonthly, setNewMonthly] = useState("");
  const [newWeekly, setNewWeekly] = useState("");
  const [busy, setBusy] = useState(false);
  const end = addDays(week, 6);
  const bounds = monthBounds(week);

  const monthly = useMemo(
    () => data.monthly_goals.filter((g) => g.status !== "archived"),
    [data.monthly_goals],
  );
  const weekly = useMemo(
    () =>
      data.weekly_goals.filter(
        (g) => g.week_start === week && g.status !== "archived",
      ),
    [data.weekly_goals, week],
  );
  const weekTasks = useMemo(
    () => data.tasks.filter((t) => t.due_date && t.due_date >= week && t.due_date <= end),
    [data.tasks, week, end],
  );
  const unlinkedTasks = useMemo(
    () => weekTasks.filter((t) => !t.weekly_goal_id),
    [weekTasks],
  );

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await action();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addMonthly(event: FormEvent) {
    event.preventDefault();
    const title = newMonthly.trim();
    if (!title) return;
    await run(
      () =>
        create("monthly_goals", {
          title,
          metric_type: "outcome",
          source: "manual",
          target: 1,
          unit: "outcomes",
          start_date: bounds.start,
          end_date: bounds.end,
          status: "active",
          notes: "",
        }),
      "Monthly goal created.",
    );
    setNewMonthly("");
  }

  async function addWeekly(event: FormEvent, monthlyGoalId: string) {
    event.preventDefault();
    const outcome = newWeekly.trim();
    if (!outcome) return;
    await run(
      () =>
        create("weekly_goals", {
          monthly_goal_id: monthlyGoalId,
          week_start: week,
          week_end: end,
          outcome,
          target: 1,
          unit: "outcomes",
          current: 0,
          source: "manual",
          priority: "medium",
          status: "active",
          visibility: "private",
          notes: "",
        }),
      "Weekly goal created.",
    );
    setNewWeekly("");
    setExpanded((prev) => new Set(prev).add(monthlyGoalId));
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function carryForward(goal: WeeklyGoal) {
    // Explicit user confirmation only. Nothing is carried automatically.
    const nextWeek = addDays(week, 7);
    const nextEnd = addDays(nextWeek, 6);
    if (
      !window.confirm(
        `Carry "${goal.outcome}" to ${nextWeek}? The original will be marked carried and no tasks will be duplicated.`,
      )
    )
      return;
    await run(async () => {
      await create("weekly_goals", {
        monthly_goal_id: goal.monthly_goal_id,
        week_start: nextWeek,
        week_end: nextEnd,
        outcome: goal.outcome,
        target: goal.target,
        unit: goal.unit,
        current: 0,
        source: goal.source,
        priority: goal.priority,
        status: "active",
        visibility: goal.visibility,
        notes: `Explicitly carried from week ${goal.week_start}. ${goal.notes}`.trim(),
      });
      await update("weekly_goals", goal.id, { status: "carried" });
    }, "Weekly goal carried forward.");
  }

  async function linkTask(taskId: string, goalId: string) {
    if (!taskId) return;
    await run(
      () => update("tasks", taskId, { weekly_goal_id: goalId }),
      "Task linked to this weekly goal.",
    );
  }

  const renderProgress = (goal: MonthlyGoal | WeeklyGoal, linkedIds: string[]) => {
    const p = goalProgress(data, asGoalLike(goal), linkedIds);
    const pct = p.denominator
      ? Math.min(100, Math.round((p.numerator / p.denominator) * 100))
      : 0;
    return (
      <div className="goal-progress">
        <div className="goal-progress-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="goal-progress-meta">
          <strong>
            {p.numerator} / {p.denominator} {p.unit}
          </strong>
          <span>
            {pct}% · {p.period.start} → {p.period.end}
          </span>
        </div>
        <small className="goal-source">
          Source of truth: {p.sourceLabel}. {p.detail}
        </small>
      </div>
    );
  };

  const renderWeekly = (goal: WeeklyGoal, nested = false) => {
    const linked = linkedTasks(data, goal.id);
    const p = goalProgress(data, asGoalLike(goal), linked.map((t) => t.id));
    return (
      <div key={goal.id} className={nested ? "goal-card nested" : "goal-card"}>
        <div className="goal-card-head">
          <div>
            <span className="goal-eyebrow">
              {goal.visibility === "team" ? "SHARED WITH TEAM" : "WEEKLY GOAL"}
            </span>
            <strong>{goal.outcome}</strong>
          </div>
          <div className="goal-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Carry to next week"
              title="Carry to next week (explicit)"
              disabled={busy}
              onClick={() => carryForward(goal)}
            >
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Archive weekly goal"
              title="Archive"
              disabled={busy}
              onClick={() =>
                run(
                  () => update("weekly_goals", goal.id, { status: "archived" }),
                  "Weekly goal archived.",
                )
              }
            >
              <Archive size={16} />
            </button>
          </div>
        </div>

        <form
          className="goal-edit"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                update("weekly_goals", goal.id, {
                  outcome: String(form.get("outcome") || goal.outcome),
                  target: Math.max(1, Number(form.get("target") || goal.target)),
                  unit: String(form.get("unit") || goal.unit),
                  source: String(form.get("source") || goal.source),
                  current: Math.max(0, Number(form.get("current") || 0)),
                  notes: String(form.get("notes") || ""),
                }),
              "Weekly goal saved.",
            );
          }}
        >
          <label>
            Outcome
            <input name="outcome" defaultValue={goal.outcome} />
          </label>
          <div className="goal-grid">
            <label>
              Target
              <input name="target" type="number" min="1" defaultValue={goal.target} />
            </label>
            <label>
              Unit
              <input name="unit" defaultValue={goal.unit} />
            </label>
            <label>
              Source of truth
              <select name="source" defaultValue={goal.source}>
                {SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Manual adjustment (used only for manual goals; saved with notes + updated_at)
            <input name="current" type="number" min="0" defaultValue={goal.current} />
          </label>
          <label>
            Notes / adjustment reason
            <textarea name="notes" rows={2} defaultValue={goal.notes} />
          </label>
          <Button type="submit" variant="secondary" disabled={busy}>
            Save weekly goal
          </Button>
        </form>

        {renderProgress(goal, linked.map((t) => t.id))}

        <div className="goal-links">
          <span className="goal-eyebrow">
            <Link2 size={12} /> LINKED DAILY DELIVERABLES ({linked.length})
          </span>
          {linked.length ? (
            <ul>
              {linked.map((task) => (
                <li key={task.id}>
                  <span>{task.title}</span>
                  <small>{task.status === "done" ? "completed" : task.status}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              No tasks linked yet. Completing a linked task only counts for goals
              whose source is “Linked completed tasks”.
            </p>
          )}
          {unlinkedTasks.length > 0 && (
            <label className="goal-link-select">
              Link an existing task for this week
              <select
                defaultValue=""
                disabled={busy}
                onChange={(event) => linkTask(event.target.value, goal.id)}
              >
                <option value="">Select a task…</option>
                {unlinkedTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} · {task.status}
                  </option>
                ))}
              </select>
            </label>
          )}
          {p.recordIds.length > 0 && (
            <small className="muted">
              {p.recordIds.length} authoritative record(s) counted; each de-duplicated
              by id.
            </small>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="ONE CONNECTED HIERARCHY"
        title="Goals"
        description="Monthly outcomes → weekly targets → daily deliverables. Progress comes from real records, never from ticking a box."
      />

      <div className="day-toolbar review-toolbar">
        <div className="day-date">
          <span className="day-date-icon">
            <CalendarDays size={18} />
          </span>
          <div>
            <strong>
              {week === weekStart(today) ? "This week" : "Selected week"}
            </strong>
            <span>
              {displayDate(week, { month: "short", day: "numeric" })} –{" "}
              {displayDate(end, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
        <div className="day-nav">
          <IconButton
            icon={ChevronLeft}
            label="Previous week"
            onClick={() => setWeek(addDays(week, -7))}
          />
          <button onClick={() => setWeek(weekStart(today))}>This week</button>
          <IconButton
            icon={ChevronRight}
            label="Next week"
            onClick={() => setWeek(addDays(week, 7))}
          />
        </div>
      </div>

      <section className="review-intro">
        <div>
          <span className="overline">PERSONAL WORKSPACE · {bounds.start.slice(0, 7)}</span>
          <h2>
            {monthly.length} monthly · {weekly.length} weekly goals
          </h2>
          <p>
            Reporting period {week} to {end}. Personal goals are private; only
            goals explicitly marked “Shared with team” appear in a team context.
          </p>
        </div>
        <span className="review-intro-icon">
          <Target size={24} />
        </span>
      </section>

      {monthly.length === 0 && (
        <div className="panel goal-empty">
          <SectionHeading
            title="Start with one monthly outcome"
            sub="Then break it into weekly targets and connect the daily tasks that move it forward. Nothing from another account is seeded here."
          />
          <form onSubmit={addMonthly} className="goal-create">
            <input
              aria-label="First monthly goal"
              placeholder="e.g. Publish consistently this month"
              value={newMonthly}
              onChange={(e) => setNewMonthly(e.target.value)}
            />
            <Button type="submit" variant="primary" icon={Plus} disabled={busy}>
              Create monthly goal
            </Button>
          </form>
          <button
            type="button"
            className="goal-empty-link"
            onClick={() => setPage("day")}
          >
            Go to My Day to plan daily deliverables →
          </button>
        </div>
      )}

      {monthly.length > 0 && (
        <form className="goal-create panel" onSubmit={addMonthly}>
          <input
            aria-label="New monthly goal"
            placeholder="Add another monthly goal…"
            value={newMonthly}
            onChange={(e) => setNewMonthly(e.target.value)}
          />
          <Button type="submit" variant="secondary" icon={Plus} disabled={busy}>
            Add monthly goal
          </Button>
        </form>
      )}

      {monthly.map((goal) => {
        const children = weeklyGoalsFor(data, goal.id);
        const isOpen = expanded.has(goal.id);
        return (
          <section key={goal.id} className="panel goal-monthly">
            <div className="goal-card-head">
              <div>
                <span className="goal-eyebrow">
                  MONTHLY GOAL · {goal.metric_type.toUpperCase()}
                </span>
                <strong>{goal.title}</strong>
                <small className="muted">
                  {goal.start_date || "—"} → {goal.end_date || "—"} ·{" "}
                  {children.length} linked weekly goal(s)
                </small>
              </div>
              <div className="goal-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={isOpen ? "Collapse weekly goals" : "Expand weekly goals"}
                  onClick={() => toggle(goal.id)}
                >
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Archive monthly goal"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => update("monthly_goals", goal.id, { status: "archived" }),
                      "Monthly goal archived.",
                    )
                  }
                >
                  <Archive size={16} />
                </button>
              </div>
            </div>
            {goal.description && <p className="muted">{goal.description}</p>}
            {renderProgress(goal, [])}
            {isOpen && (
              <div className="goal-children">
                {children.length ? (
                  children.map((child) => renderWeekly(child, true))
                ) : (
                  <p className="muted">
                    No weekly goals yet for this monthly outcome.
                  </p>
                )}
                <form className="goal-create" onSubmit={(e) => addWeekly(e, goal.id)}>
                  <input
                    aria-label="New weekly outcome"
                    placeholder="Add a weekly outcome…"
                    value={newWeekly}
                    onChange={(e) => setNewWeekly(e.target.value)}
                  />
                  <Button type="submit" variant="secondary" icon={Plus} disabled={busy}>
                    Add weekly goal
                  </Button>
                </form>
              </div>
            )}
          </section>
        );
      })}

      {weekly.length > 0 && (
        <section className="panel">
          <SectionHeading
            title={`This week's deliverables (${week})`}
            sub="Weekly goals are shown above under their monthly parent as well. Tasks can stay unlinked for ad hoc work."
          />
          {weekly
            .filter((goal) => !monthly.some((m) => weeklyGoalsFor(data, m.id).some((w) => w.id === goal.id)))
            .map((goal) => renderWeekly(goal))}
          {weekly.every((goal) =>
            monthly.some((m) => weeklyGoalsFor(data, m.id).some((w) => w.id === goal.id)),
          ) && (
            <p className="muted">
              All of this week's goals are linked to a monthly outcome above.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
