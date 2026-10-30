import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Lightbulb,
  Link2,
  PenLine,
  Plus,
  Sparkles,
} from "lucide-react";
import { asRecord, useApp } from "../lib/store";
import { displayDate, weekdayNames } from "../lib/date";
import {
  Button,
  EmptyState,
  PageHeader,
  Pill,
  SectionHeading,
  Status,
  Tabs,
} from "../components/UI";

export default function Brand() {
  const { data, cycle, today, openForm, update, toast } = useApp();
  const [tab, setTab] = useState("all");
  const all = data.content_items
    .slice()
    .sort((a, b) =>
      (a.planned_date || "9999").localeCompare(b.planned_date || "9999"),
    );
  const items = all.filter(
    (item) =>
      tab === "all" ||
      (tab === "ideas"
        ? item.status === "Idea"
        : tab === "progress"
          ? ["Draft", "Review", "Approved", "Scheduled"].includes(item.status)
          : ["Published", "Distributed"].includes(item.status)),
  );
  const published = all.filter((item) =>
    ["Published", "Distributed"].includes(item.status),
  );
  const upcoming = all.filter(
    (item) =>
      item.planned_date &&
      item.planned_date >= today &&
      !["Published", "Distributed"].includes(item.status),
  );
  const cadence = cycle.course_days
    .split(",")
    .filter(Boolean)
    .map((value) => weekdayNames[Number(value)])
    .filter(Boolean)
    .join(", ");
  async function recordPublished(id: string) {
    if (
      !window.confirm(
        "Mark this item as published? This records an action you already completed; it will not publish externally.",
      )
    )
      return;
    try {
      await update("content_items", id, {
        status: "Published",
        published_date: today,
      });
      toast("Content recorded as published.");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Unable to update content.",
        "error",
      );
    }
  }
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="SHARE WHAT YOU’RE BUILDING"
        title="Personal Brand"
        description="Collect ideas, tell better stories, and build a body of work."
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => openForm("content")}
          >
            Add content
          </Button>
        }
      />
      <div className="content-overview">
        <div className="content-overview-copy">
          <span className="overline">YOUR CONTENT LIBRARY</span>
          <h2>Ideas become impact when you share them.</h2>
          <p>
            Keep everything from the first spark to the finished post in one
            place.
          </p>
        </div>
        <div className="content-count">
          <strong>{all.length}</strong>
          <span>
            total ideas
            <br />& content
          </span>
        </div>
        <div className="content-count">
          <strong>{upcoming.length}</strong>
          <span>
            planned
            <br />
            upcoming
          </span>
        </div>
        <div className="content-count">
          <strong>{published.length}</strong>
          <span>
            recorded
            <br />
            as published
          </span>
        </div>
        <div className="content-spark">
          <Sparkles size={25} />
        </div>
      </div>
      <div className="module-layout">
        <section className="panel record-panel">
          <div className="record-panel-top">
            <SectionHeading
              title="Content library"
              sub="A calendar and idea bank, together."
            />
            <Tabs
              selected={tab}
              onChange={setTab}
              tabs={[
                { id: "all", label: "All", count: all.length },
                {
                  id: "ideas",
                  label: "Ideas",
                  count: all.filter((i) => i.status === "Idea").length,
                },
                {
                  id: "progress",
                  label: "In progress",
                  count: all.filter((i) =>
                    ["Draft", "Review", "Approved", "Scheduled"].includes(
                      i.status,
                    ),
                  ).length,
                },
                {
                  id: "published",
                  label: "Published",
                  count: published.length,
                },
              ]}
            />
          </div>
          {items.length ? (
            <div className="content-list">
              {items.map((item) => {
                const project = data.projects.find(
                  (p) => p.id === item.project_id,
                );
                const session = data.chapter_sessions.find(
                  (s) => s.id === item.session_id,
                );
                return (
                  <div className="content-row" key={item.id}>
                    <div
                      className={`platform-icon platform-${item.platform.toLowerCase()}`}
                    >
                      {item.platform === "Instagram"
                        ? "Ig"
                        : item.platform === "LinkedIn"
                          ? "in"
                          : item.platform === "YouTube"
                            ? "Yt"
                            : item.platform === "WhatsApp"
                              ? "W"
                              : "•"}
                    </div>
                    <button
                      className="content-main"
                      onClick={() => openForm("content", asRecord(item))}
                    >
                      <strong>{item.title}</strong>
                      <small>
                        {item.platform} <i>·</i> {item.pillar}
                        {project && (
                          <>
                            {" "}
                            <i>·</i> <Link2 size={12} /> {project.title}
                          </>
                        )}
                        {session && (
                          <>
                            {" "}
                            <i>·</i> <Link2 size={12} /> {session.title}
                          </>
                        )}
                      </small>
                    </button>
                    <div className="content-row-right">
                      <span>
                        {item.planned_date
                          ? displayDate(item.planned_date)
                          : "Unscheduled"}
                      </span>
                      <Status value={item.status} />
                    </div>
                    {!["Published", "Distributed"].includes(item.status) && (
                      <button
                        className="row-action"
                        onClick={() => recordPublished(item.id)}
                      >
                        Mark published
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Lightbulb}
              title={
                tab === "all"
                  ? "Capture the next good idea"
                  : "Nothing here just yet"
              }
              text={
                tab === "all"
                  ? "Add an idea, link it to a project or session, and give it a life beyond the draft."
                  : "Content will appear here as it moves through your workflow."
              }
              action={
                tab === "all" && (
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("content")}
                  >
                    Add your first idea
                  </Button>
                )
              }
            />
          )}
        </section>
        <aside className="module-aside">
          <section className="panel side-panel">
            <div className="side-panel-icon secondary">
              <Sparkles size={18} />
            </div>
            <span className="overline">YOUR CREATIVE PERSPECTIVE</span>
            <h2>There’s a story in the work.</h2>
            <p>
              Pull ideas from your projects, experiences, and conversations.
            </p>
            <div className="pillar-list">
              {[
                "Brand identity & strategy",
                "Creative direction",
                "AI creative workflows",
                "Business of design",
                "Project breakdowns",
                "Future of creative work",
              ].map((item, index) => (
                <div key={item}>
                  <span>0{index + 1}</span>
                  {item}
                </div>
              ))}
            </div>
            <Button className="wide" onClick={() => openForm("content")}>
              Capture an idea <Plus size={14} />
            </Button>
          </section>
          <section className="panel side-panel compact-side">
            <SectionHeading
              title="Course content rhythm"
              action={<CalendarDays size={17} className="muted-icon" />}
            />
            <div className="cadence-row">
              <span>Publishing days</span>
              <strong>{cadence || "Not set"}</strong>
            </div>
            <p className="side-small-copy">
              A useful plan, not an automatic publishing schedule.
            </p>
            <button
              className="side-link"
              onClick={() => openForm("cycle", asRecord(cycle))}
            >
              Edit rhythm <ArrowRight size={14} />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
