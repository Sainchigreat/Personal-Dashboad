import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  ListTodo,
  Plus,
  Radio,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { asRecord, useApp } from "../lib/store";
import { displayDate, displayMonth, greeting, weekdayNames } from "../lib/date";
import {
  currency,
  cycleMetrics,
  isOpenTask,
  percentage,
  projectOverview,
} from "../lib/metrics";
import {
  Button,
  Checkbox,
  EmptyState,
  MetricCard,
  SectionHeading,
  TextLink,
} from "../components/UI";
import type { Page, Task } from "../types";

function taskTone(category: string) {
  if (category === "Course Growth") return "lavender";
  if (category === "Client Pipeline") return "peach";
  if (category === "Creative Studio") return "mint";
  if (category === "Next Chapter") return "yellow";
  return "neutral";
}

export default function Dashboard() {
  const { data, cycle, today, setPage, openForm, update, toast } = useApp();
  const [salutation, setSalutation] = useState(() =>
    greeting(data.settings.timezone),
  );
  useEffect(() => {
    const updateGreeting = () =>
      setSalutation(greeting(data.settings.timezone));
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, [data.settings.timezone]);
  const metrics = cycleMetrics(data, cycle, today);
  const firstName = data.settings.name.trim().split(/\s+/)[0] || "there";
  const priorities = [...metrics.tasks]
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.priority] - rank[b.priority] || a.sort_order - b.sort_order;
    })
    .slice(0, 4);
  const {
    active: activeProjects,
    completed: completedProjects,
    total: totalProjects,
    activePercent,
  } = projectOverview(data.projects);
  const projectRing = totalProjects
    ? `conic-gradient(var(--chart-active) 0% ${activePercent}%, var(--chart-completed) ${activePercent}% 100%)`
    : "var(--progress-ring)";
  const upcomingSession = data.chapter_sessions
    .filter(
      (item) =>
        item.session_date >= today &&
        !["Completed", "Archived"].includes(item.status),
    )
    .sort((a, b) => a.session_date.localeCompare(b.session_date))[0];
  const followups = [
    ...data.prospects
      .filter(
        (item) =>
          item.follow_up_date &&
          !["Won", "Lost", "Not a fit"].includes(item.status),
      )
      .map((item) => ({
        id: item.id,
        title: item.company,
        date: item.follow_up_date!,
        category: "Prospect follow-up",
        page: "pipeline" as Page,
      })),
    ...data.leads
      .filter(
        (item) =>
          item.follow_up_date &&
          !["Converted", "Not interested"].includes(item.status),
      )
      .map((item) => ({
        id: item.id,
        title: item.name,
        date: item.follow_up_date!,
        category: "Course enquiry",
        page: "course" as Page,
      })),
    ...data.projects
      .filter((item) => item.deadline && item.stage !== "Completed")
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.deadline!,
        category: "Project deadline",
        page: "studio" as Page,
      })),
    ...data.tasks
      .filter(
        (item) => item.due_date && item.due_date > today && isOpenTask(item),
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.due_date!,
        category: "Task",
        page: "day" as Page,
      })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  async function toggle(task: Task) {
    try {
      await update("tasks", task.id, {
        status: task.status === "done" ? "todo" : "done",
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update task.", "error");
    }
  }

  return (
    <div className="dashboard-page">
      {cycle.status === "active" && today.slice(0, 7) > cycle.month && (
        <div className="rollover-prompt">
          <span>
            <CalendarClock size={17} />
            <span>
              <strong>A new month is here.</strong> Your previous cycle is safe.
              Set up your next one when you’re ready.
            </span>
          </span>
          <button onClick={() => openForm("rollover")}>
            Start a new cycle <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div className="dashboard-welcome">
        <div>
          <div className="dashboard-date">
            <span className="live-dot" />
            <time dateTime={today}>
              {displayDate(today, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </time>
          </div>
          <h1>
            {salutation}, {firstName}.
          </h1>
          <p>A little clarity for everything you’re working towards.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => openForm("task")}>
          Add a task
        </Button>
      </div>

      <div className="dashboard-section-title">
        <div>
          <span className="overline">YOUR WORKSPACE</span>
          <h2>At a glance</h2>
        </div>
        <button
          className="cycle-chip"
          onClick={() => openForm("cycle", asRecord(cycle))}
          aria-label={`Edit ${displayMonth(cycle.month)} cycle`}
        >
          <CalendarDays size={15} />
          <span>{displayMonth(cycle.month)}</span>
          <ChevronRight size={14} />
        </button>
      </div>
      <section
        className="metrics-grid dashboard-metrics"
        aria-label="Progress overview"
      >
        <MetricCard
          icon={CircleDollarSign}
          iconTone="accent"
          label="Course sales"
          value={
            <>
              {metrics.sales}
              <span> / {cycle.sales_target}</span>
            </>
          }
          detail="Paid sales this cycle"
          progress={percentage(metrics.sales, cycle.sales_target)}
          onClick={() => setPage("course")}
        />
        <MetricCard
          icon={TrendingUp}
          iconTone="green"
          label="Revenue"
          value={currency(metrics.revenue)}
          detail={`of ${currency(cycle.revenue_target)} target`}
          progress={percentage(metrics.revenue, cycle.revenue_target)}
          onClick={() => setPage("course")}
        />
        <MetricCard
          icon={UsersRound}
          iconTone="secondary"
          label="Client outreach"
          value={
            <>
              {metrics.outreach}
              <span> / {cycle.outreach_target}</span>
            </>
          }
          detail="Outreach actions today"
          progress={percentage(metrics.outreach, cycle.outreach_target)}
          onClick={() => setPage("pipeline")}
        />
        <MetricCard
          icon={Clapperboard}
          iconTone="highlight"
          label="Creative projects"
          value={
            <>
              {metrics.projectsDone}
              <span> / {cycle.projects_target}</span>
            </>
          }
          detail="Completed this week"
          progress={percentage(metrics.projectsDone, cycle.projects_target)}
          onClick={() => setPage("studio")}
        />
      </section>

      <div className="dashboard-board">
        <section className="panel dashboard-tasks">
          <SectionHeading
            title="Today’s tasks"
            sub={`${metrics.done} of ${metrics.tasks.length} completed`}
            action={
              <TextLink onClick={() => setPage("day")} arrow={false}>
                View all
              </TextLink>
            }
          />
          <div className="dashboard-task-list">
            {priorities.length ? (
              priorities.map((task) => (
                <div
                  className={`dashboard-task task-${taskTone(task.category)}`}
                  key={task.id}
                >
                  <Checkbox
                    checked={task.status === "done"}
                    onChange={() => toggle(task)}
                    label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
                  />
                  <button
                    className={`dashboard-task-copy ${task.status === "done" ? "completed" : ""}`}
                    onClick={() => openForm("task", asRecord(task))}
                  >
                    <strong>{task.title}</strong>
                    <small>
                      {task.category}
                      {task.estimated_minutes > 0 &&
                        ` · ${task.estimated_minutes} min`}
                    </small>
                  </button>
                  <span className="dashboard-task-priority">
                    {task.status === "done" ? "Done" : task.priority}
                  </span>
                </div>
              ))
            ) : (
              <EmptyState
                icon={ListTodo}
                title="A clear day starts here"
                text="Add a task or choose an outcome to focus on."
                action={
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("task")}
                  >
                    Add a task
                  </Button>
                }
              />
            )}
          </div>
          <button
            className="dashboard-panel-link"
            onClick={() => setPage("day")}
          >
            <span>Open my daily plan</span>
            <ArrowRight size={15} />
          </button>
        </section>

        <div className="dashboard-stack">
          <section className="panel project-overview">
            <SectionHeading
              title="Project overview"
              sub="All projects in your studio"
              action={
                <TextLink onClick={() => setPage("studio")} arrow={false}>
                  View all
                </TextLink>
              }
            />
            <div className="project-overview-body">
              <div
                className="project-ring"
                style={{ background: projectRing }}
                role="img"
                aria-label={`${totalProjects} total projects: ${activeProjects.length} active and ${completedProjects} completed`}
              >
                <div>
                  <strong>{totalProjects}</strong>
                  <span>projects</span>
                </div>
              </div>
              <div className="project-legend">
                <div>
                  <span className="legend-dot active" />
                  <span>Active</span>
                  <strong>{activeProjects.length}</strong>
                </div>
                <div>
                  <span className="legend-dot complete" />
                  <span>Completed</span>
                  <strong>{completedProjects}</strong>
                </div>
              </div>
            </div>
            {activeProjects.length ? (
              <div className="project-preview-list">
                {activeProjects.slice(0, 2).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => openForm("project", asRecord(project))}
                  >
                    <span>
                      <strong>{project.title}</strong>
                      <small>{project.stage}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <button
                className="dashboard-panel-link"
                onClick={() => openForm("project")}
              >
                <span>
                  {totalProjects
                    ? "Start another project"
                    : "Create your first project"}
                </span>
                <Plus size={15} />
              </button>
            )}
          </section>

          <section className="cycle-focus-card">
            <div className="cycle-focus-top">
              <span className="cycle-focus-icon">
                <Sparkles size={17} />
              </span>
              <span>YOUR {displayMonth(cycle.month).toUpperCase()} CYCLE</span>
              <button
                aria-label="Edit cycle goals"
                onClick={() => openForm("cycle", asRecord(cycle))}
              >
                <ArrowUpRight size={16} />
              </button>
            </div>
            <h2>{cycle.theme || "Set your focus"}</h2>
            <p>
              {cycle.objective ||
                "Give this cycle a clear direction by adding an objective."}
            </p>
            <button
              className="cycle-focus-link"
              onClick={() => openForm("cycle", asRecord(cycle))}
            >
              View cycle goals <ArrowRight size={14} />
            </button>
          </section>
        </div>

        <div className="dashboard-stack dashboard-agenda">
          <section className="panel dashboard-upcoming">
            <SectionHeading
              title="Coming up"
              sub="Deadlines and follow-ups"
              action={<CalendarClock size={17} className="muted-icon" />}
            />
            {followups.length ? (
              <div className="dashboard-upcoming-list">
                {followups.map((item) => (
                  <button
                    key={`${item.page}-${item.id}`}
                    onClick={() => setPage(item.page)}
                  >
                    <span className="dashboard-date-tile">
                      <strong>
                        {displayDate(item.date, { day: "numeric" })}
                      </strong>
                      <small>
                        {displayDate(item.date, { month: "short" })}
                      </small>
                    </span>
                    <span className="dashboard-upcoming-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {item.category}
                        {item.date < today ? " · overdue" : ""}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="dashboard-upcoming-empty">
                <span>
                  <CalendarClock size={19} />
                </span>
                <strong>All clear for now</strong>
                <p>Deadlines and follow-ups will appear here.</p>
              </div>
            )}
          </section>

          <section className="next-chapter-card">
            <div className="next-chapter-top">
              <span>
                <Radio size={18} />
              </span>
              <small>NEXT CHAPTER</small>
            </div>
            {upcomingSession ? (
              <>
                <h2>{upcomingSession.title}</h2>
                <p>
                  {displayDate(upcomingSession.session_date)}
                  {upcomingSession.guest
                    ? ` · With ${upcomingSession.guest}`
                    : ` · ${upcomingSession.status}`}
                </p>
                <button onClick={() => setPage("chapter")}>
                  Open Next Chapter <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                <h2>Make space for the next conversation.</h2>
                <p>
                  No session planned yet · Weekly rhythm:{" "}
                  {weekdayNames[cycle.session_day]}s
                </p>
                <button onClick={() => openForm("session")}>
                  Plan a session <ArrowRight size={14} />
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
