import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  ListChecks,
  Mic2,
  Plus,
  Radio,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { asRecord, useApp } from "../lib/store";
import {
  addDays,
  displayDate,
  inRange,
  weekStart,
  weekdayNames,
} from "../lib/date";
import { percentage } from "../lib/metrics";
import {
  Button,
  Checkbox,
  EmptyState,
  PageHeader,
  Pill,
  Progress,
  SectionHeading,
  Status,
} from "../components/UI";

export default function Chapter() {
  const { data, cycle, today, openForm, update, toast, setPage } = useApp();
  const sessions = data.chapter_sessions
    .slice()
    .sort((a, b) => a.session_date.localeCompare(b.session_date));
  const [selected, setSelected] = useState("");
  const next =
    sessions.find(
      (item) => item.session_date >= today && item.status !== "Archived",
    ) || sessions[0];
  useEffect(() => {
    if (!selected && next) setSelected(next.id);
  }, [next?.id, selected]);
  const session = sessions.find((item) => item.id === selected) || next;
  const checklist = data.session_checklists
    .filter((item) => item.session_id === session?.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const linkedContent = data.content_items.filter(
    (item) => item.session_id === session?.id,
  );
  const completed = checklist.filter((item) => item.done).length;
  const week = weekStart(today);
  const weekEnd = addDays(week, 6);
  const chapterPublished = data.content_items.filter(
    (item) =>
      (item.session_id || item.pillar === "Next Chapter") &&
      ["Published", "Distributed"].includes(item.status) &&
      inRange(item.published_date, week, weekEnd),
  ).length;
  async function toggle(id: string, done: number) {
    try {
      await update("session_checklists", id, { done: done ? 0 : 1 });
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Unable to update checklist.",
        "error",
      );
    }
  }
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="THE FUTURE OF CREATIVITY"
        title="Next Chapter"
        description="A conversation about the future of creativity."
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => openForm("session")}
          >
            Plan a session
          </Button>
        }
      />
      <div className="module-banner chapter-banner">
        <div>
          <div className="banner-kicker">
            <span /> A PLATFORM FOR WHAT’S NEXT
          </div>
          <h2>
            Better conversations.
            <br />
            <span>Bigger possibilities.</span>
          </h2>
          <p>
            Exploring how technology, business, and new ideas are reshaping
            creative work.
          </p>
        </div>
        <div className="audio-art">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="chapter-stats">
        <div>
          <span className="chapter-stat-icon blue">
            <CalendarDays size={17} />
          </span>
          <span>
            <small>YOUR SESSION RHYTHM</small>
            <strong>Every {weekdayNames[cycle.session_day]}</strong>
          </span>
        </div>
        <div>
          <span className="chapter-stat-icon purple">
            <Mic2 size={17} />
          </span>
          <span>
            <small>PLANNED SESSIONS</small>
            <strong>
              {
                sessions.filter(
                  (item) => !["Completed", "Archived"].includes(item.status),
                ).length
              }{" "}
              upcoming / in progress
            </strong>
          </span>
        </div>
        <div>
          <span className="chapter-stat-icon green">
            <FileText size={17} />
          </span>
          <span>
            <small>CONTENT THIS WEEK</small>
            <strong>
              {chapterPublished} / {cycle.chapter_content_target} published
            </strong>
          </span>
        </div>
        <button onClick={() => openForm("cycle", asRecord(cycle))}>
          Edit cadence <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="chapter-layout">
        <div className="chapter-main">
          <section className="panel session-panel">
            <div className="session-panel-head">
              <SectionHeading
                title="Sessions"
                sub="Plan the conversation, then make it happen."
                action={
                  <button
                    className="plain-action"
                    onClick={() => openForm("session")}
                  >
                    <Plus size={15} /> New session
                  </button>
                }
              />
            </div>
            {sessions.length ? (
              <div className="session-tabs">
                {sessions.map((item) => (
                  <button
                    className={session?.id === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="session-tab-date">
                      <strong>
                        {displayDate(item.session_date, { day: "numeric" })}
                      </strong>
                      <small>
                        {displayDate(item.session_date, {
                          month: "short",
                        }).toUpperCase()}
                      </small>
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.guest || "Guest to be confirmed"}</small>
                    </span>
                    <Status value={item.status} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Radio}
                title="Start the next conversation"
                text="Plan a session and get an editable preparation checklist and linked tasks."
                action={
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("session")}
                  >
                    Plan your first session
                  </Button>
                }
              />
            )}
          </section>
          {session && (
            <>
              <section className="panel session-detail">
                <div className="session-detail-top">
                  <div>
                    <span className="overline">SESSION BRIEF</span>
                    <h2>{session.title}</h2>
                    <p>
                      {session.central_question ||
                        "Add a central question to give this conversation direction."}
                    </p>
                  </div>
                  <Button
                    onClick={() => openForm("session", asRecord(session))}
                  >
                    Edit session
                  </Button>
                </div>
                <div className="session-detail-meta">
                  <span>
                    <CalendarDays size={15} />
                    {displayDate(session.session_date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {session.session_time && ` · ${session.session_time}`}
                  </span>
                  <span>
                    <UsersRound size={15} />
                    {session.guest || "Guest not set"}
                  </span>
                  <Status value={session.status} />
                </div>
                {(session.youtube_url || session.recording_url) && (
                  <div className="session-links">
                    {session.youtube_url && (
                      <a
                        href={session.youtube_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        YouTube live <ExternalLink size={13} />
                      </a>
                    )}
                    {session.recording_url && (
                      <a
                        href={session.recording_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Recording <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                )}
              </section>
              <section className="panel checklist-panel">
                <SectionHeading
                  title="Session checklist"
                  sub="A flexible path from planning to post-session."
                  action={
                    <Pill tone="blue">
                      {completed} / {checklist.length}
                    </Pill>
                  }
                />
                <Progress value={percentage(completed, checklist.length)} />
                <div className="checklist">
                  {checklist.map((item) => (
                    <div key={item.id}>
                      <Checkbox
                        checked={Boolean(item.done)}
                        label={`${item.done ? "Reopen" : "Complete"} ${item.title}`}
                        onChange={() => toggle(item.id, item.done)}
                      />
                      <span className={item.done ? "completed" : ""}>
                        {item.title}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
        <aside className="module-aside">
          <section className="panel side-panel">
            <div className="side-panel-icon purple">
              <FileText size={18} />
            </div>
            <span className="overline">EDITORIAL WORKFLOW</span>
            <h2>Give the conversation a longer life.</h2>
            <p>Turn each session into thoughtful, useful content.</p>
            <div className="editorial-flow">
              {[
                "Record",
                "Transcribe",
                "Draft",
                "Review",
                "Approve",
                "Publish",
                "Distribute",
              ].map((step, index) => (
                <div key={step}>
                  <span>{index + 1}</span>
                  <strong>{step}</strong>
                  {index < 6 && <i />}
                </div>
              ))}
            </div>
            <div className="approval-note">
              <CheckCircle2 size={16} />
              <span>
                Human review and approval are required before AI-assisted or
                session content can be marked published.
              </span>
            </div>
            <Button
              className="wide"
              onClick={() =>
                openForm("content", undefined, {
                  session_id: session?.id || "",
                  pillar: "Next Chapter",
                })
              }
            >
              Add editorial content <Plus size={14} />
            </Button>
          </section>
          {session && (
            <section className="panel side-panel compact-side">
              <SectionHeading
                title="Linked content"
                sub={`${linkedContent.length} item${linkedContent.length === 1 ? "" : "s"} from this session.`}
                action={<Link2 size={17} className="muted-icon" />}
              />
              {linkedContent.length ? (
                <div className="side-records">
                  {linkedContent.slice(0, 5).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => openForm("content", asRecord(item))}
                    >
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.platform} · {item.status}
                        </small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="small-empty">
                  Content you link to this session will appear here.
                </div>
              )}
              <button className="side-link" onClick={() => setPage("brand")}>
                Open content library <ArrowRight size={14} />
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
