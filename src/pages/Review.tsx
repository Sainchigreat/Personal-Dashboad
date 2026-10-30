import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  FileText,
  Lightbulb,
  MessageCircle,
  Radio,
  Send,
  Target,
  UsersRound,
} from "lucide-react";
import { useApp } from "../lib/store";
import {
  addDays,
  displayDate,
  inRange,
  localDateTime,
  weekStart,
} from "../lib/date";
import { currency, isOpenTask, weekMetrics } from "../lib/metrics";
import {
  Button,
  IconButton,
  PageHeader,
  SectionHeading,
} from "../components/UI";

export default function Review() {
  const { data, today, create, update, toast } = useApp();
  const [week, setWeek] = useState(weekStart(today));
  const [saving, setSaving] = useState(false);
  const end = addDays(week, 6);
  const metrics = weekMetrics(data, week);
  const previous = weekMetrics(data, addDays(week, -7));
  const review = data.weekly_reviews.find((item) => item.week_start === week);
  const [notes, setNotes] = useState({
    wins: "",
    blockers: "",
    lessons: "",
    priorities: "",
  });
  useEffect(() => {
    setNotes({
      wins: review?.wins || "",
      blockers: review?.blockers || "",
      lessons: review?.lessons || "",
      priorities: review?.priorities || "",
    });
  }, [week, review?.id, review?.updated_at]);
  const completedTasks = data.tasks.filter(
    (task) =>
      task.status === "done" &&
      inRange(
        localDateTime(task.completed_at, data.settings.timezone),
        week,
        end,
      ),
  );
  const incompleteTasks = data.tasks.filter(
    (task) => isOpenTask(task) && inRange(task.due_date, week, end),
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (review) await update("weekly_reviews", review.id, notes);
      else await create("weekly_reviews", { week_start: week, ...notes });
      toast("Weekly review saved.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to save review.", "error");
    } finally {
      setSaving(false);
    }
  }
  const statItems = [
    {
      label: "Tasks completed",
      value: metrics.done,
      icon: CheckCircle2,
      tone: "blue",
    },
    {
      label: "Tasks incomplete",
      value: metrics.incomplete,
      icon: Target,
      tone: "orange",
    },
    {
      label: "Paid sales",
      value: metrics.sales,
      icon: CircleDollarSign,
      tone: "green",
    },
    {
      label: "Revenue",
      value: currency(metrics.revenue),
      icon: BarChart3,
      tone: "green",
    },
    {
      label: "Prospects researched",
      value: metrics.researched,
      icon: UsersRound,
      tone: "purple",
    },
    {
      label: "Outreach actions",
      value: metrics.outreach,
      icon: Send,
      tone: "blue",
    },
    {
      label: "Replies received",
      value: metrics.replies,
      icon: MessageCircle,
      tone: "purple",
    },
    {
      label: "Calls / proposals",
      value: `${metrics.calls} / ${metrics.proposals}`,
      icon: CalendarDays,
      tone: "orange",
    },
    {
      label: "Projects completed",
      value: metrics.projects,
      icon: Clapperboard,
      tone: "orange",
    },
    {
      label: "Content published",
      value: metrics.published,
      icon: FileText,
      tone: "blue",
    },
    {
      label: "Next Chapter sessions",
      value: metrics.sessions,
      icon: Radio,
      tone: "purple",
    },
  ];
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="PAUSE. REFLECT. RESET."
        title="Weekly Review"
        description="Notice the progress, learn from the work, and plan what comes next."
      />
      <div className="day-toolbar review-toolbar">
        <div className="day-date">
          <span className="day-date-icon">
            <CalendarDays size={18} />
          </span>
          <div>
            <strong>
              {week === weekStart(today) ? "This week" : "Week in review"}
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
          <button
            onClick={() => setWeek(weekStart(today))}
            className={week === weekStart(today) ? "current" : ""}
          >
            This week
          </button>
          <IconButton
            icon={ChevronRight}
            label="Next week"
            onClick={() => setWeek(addDays(week, 7))}
          />
        </div>
      </div>
      <section className="review-intro">
        <div>
          <span className="overline">YOUR WEEK, IN PERSPECTIVE</span>
          <h2>Make the progress visible.</h2>
          <p>Everything below comes from the work you recorded this week.</p>
        </div>
        <span className="review-intro-icon">
          <BarChart3 size={24} />
        </span>
      </section>
      <div className="review-stats">
        {statItems.map((item) => (
          <div className="review-stat" key={item.label}>
            <span className={`metric-icon ${item.tone}`}>
              <item.icon size={16} />
            </span>
            <strong>{item.value}</strong>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
      <div className="review-layout">
        <section className="panel weekly-reflection">
          <SectionHeading
            title="Reflect on your week"
            sub="A little clarity now makes next week easier."
          />
          <form onSubmit={save}>
            <label>
              Major achievements
              <textarea
                rows={4}
                value={notes.wins}
                onChange={(event) =>
                  setNotes({ ...notes, wins: event.target.value })
                }
                placeholder="What are you proud of this week?"
              />
            </label>
            <label>
              Bottlenecks and challenges
              <textarea
                rows={4}
                value={notes.blockers}
                onChange={(event) =>
                  setNotes({ ...notes, blockers: event.target.value })
                }
                placeholder="What slowed you down?"
              />
            </label>
            <label>
              Lessons learned
              <textarea
                rows={4}
                value={notes.lessons}
                onChange={(event) =>
                  setNotes({ ...notes, lessons: event.target.value })
                }
                placeholder="What would you do differently?"
              />
            </label>
            <label>
              Next week’s priorities
              <textarea
                rows={4}
                value={notes.priorities}
                onChange={(event) =>
                  setNotes({ ...notes, priorities: event.target.value })
                }
                placeholder="What deserves your attention next?"
              />
            </label>
            <div className="reflection-footer">
              <span>
                {review
                  ? "Your reflection is saved for this week."
                  : "Your review will be saved to this week."}
              </span>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Saving…" : "Save review"}
              </Button>
            </div>
          </form>
        </section>
        <aside className="module-aside">
          <section className="panel side-panel compact-side">
            <SectionHeading
              title="The work behind the week"
              sub="A closer look at your tasks."
            />
            <div className="review-tasks-heading">
              <span>COMPLETED</span>
              <strong>{completedTasks.length}</strong>
            </div>
            {completedTasks.length ? (
              completedTasks.slice(0, 4).map((task) => (
                <div className="review-task" key={task.id}>
                  <CheckCircle2 size={15} />
                  <span>{task.title}</span>
                </div>
              ))
            ) : (
              <div className="small-empty">
                No completed tasks recorded this week.
              </div>
            )}
            <div className="review-tasks-heading second">
              <span>INCOMPLETE</span>
              <strong>{incompleteTasks.length}</strong>
            </div>
            {incompleteTasks.length ? (
              incompleteTasks.slice(0, 4).map((task) => (
                <div className="review-task pending" key={task.id}>
                  <span className="hollow-dot" />
                  <span>{task.title}</span>
                </div>
              ))
            ) : (
              <div className="small-empty">
                No incomplete tasks due this week.
              </div>
            )}
          </section>
          <section className="panel side-panel compact-side">
            <SectionHeading
              title="Compared with last week"
              sub="A little context, not a scorecard."
            />
            <div className="side-counter">
              <span>Paid sales</span>
              <strong>
                {previous.sales} → {metrics.sales}
              </strong>
            </div>
            <div className="side-counter">
              <span>Outreach</span>
              <strong>
                {previous.outreach} → {metrics.outreach}
              </strong>
            </div>
            <div className="side-counter">
              <span>Projects completed</span>
              <strong>
                {previous.projects} → {metrics.projects}
              </strong>
            </div>
            <div className="side-counter">
              <span>Content published</span>
              <strong>
                {previous.published} → {metrics.published}
              </strong>
            </div>
          </section>
          <div className="side-note">
            <Lightbulb size={17} />
            <span>
              <strong>Progress isn’t always linear.</strong>
              <small>
                Use what you learned to make a gentler, clearer plan.
              </small>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
