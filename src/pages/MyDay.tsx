import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Focus,
  ListTodo,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { asRecord, useApp } from "../lib/store";
import { addDays, displayDate } from "../lib/date";
import { dayTasks, isOpenTask, percentage } from "../lib/metrics";
import type { Task } from "../types";
import {
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  PageHeader,
  Pill,
  Progress,
  SectionHeading,
} from "../components/UI";

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ""}` : `${minutes}m`;
}
export default function MyDay() {
  const { data, cycle, today, openForm, update, create, batchUpdate, toast } =
    useApp();
  const [day, setDay] = useState(today);
  const [focus, setFocus] = useState(false);
  const [saving, setSaving] = useState(false);
  const note = data.daily_notes.find((item) => item.day === day);
  const [notes, setNotes] = useState({
    wins: "",
    blockers: "",
    lessons: "",
    tomorrow: "",
  });
  useEffect(() => {
    setNotes({
      wins: note?.wins || "",
      blockers: note?.blockers || "",
      lessons: note?.lessons || "",
      tomorrow: note?.tomorrow || "",
    });
  }, [day, note?.id, note?.updated_at]);
  const tasks = dayTasks(data, day);
  const done = tasks.filter((task) => task.status === "done").length;
  const open = tasks.filter(isOpenTask);
  const totalMinutes = tasks
    .filter((task) => task.status !== "cancelled")
    .reduce((sum, task) => sum + task.estimated_minutes, 0);
  const priorities = tasks
    .filter((task) => task.priority === "high")
    .slice(0, 3);
  const priorityIds = new Set(priorities.map((task) => task.id));
  const others = tasks.filter((task) => !priorityIds.has(task.id));
  const unscheduled = data.tasks.filter(
    (task) => !task.due_date && isOpenTask(task),
  );
  const workMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const available = Math.max(
    0,
    workMinutes(data.settings.work_end) - workMinutes(data.settings.work_start),
  );
  const scheduled = tasks
    .filter((task) => task.scheduled_time)
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  async function patch(task: Task, values: Record<string, unknown>) {
    try {
      await update("tasks", task.id, values);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to update task.", "error");
    }
  }
  async function move(task: Task, direction: -1 | 1) {
    const index = tasks.findIndex((item) => item.id === task.id);
    const to = index + direction;
    if (to < 0 || to >= tasks.length) return;
    const reordered = [...tasks];
    [reordered[index], reordered[to]] = [reordered[to], reordered[index]];
    try {
      await batchUpdate(
        "tasks",
        reordered.map((item, i) => ({ id: item.id, data: { sort_order: i } })),
      );
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Unable to reorder tasks.",
        "error",
      );
    }
  }
  async function carry() {
    if (
      !open.length ||
      !window.confirm(
        `Move ${open.length} unfinished task${open.length === 1 ? "" : "s"} to ${displayDate(addDays(day, 1))}?`,
      )
    )
      return;
    try {
      await batchUpdate(
        "tasks",
        open.map((task) => ({
          id: task.id,
          data: { due_date: addDays(day, 1) },
        })),
      );
      toast("Unfinished tasks moved to the next day.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to move tasks.", "error");
    }
  }
  async function saveNotes(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (note) await update("daily_notes", note.id, notes);
      else await create("daily_notes", { day, ...notes });
      toast("Daily reflection saved.");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Unable to save reflection.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }
  const addTask = () =>
    openForm("task", undefined, {
      due_date: day,
      cycle_id: day.startsWith(cycle.month) ? cycle.id : "",
    });
  const renderTask = (task: Task, index: number) => (
    <div
      className={`day-task ${task.status === "done" ? "is-done" : ""}`}
      key={task.id}
    >
      <Checkbox
        checked={task.status === "done"}
        label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
        onChange={() =>
          patch(task, { status: task.status === "done" ? "todo" : "done" })
        }
      />
      <button
        className="day-task-main"
        onClick={() => openForm("task", asRecord(task))}
      >
        <strong>{task.title}</strong>
        <span>
          <span
            className={`category-dot ${task.category === "Course Growth" ? "green" : task.category === "Creative Studio" ? "orange" : task.category === "Client Pipeline" ? "purple" : "blue"}`}
          />
          {task.category}
          {task.scheduled_time && (
            <>
              {" "}
              <i>·</i> {task.scheduled_time}
            </>
          )}
          {task.estimated_minutes > 0 && (
            <>
              {" "}
              <i>·</i> {formatMinutes(task.estimated_minutes)}
            </>
          )}
          {task.actual_minutes > 0 && (
            <>
              {" "}
              <i>·</i> {formatMinutes(task.actual_minutes)} actual
            </>
          )}
        </span>
      </button>
      <Pill tone={task.priority === "high" ? "blue" : "neutral"}>
        {task.priority}
      </Pill>
      <div className="task-actions">
        <IconButton
          icon={ArrowUp}
          label="Move task up"
          onClick={() => move(task, -1)}
          disabled={index === 0}
        />
        <IconButton
          icon={ArrowDown}
          label="Move task down"
          onClick={() => move(task, 1)}
          disabled={index === tasks.length - 1}
        />
        <IconButton
          icon={CalendarClock}
          label="Move to tomorrow"
          onClick={() => patch(task, { due_date: addDays(day, 1) })}
        />
        <IconButton
          icon={Pencil}
          label="Edit task"
          onClick={() => openForm("task", asRecord(task))}
        />
      </div>
    </div>
  );
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="YOUR DAILY WORKSPACE"
        title="My Day"
        description="Make a little space for your most important work."
        actions={
          <>
            <Button icon={Focus} onClick={() => setFocus(!focus)}>
              {focus ? "Exit focus" : "Focus mode"}
            </Button>
            <Button variant="primary" icon={Plus} onClick={addTask}>
              Add task
            </Button>
          </>
        }
      />
      <div className="day-toolbar">
        <div className="day-date">
          <span className="day-date-icon">
            <CalendarDays size={18} />
          </span>
          <div>
            <strong>
              {day === today ? "Today" : displayDate(day, { weekday: "long" })}
            </strong>
            <span>
              {displayDate(day, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
        <div className="day-nav">
          <IconButton
            icon={ChevronLeft}
            label="Previous day"
            onClick={() => setDay(addDays(day, -1))}
          />
          <button
            onClick={() => setDay(today)}
            className={day === today ? "current" : ""}
          >
            Today
          </button>
          <IconButton
            icon={ChevronRight}
            label="Next day"
            onClick={() => setDay(addDays(day, 1))}
          />
        </div>
      </div>
      <div className={`day-layout ${focus ? "focus-layout" : ""}`}>
        <div className="day-main">
          <section className="panel day-progress-card">
            <div>
              <span className="overline">DAILY PROGRESS</span>
              <h2>
                {done === tasks.length && tasks.length > 0
                  ? "A day well spent."
                  : "Progress, one task at a time."}
              </h2>
              <p>
                {done} completed <span>·</span> {tasks.length - done} remaining
              </p>
            </div>
            <div className="day-progress-right">
              <strong>
                {percentage(done, tasks.length)}
                <small>%</small>
              </strong>
              <Progress value={percentage(done, tasks.length)} />
            </div>
          </section>
          <section className="panel task-panel">
            <SectionHeading
              title="Priority outcomes"
              sub="The important things you want to move forward."
              action={<Pill tone="blue">{priorities.length} / 3</Pill>}
            />
            <div className="day-task-list">
              {priorities.length ? (
                priorities.map((task) =>
                  renderTask(
                    task,
                    tasks.findIndex((item) => item.id === task.id),
                  ),
                )
              ) : (
                <EmptyState
                  icon={Focus}
                  title="Choose what matters most"
                  text="Set a task to high priority to bring it into focus."
                  action={
                    <Button variant="ghost" icon={Plus} onClick={addTask}>
                      Add a priority
                    </Button>
                  }
                />
              )}
            </div>
          </section>
          {!focus && (
            <>
              <section className="panel task-panel">
                <SectionHeading
                  title="Your plan"
                  sub="Everything else on your list for this day."
                  action={
                    <button className="plain-action" onClick={addTask}>
                      <Plus size={15} /> Add task
                    </button>
                  }
                />
                <div className="day-task-list">
                  {others.length ? (
                    others.map((task) =>
                      renderTask(
                        task,
                        tasks.findIndex((item) => item.id === task.id),
                      ),
                    )
                  ) : (
                    <div className="inline-empty">
                      Your list is clear. Add a task when you’re ready.
                    </div>
                  )}
                </div>
                {open.length > 0 && (
                  <div className="task-panel-footer">
                    <span>Plans change. Adjust them when you need to.</span>
                    <button onClick={carry}>
                      Carry unfinished forward <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </section>
              {unscheduled.length > 0 && (
                <section className="panel task-panel">
                  <SectionHeading
                    title="Unscheduled"
                    sub="Give these tasks a day when you are ready."
                  />
                  <div className="day-task-list">
                    {unscheduled.map((task) => (
                      <div className="unscheduled-row" key={task.id}>
                        <span>
                          {task.title}
                          <small>{task.category}</small>
                        </span>
                        <Button onClick={() => patch(task, { due_date: day })}>
                          Plan for this day
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="panel reflection-panel">
                <SectionHeading
                  title="Daily reflection"
                  sub="A moment to notice what worked and what comes next."
                />
                <form onSubmit={saveNotes} className="reflection-form">
                  <div className="reflection-grid">
                    <label>
                      Today’s wins
                      <textarea
                        rows={3}
                        placeholder="What went well?"
                        value={notes.wins}
                        onChange={(event) =>
                          setNotes({ ...notes, wins: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Blockers
                      <textarea
                        rows={3}
                        placeholder="What got in the way?"
                        value={notes.blockers}
                        onChange={(event) =>
                          setNotes({ ...notes, blockers: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Lessons
                      <textarea
                        rows={3}
                        placeholder="What did you learn?"
                        value={notes.lessons}
                        onChange={(event) =>
                          setNotes({ ...notes, lessons: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Tomorrow’s first action
                      <textarea
                        rows={3}
                        placeholder="Start tomorrow with…"
                        value={notes.tomorrow}
                        onChange={(event) =>
                          setNotes({ ...notes, tomorrow: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="reflection-footer">
                    <span>Only you can see your reflections.</span>
                    <Button type="submit" variant="primary" disabled={saving}>
                      {saving ? "Saving…" : "Save reflection"}
                    </Button>
                  </div>
                </form>
              </section>
            </>
          )}
        </div>
        {!focus && (
          <aside className="day-aside">
            <section className="panel time-card">
              <div className="aside-icon">
                <Clock3 size={19} />
              </div>
              <span className="overline">MAKE TIME FOR THE WORK</span>
              <h2>Your time budget</h2>
              <p>Plan with your available hours in mind.</p>
              <div className="time-total">
                <strong>{formatMinutes(totalMinutes)}</strong>
                <span>planned</span>
              </div>
              <Progress
                value={percentage(totalMinutes, available)}
                color={totalMinutes > available ? "orange" : "blue"}
              />
              <div className="time-caption">
                <span>
                  {data.settings.work_start} – {data.settings.work_end}
                </span>
                <span>{formatMinutes(available)} available</span>
              </div>
              {totalMinutes > available && (
                <p className="time-warning">
                  You’ve planned more time than your work window. Consider
                  adjusting your day.
                </p>
              )}
            </section>
            <section className="panel schedule-card">
              <SectionHeading
                title="Timeboxes"
                sub="Only tasks with a chosen time appear here."
              />
              <div className="schedule-list">
                {scheduled.length ? (
                  scheduled.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => openForm("task", asRecord(task))}
                    >
                      <span>{task.scheduled_time}</span>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          {task.estimated_minutes
                            ? formatMinutes(task.estimated_minutes)
                            : "No duration set"}
                        </small>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="schedule-empty">
                    <div className="schedule-line" />
                    <span>
                      No timeboxes yet.
                      <br />
                      Add a start time to a task to see it here.
                    </span>
                  </div>
                )}
              </div>
            </section>
            <div className="day-quote">
              <span>
                <Sparkles size={17} />
              </span>
              <p>
                “Small steps, consistently taken, create meaningful momentum.”
              </p>
              <small>A NOTE TO YOURSELF</small>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
