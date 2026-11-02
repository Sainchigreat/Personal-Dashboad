import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addDays, displayDate, weekStart } from "../lib/date";
import { useApp } from "../lib/store";
import { Button, IconButton, PageHeader, SectionHeading } from "../components/UI";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Target,
  Plus,
  Trash2,
} from "lucide-react";

/**
 * Weekly goals are stored as an editable plan on the existing weekly_reviews
 * record. New accounts start with NO goals: the owner's November plan is
 * applied only by the owner-scoped backfill, never shipped in the browser
 * bundle or seeded into every signup.
 *
 * `source` records where progress comes from:
 *  - "tasks"   -> linked, completed tasks (each task counted once per goal)
 *  - "manual"  -> an explicitly entered count
 *  - "records" -> authoritative specialist-module records (paid sales,
 *                 published content, project stages, sent outreach). Task
 *                 checkboxes must NEVER inflate these.
 */
type GoalSource = "tasks" | "manual" | "records";
type Goal = {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  task_ids: string[];
  notes: string;
  source: GoalSource;
};
type StoredPlan = { version: 1; goals: Goal[]; reflection_priorities: string };

const emptyPlan: StoredPlan = {
  version: 1,
  goals: [],
  reflection_priorities: "",
};

const sourceLabel: Record<GoalSource, string> = {
  tasks: "Linked completed tasks",
  manual: "Manually recorded",
  records: "Specialist-module records",
};

function normaliseGoal(value: unknown): Goal {
  const raw = (value || {}) as Partial<Goal>;
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    title: typeof raw.title === "string" ? raw.title : "New weekly goal",
    target: Number(raw.target) > 0 ? Number(raw.target) : 1,
    current: Math.max(0, Number(raw.current) || 0),
    unit: typeof raw.unit === "string" ? raw.unit : "outcomes",
    task_ids: Array.isArray(raw.task_ids) ? raw.task_ids.filter((x) => typeof x === "string") : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
    source: ["tasks", "manual", "records"].includes(String(raw.source))
      ? (raw.source as GoalSource)
      : "manual",
  };
}

function readPlan(value: string): StoredPlan {
  try {
    const parsed = JSON.parse(value);
    if (parsed?.version === 1 && Array.isArray(parsed.goals))
      return {
        version: 1,
        goals: parsed.goals.map(normaliseGoal),
        reflection_priorities: parsed.reflection_priorities || "",
      };
  } catch {
    // A legacy free-text priorities field is preserved as context, never as goals.
  }
  return { ...emptyPlan, reflection_priorities: value || "" };
}

