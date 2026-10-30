import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Clock3,
  Crosshair,
  Headphones,
  LayoutGrid,
  ListTodo,
  Plus,
  Radio,
  Sparkles,
  TrendingUp,
  UsersRound,
  Zap,
} from "lucide-react";
import { asRecord, useApp } from "../lib/store";
import {
  displayDate,
  displayMonth,
  getTime,
  greeting,
  weekdayNames,
} from "../lib/date";
import { currency, cycleMetrics, isOpenTask, percentage } from "../lib/metrics";
import {
  Button,
  Checkbox,
  EmptyState,
  MetricCard,
  Pill,
  SectionHeading,
  TextLink,
} from "../components/UI";
import type { Page, Task } from "../types";

export default function Dashboard() {
  const { data, cycle, today, setPage, openForm, update, toast } = useApp();
  const [time, setTime] = useState(() => getTime(data.settings.timezone));
  useEffect(() => {
    setTime(getTime(data.settings.timezone));
    const timer = window.setInterval(
      () => setTime(getTime(data.settings.timezone)),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [data.settings.timezone]);
  const metrics = cycleMetrics(data, cycle, today);
  const dayPct = percentage(metrics.done, metrics.tasks.length);
  const firstName = data.settings.name.trim().split(/\s+/)[0] || "there";
  const priorities = [...metrics.tasks]
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.priority] - rank[b.priority] || a.sort_order - b.sort_order;
    })
    .slice(0, 3);
  const activeProjects = data.projects
    .filter((project) => project.stage !== "Completed")
    .slice(0, 3);
  const upcomingSession = data.chapter_sessions
    .filter((item) => item.session_date >= today && item.status !== "Archived")
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
    .slice(0, 3);
  async function toggle(task: Task) {
    try {
      await update("tasks", task.id, {
        status: task.status === "done" ? "todo" : "done",
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update task.", "error");
    }
  }
  const progressBackground = `conic-gradient(var(--accent-strong) ${dayPct * 3.6}deg, var(--progress-ring) 0deg)`;
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
      <div className="welcome-row">
        <div>
          <div className="welcome-date">
            <span className="live-dot" />{" "}
            {displayDate(today, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).toUpperCase()}{" "}
            <span className="date-divider">/</span> {time.toUpperCase()}{" "}
            <span className="date-zone">
              {data.settings.timezone === "Africa/Lagos"
                ? "WAT"
                : data.settings.timezone}
            </span>
          </div>
          <h1>
            {greeting(data.settings.timezone)}, {firstName}
            <span className="welcome-period">.</span>
          </h1>
          <p>Here’s what’s happening in your workspace today.</p>
        </div>
        <Button icon={Plus} onClick={() => openForm("task")}>
          Add a task
        </Button>
      </div>

      <section className="hero-card">
        <div className="hero-content">
          <div className="hero-kicker">
            <span className="hero-kicker-icon">
              <Sparkles size={13} />
            </span>{" "}
            YOUR OPERATING CYCLE <span className="kicker-separator">/</span>{" "}
            {displayMonth(cycle.month).toUpperCase()}
          </div>
          <h2>
            One system. <span>Every ambition.</span>
          </h2>
          <p>
            {cycle.objective ||
              "Set an objective for this cycle and give your work a clear direction."}
          </p>
          <div className="hero-actions">
            <Button variant="primary" onClick={() => setPage("day")}>
              Plan my day <ArrowRight size={15} />
            </Button>
            <button
              className="hero-secondary"
              onClick={() => openForm("cycle", asRecord(cycle))}
            >
              View cycle goals <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="hero-theme">
            <span className="theme-indicator" />
            <span>MONTHLY THEME</span>
            <strong>{cycle.theme || "Set a theme"}</strong>
          </div>
        </div>
        <div
          className="hero-art"
          aria-label={`${dayPct}% of today’s planned tasks completed`}
        >
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="orbit-star orbit-star-one" />
          <div className="orbit-star orbit-star-two" />
          <div
            className="progress-orbit"
            style={{ background: progressBackground }}
          >
            <div className="progress-orbit-inner">
              <span>TODAY’S PROGRESS</span>
              <strong>
                {dayPct}
                <small>%</small>
              </strong>
              <em>
                {metrics.done} of {metrics.tasks.length} tasks done
              </em>
            </div>
          </div>
          <div className="orbit-tag">
            <span className="tag-icon">
              <Zap size={14} />
            </span>
            <span>
              <strong>Keep showing up</strong>
              <small>Progress over perfection</small>
            </span>
          </div>
        </div>
      </section>

      <div className="overview-heading">
        <div>
          <span className="overline">THE BIG PICTURE</span>
          <h2>
            Your momentum <span>at a glance</span>
          </h2>
        </div>
        <button onClick={() => setPage("settings")}>
          Cycle settings <ArrowUpRight size={14} />
        </button>
      </div>
      <section className="metrics-grid" aria-label="Progress overview">
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
          detail={
            <>
              <span className="detail-dot accent" /> Paid sales this cycle
            </>
          }
          progress={percentage(metrics.sales, cycle.sales_target)}
          onClick={() => setPage("course")}
        />
        <MetricCard
          icon={TrendingUp}
          iconTone="green"
          label="Revenue"
          value={currency(metrics.revenue)}
          detail={<>of {currency(cycle.revenue_target)} target</>}
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
          detail={
            <>
              <span className="detail-dot secondary" /> Outreach actions today
            </>
          }
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
          detail={
            <>
              <span className="detail-dot highlight" /> Completed this week
            </>
          }
          progress={percentage(metrics.projectsDone, cycle.projects_target)}
          onClick={() => setPage("studio")}
        />
      </section>

      <section className="panel goal-engine-panel">
        <div className="section-heading">
          <div>
            <span className="overline">GOAL ENGINE</span>
            <h2>Your targets, translated into execution</h2>
            <p className="muted">The monthly cycle sets the destination. Daily plans and weekly routines move it forward.</p>
          </div>
          <button className="plain-action" onClick={() => openForm("cycle", asRecord(cycle))}>Edit monthly goals <ArrowUpRight size={14} /></button>
        </div>
        <div className="goal-engine-grid">
          <div className="goal-engine-item">
            <div className="row-between"><strong>Course sales</strong><b>{metrics.sales} / {cycle.sales_target}</b></div>
            <div className="progress"><span style={{width: `${percentage(metrics.sales, cycle.sales_target)}%`}} /></div>
            <small>{Math.max(0, cycle.sales_target - metrics.sales)} sales remaining · weekly pace about {Math.ceil(cycle.sales_target / 4.35)}</small>
          </div>
          <div className="goal-engine-item">
            <div className="row-between"><strong>Revenue</strong><b>{currency(metrics.revenue)} / {currency(cycle.revenue_target)}</b></div>
            <div className="progress"><span style={{width: `${percentage(metrics.revenue, cycle.revenue_target)}%`}} /></div>
            <small>{currency(Math.max(0, cycle.revenue_target - metrics.revenue))} remaining</small>
          </div>
          <div className="goal-engine-item">
            <div className="row-between"><strong>Client outreach</strong><b>{cycle.outreach_target} actions / day</b></div>
            <div className="progress"><span style={{width: `${percentage(metrics.outreach, cycle.outreach_target)}%`}} /></div>
            <small>{metrics.outreach} logged today · target {cycle.outreach_target}</small>
          </div>
          <div className="goal-engine-item">
            <div className="row-between"><strong>Creative production</strong><b>{cycle.projects_target} projects / week</b></div>
            <div className="progress"><span style={{width: `${percentage(metrics.projectsDone, cycle.projects_target)}%`}} /></div>
            <small>{metrics.projectsDone} completed this week</small>
          </div>
          <div className="goal-engine-item">
            <div className="row-between"><strong>Next Chapter editorial</strong><b>{cycle.chapter_content_target} pieces / week</b></div>
            <div className="progress"><span style={{width: `${percentage(data.content_items.filter(item => item.cycle_id === cycle.id && ["Published","Distributed","Approved","Scheduled"].includes(item.status) && item.planned_date && item.planned_date >= today.slice(0, 8) + "01").length, cycle.chapter_content_target)}%`}} /></div>
            <small>Track the two weekly editorial pieces in your content library</small>
          </div>
          <div className="goal-engine-item">
            <div className="row-between"><strong>Friday live session</strong><b>{weekdayNames[cycle.session_day]}</b></div>
            <small>Plan the session, confirm the guest seven days ahead, and prepare promotion and delivery.</small>
          </div>
        </div>
      </section>

      <div className="dashboard-columns">
        <section className="panel priority-panel">
          <SectionHeading
            title="Today’s priorities"
            sub="A little focus goes a long way."
            action={
              <TextLink onClick={() => setPage("day")}>View my day</TextLink>
            }
          />
          <div className="priority-list">
            {priorities.length ? (
              priorities.map((task, index) => (
                <div className="priority-row" key={task.id}>
                  <span className="priority-number">0{index + 1}</span>
                  <Checkbox
                    checked={task.status === "done"}
                    onChange={() => toggle(task)}
                    label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
                  />
                  <button
                    className={`task-title-button ${task.status === "done" ? "completed" : ""}`}
                    onClick={() => openForm("task", asRecord(task))}
                  >
                    <strong>{task.title}</strong>
                    <small>
                      {task.category}{" "}
                      {task.estimated_minutes > 0 && (
                        <>
                          {" "}
                          <span>·</span> {task.estimated_minutes} min
                        </>
                      )}
                    </small>
                  </button>
                  <Pill tone={task.priority === "high" ? "accent" : "neutral"}>
                    {task.priority === "high"
                      ? "High priority"
                      : task.priority === "medium"
                        ? "Medium"
                        : "Low"}
                  </Pill>
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
                    Add your first task
                  </Button>
                }
              />
            )}
          </div>
          <button className="panel-bottom-link" onClick={() => setPage("day")}>
            <span>
              <span className="bottom-link-icon">
                <CheckCircle2 size={15} />
              </span>
              {metrics.done} of {metrics.tasks.length} tasks completed today
            </span>
            <span>
              Open daily plan <ArrowRight size={14} />
            </span>
          </button>
        </section>
        <div className="dashboard-side">
          <section className="panel chapter-card">
            <div className="chapter-head">
              <div>
                <div className="mini-overline">
                  <span /> NEXT CHAPTER
                </div>
                <h2>
                  A conversation about
                  <br />
                  the future of creativity.
                </h2>
              </div>
              <span className="chapter-icon">
                <Radio size={20} />
              </span>
            </div>
            <div className="chapter-divider" />
            {upcomingSession ? (
              <div className="chapter-next">
                <div className="session-date">
                  <strong>
                    {displayDate(upcomingSession.session_date, {
                      day: "numeric",
                    })}
                  </strong>
                  <span>
                    {displayDate(upcomingSession.session_date, {
                      month: "short",
                    }).toUpperCase()}
                  </span>
                </div>
                <div>
                  <span>NEXT SESSION</span>
                  <strong>{upcomingSession.title}</strong>
                  <small>
                    {upcomingSession.guest
                      ? `With ${upcomingSession.guest}`
                      : upcomingSession.status}
                  </small>
                </div>
                <button
                  aria-label="Open Next Chapter"
                  onClick={() => setPage("chapter")}
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
            ) : (
              <div className="chapter-empty">
                <div>
                  <strong>No session planned yet</strong>
                  <span>
                    Weekly rhythm · {weekdayNames[cycle.session_day]}s
                  </span>
                </div>
                <button onClick={() => openForm("session")}>
                  Plan session <ArrowRight size={14} />
                </button>
              </div>
            )}
          </section>
          <section className="panel upcoming-panel">
            <SectionHeading
              title="Coming up"
              sub="Deadlines and follow-ups."
              action={<CalendarClock size={17} className="muted-icon" />}
            />
            {followups.length ? (
              <div className="upcoming-list">
                {followups.map((item) => (
                  <button
                    key={`${item.page}-${item.id}`}
                    onClick={() => setPage(item.page)}
                  >
                    <span className="upcoming-date">
                      <strong>
                        {displayDate(item.date, { day: "numeric" })}
                      </strong>
                      <small>
                        {displayDate(item.date, {
                          month: "short",
                        }).toUpperCase()}
                      </small>
                    </span>
                    <span>
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
              <div className="upcoming-empty">
                <span className="upcoming-empty-icon">
                  <CalendarClock size={17} />
                </span>
                <span>
                  <strong>All clear for now</strong>
                  <small>Upcoming dates will appear here.</small>
                </span>
              </div>
            )}
          </section>
        </div>
      </div>
      {activeProjects.length > 0 && (
        <section className="panel dashboard-projects">
          <SectionHeading
            title="Creative work in progress"
            sub="Your active projects and their current stages."
            action={
              <TextLink onClick={() => setPage("studio")}>Open studio</TextLink>
            }
          />
          <div className="dashboard-project-list">
            {activeProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => openForm("project", asRecord(project))}
              >
                <span className="record-icon highlight">
                  <Clapperboard size={16} />
                </span>
                <span>
                  <strong>{project.title}</strong>
                  <small>
                    {project.stage}
                    {project.deadline &&
                      ` · Due ${displayDate(project.deadline)}`}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="workspace-strip">
        <div className="workspace-strip-title">
          <span className="workspace-strip-icon">
            <LayoutGrid size={17} />
          </span>
          <span>
            <strong>Everything, in one place.</strong>
            <small>Pick up wherever you left off.</small>
          </span>
        </div>
        <div className="workspace-shortcuts">
          <button onClick={() => setPage("studio")}>
            <Clapperboard size={16} />
            <span>Creative Studio</span>
            <ChevronRight size={14} />
          </button>
          <button onClick={() => setPage("brand")}>
            <Sparkles size={16} />
            <span>Content library</span>
            <ChevronRight size={14} />
          </button>
          <button onClick={() => setPage("review")}>
            <Crosshair size={16} />
            <span>Weekly review</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
