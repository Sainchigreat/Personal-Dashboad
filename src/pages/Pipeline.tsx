import { useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  MessageSquareText,
  Plus,
  Search,
  Send,
  UsersRound,
} from "lucide-react";
import { asRecord, useApp } from "../lib/store";
import { displayDate } from "../lib/date";
import { currency, cycleMetrics, percentage } from "../lib/metrics";
import {
  Button,
  EmptyState,
  MetricCard,
  PageHeader,
  Pill,
  Progress,
  SectionHeading,
  Status,
  Tabs,
} from "../components/UI";

export default function Pipeline() {
  const { data, cycle, today, openForm } = useApp();
  const [tab, setTab] = useState("prospects");
  const [query, setQuery] = useState("");
  const metrics = cycleMetrics(data, cycle, today);
  const followups = data.prospects.filter(
    (item) =>
      item.follow_up_date &&
      item.follow_up_date <= today &&
      !["Won", "Lost", "Not a fit"].includes(item.status),
  );
  const prospects = data.prospects.filter((item) =>
    `${item.company} ${item.contact} ${item.industry}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const interactions = data.interactions
    .slice()
    .sort((a, b) => b.occurred_date.localeCompare(a.occurred_date));
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="BUILD MEANINGFUL CONNECTIONS"
        title="Client Pipeline"
        description="Thoughtful research. Better conversations. Real opportunities."
        actions={
          <>
            <Button icon={Plus} onClick={() => openForm("prospect")}>
              Add prospect
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => openForm("interaction")}
            >
              Log interaction
            </Button>
          </>
        }
      />
      <div className="metrics-grid module-metrics">
        <MetricCard
          icon={Search}
          iconTone="accent"
          label="Researched today"
          value={metrics.researched}
          detail="Prospects marked researched"
        />
        <MetricCard
          icon={Send}
          iconTone="secondary"
          label="Outreach today"
          value={
            <>
              {metrics.outreach}
              <span> / {cycle.outreach_target}</span>
            </>
          }
          detail="Actual outreach actions"
          progress={percentage(metrics.outreach, cycle.outreach_target)}
        />
        <MetricCard
          icon={CalendarClock}
          iconTone="highlight"
          label="Follow-ups due"
          value={followups.length}
          detail="Today or earlier"
        />
        <MetricCard
          icon={UsersRound}
          iconTone="green"
          label="Prospects"
          value={data.prospects.length}
          detail="In your relationship database"
        />
      </div>
      <div className="module-layout">
        <section className="panel record-panel">
          <div className="record-panel-top">
            <SectionHeading
              title="Your pipeline"
              sub="Keep every relationship moving with intention."
            />
            <Tabs
              selected={tab}
              onChange={setTab}
              tabs={[
                {
                  id: "prospects",
                  label: "Prospects",
                  count: data.prospects.length,
                },
                {
                  id: "activity",
                  label: "Activity",
                  count: data.interactions.length,
                },
                {
                  id: "jobs",
                  label: "Job applications",
                  count: data.jobs.length,
                },
              ]}
            />
          </div>
          {tab === "prospects" && (
            <>
              {data.prospects.length > 0 && (
                <div className="list-toolbar">
                  <label>
                    <Search size={15} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search prospects..."
                    />
                  </label>
                  <span>
                    {prospects.length} prospect
                    {prospects.length === 1 ? "" : "s"}
                  </span>
                </div>
              )}
              {prospects.length ? (
                <div className="record-list">
                  {prospects.map((item) => (
                    <div className="record-row" key={item.id}>
                      <span className="record-icon secondary">
                        <BriefcaseBusiness size={17} />
                      </span>
                      <button
                        className="record-main record-main-button"
                        onClick={() => openForm("prospect", asRecord(item))}
                      >
                        <strong>{item.company}</strong>
                        <small>
                          {item.contact ||
                            item.industry ||
                            "No contact details yet"}
                          {item.follow_up_date
                            ? ` · Follow up ${displayDate(item.follow_up_date)}`
                            : ""}
                        </small>
                      </button>
                      <Status value={item.status} />
                      <button
                        className="row-action"
                        onClick={() =>
                          openForm("interaction", undefined, {
                            prospect_id: item.id,
                          })
                        }
                      >
                        Log activity
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={BriefcaseBusiness}
                  title={
                    query
                      ? "No prospects found"
                      : "Your next relationship starts here"
                  }
                  text={
                    query
                      ? "Try a different search."
                      : "Add a prospect, then record research and outreach as separate actions."
                  }
                  action={
                    !query && (
                      <Button
                        variant="ghost"
                        icon={Plus}
                        onClick={() => openForm("prospect")}
                      >
                        Add a prospect
                      </Button>
                    )
                  }
                />
              )}
            </>
          )}
          {tab === "activity" &&
            (interactions.length ? (
              <div className="record-list">
                {interactions.map((item) => (
                  <button
                    className="record-row"
                    key={item.id}
                    onClick={() => openForm("interaction", asRecord(item))}
                  >
                    <span className="record-icon accent">
                      <MessageSquareText size={17} />
                    </span>
                    <span className="record-main">
                      <strong>
                        {data.prospects.find(
                          (prospect) => prospect.id === item.prospect_id,
                        )?.company || "Prospect"}{" "}
                        · {item.kind}
                      </strong>
                      <small>
                        {item.channel} · {displayDate(item.occurred_date)}
                        {item.summary ? ` · ${item.summary}` : ""}
                      </small>
                    </span>
                    <Pill
                      tone={
                        ["outreach", "follow-up"].includes(item.kind)
                          ? "accent"
                          : "neutral"
                      }
                    >
                      {item.kind}
                    </Pill>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={MessageSquareText}
                title="No interactions logged yet"
                text="When you make contact, record it here so your outreach reflects real activity."
                action={
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("interaction")}
                  >
                    Log interaction
                  </Button>
                }
              />
            ))}
          {tab === "jobs" &&
            (data.jobs.length ? (
              <div className="record-list">
                {data.jobs.map((job) => (
                  <button
                    className="record-row"
                    key={job.id}
                    onClick={() => openForm("job", asRecord(job))}
                  >
                    <span className="record-icon highlight">
                      <BriefcaseBusiness size={17} />
                    </span>
                    <span className="record-main">
                      <strong>{job.role}</strong>
                      <small>
                        {job.company}
                        {job.follow_up_date
                          ? ` · Follow up ${displayDate(job.follow_up_date)}`
                          : ""}
                      </small>
                    </span>
                    <Status value={job.status} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BriefcaseBusiness}
                title="A separate space for opportunities"
                text="Keep applications and their next steps alongside your client pipeline."
                action={
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("job")}
                  >
                    Add an opportunity
                  </Button>
                }
              />
            ))}
        </section>
        <aside className="module-aside">
          <section className="panel side-panel">
            <div className="side-panel-icon secondary">
              <Send size={18} />
            </div>
            <span className="overline">TODAY’S OUTREACH</span>
            <h2>Make meaningful connections.</h2>
            <p>Research builds context. Outreach starts the conversation.</p>
            <div className="side-target">
              <span>Outreach actions</span>
              <strong>
                {metrics.outreach} / {cycle.outreach_target}
              </strong>
            </div>
            <Progress
              value={percentage(metrics.outreach, cycle.outreach_target)}
              color="secondary"
            />
            <div className="side-counter">
              <span>Researched separately</span>
              <strong>{metrics.researched}</strong>
            </div>
            <Button className="wide" onClick={() => openForm("interaction")}>
              Log an interaction <ArrowRight size={14} />
            </Button>
          </section>
          <section className="panel side-panel compact-side">
            <SectionHeading
              title="Follow-ups"
              sub="Due today or earlier."
              action={<CalendarClock size={17} className="muted-icon" />}
            />
            {followups.length ? (
              <div className="side-records">
                {followups.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => openForm("prospect", asRecord(item))}
                  >
                    <span>
                      <strong>{item.company}</strong>
                      <small>{displayDate(item.follow_up_date)}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="small-empty">
                <CheckCircle2 size={17} /> You’re all caught up.
              </div>
            )}
          </section>
          <button
            className="side-note clickable"
            onClick={() => {
              setTab("jobs");
            }}
          >
            <BriefcaseBusiness size={17} />
            <span>
              <strong>Looking for a role?</strong>
              <small>Keep job applications in their own pipeline.</small>
            </span>
            <ArrowRight size={15} />
          </button>
        </aside>
      </div>
    </div>
  );
}