export default function Goals() {
  const { data, today, create, update, toast } = useApp();
  const [week, setWeek] = useState(weekStart(today));
  const end = addDays(week, 6);
  const review = data.weekly_reviews.find((x) => x.week_start === week);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = readPlan(review?.priorities || "");
    setGoals(saved.goals);
    setReflection(saved.reflection_priorities);
  }, [week, review?.id, review?.updated_at]);

  const tasks = useMemo(
    () =>
      data.tasks.filter(
        (t) => t.due_date && t.due_date >= week && t.due_date <= end,
      ),
    [data.tasks, week, end],
  );

  const progress = (goal: Goal) => {
    if (goal.source === "records") return goal.current;
    const linked = goal.task_ids
      .map((id) => tasks.find((t) => t.id === id))
      .filter(Boolean);
    if (linked.length)
      return linked.filter((t) => t?.status === "done").length;
    return goal.current;
  };

  function patch(id: string, changes: Partial<Goal>) {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...changes } : g)),
    );
  }

  function addGoal() {
    setGoals((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: "New weekly goal",
        target: 1,
        current: 0,
        unit: "outcomes",
        task_ids: [],
        notes: "",
        source: "manual",
      },
    ]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const priorities = JSON.stringify({
      version: 1,
      goals,
      reflection_priorities: reflection,
    });
    try {
      if (review) await update("weekly_reviews", review.id, { priorities });
      else
        await create("weekly_reviews", {
          week_start: week,
          wins: "",
          blockers: "",
          lessons: "",
          priorities,
        });
      toast("Weekly goals saved.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to save weekly goals.", "error");
    } finally {
      setSaving(false);
    }
  }

  const total = goals.reduce(
    (sum, g) => sum + Math.min(progress(g), g.target),
    0,
  );
  const target = goals.reduce((sum, g) => sum + g.target, 0);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="PLAN THE WEEK. CONNECT THE WORK."
        title="Weekly Goals"
        description="Turn monthly outcomes into clear weekly targets, then connect the tasks that move each goal forward."
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
          <span className="overline">MONTHLY → WEEKLY → DAILY</span>
          <h2>{total} of {target} tracked units completed</h2>
          <p>
            Reporting period {week} to {end}. Sales, revenue, publishing and
            outreach must come from their specialist-module records, never from
            ticking a task.
          </p>
        </div>
        <span className="review-intro-icon">
          <Target size={24} />
        </span>
      </section>

      {goals.length === 0 && (
        <div className="panel" style={{ padding: 24, display: "grid", gap: 12 }}>
          <SectionHeading
            title="No weekly goals yet"
            sub="Start with one outcome for this week. You can link it to a monthly goal and to daily tasks later."
          />
          <Button type="button" variant="primary" icon={Plus} onClick={addGoal}>
            Add your first weekly goal
          </Button>
        </div>
      )}

      <form
        onSubmit={save}
        className="panel"
        style={{ padding: 24, display: "grid", gap: 18 }}
      >
        <SectionHeading
          title="This week's outcomes"
          sub="Adjust targets and link the tasks you already have. Choose the source of truth for each goal."
        />
        {goals.map((goal) => {
          const done = progress(goal);
          const pct = goal.target
            ? Math.min(100, Math.round((done / goal.target) * 100))
            : 0;
          const recordBacked = goal.source === "records";
          return (
            <div
              key={goal.id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 14,
                padding: 16,
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <strong>{goal.title}</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove goal"
                  onClick={() =>
                    setGoals((prev) => prev.filter((g) => g.id !== goal.id))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <input
                aria-label="Goal title"
                value={goal.title}
                onChange={(e) => patch(goal.id, { title: e.target.value })}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                  gap: 10,
                }}
              >
                <label>
                  Target
                  <input
                    type="number"
                    min="1"
                    value={goal.target}
                    onChange={(e) =>
                      patch(goal.id, {
                        target: Math.max(1, Number(e.target.value)),
                      })
                    }
                  />
                </label>
                <label>
                  Actual
                  <input
                    type="number"
                    min="0"
                    value={done}
                    disabled={goal.source === "tasks" && goal.task_ids.length > 0}
                    onChange={(e) =>
                      patch(goal.id, {
                        current: Math.max(0, Number(e.target.value)),
                      })
                    }
                  />
                </label>
                <label>
                  Unit
                  <input
                    value={goal.unit}
                    onChange={(e) => patch(goal.id, { unit: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Source of truth
                <select
                  value={goal.source}
                  onChange={(e) =>
                    patch(goal.id, {
                      source: e.target.value as GoalSource,
                      task_ids:
                        e.target.value === "records" ? [] : goal.task_ids,
                    })
                  }
                >
                  <option value="manual">Manually recorded</option>
                  <option value="tasks">Linked completed tasks</option>
                  <option value="records">Specialist-module records</option>
                </select>
              </label>
              <div
                style={{
                  height: 7,
                  background: "var(--surface-muted)",
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: pct + "%",
                    background: "var(--accent)",
                    borderRadius: 99,
                  }}
                />
              </div>
              <small style={{ color: "var(--muted)" }}>
                {done} / {goal.target} {goal.unit} · {pct}% ·{" "}
                {sourceLabel[goal.source]}
              </small>
              {!recordBacked && (
                <label>
                  Link existing weekly tasks (optional)
                  <select
                    multiple
                    value={goal.task_ids}
                    onChange={(e) =>
                      patch(goal.id, {
                        task_ids: Array.from(e.target.selectedOptions).map(
                          (o) => o.value,
                        ),
                        source: "tasks",
                      })
                    }
                    style={{ minHeight: 90 }}
                  >
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.status}
                      </option>
                    ))}
                  </select>
                  <small>
                    A linked task contributes once when it is completed. Use
                    “Specialist-module records” for sales, revenue, publishing
                    or outreach.
                  </small>
                </label>
              )}
              <label>
                Notes
                <textarea
                  rows={2}
                  value={goal.notes}
                  onChange={(e) => patch(goal.id, { notes: e.target.value })}
                />
              </label>
            </div>
          );
        })}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Button type="button" variant="secondary" icon={Plus} onClick={addGoal}>
            Add a goal
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save weekly goals"}
          </Button>
        </div>
        <label>
          Other priorities / context
          <textarea
            rows={3}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="Anything else to remember about this week…"
          />
        </label>
      </form>
    </div>
  );
}
