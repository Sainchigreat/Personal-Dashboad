import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Brush,
  CheckCircle2,
  Clapperboard,
  Layers3,
  Link2,
  Plus,
  Sparkles,
  Target,
} from "lucide-react";
import { asRecord, useApp } from "../lib/store";
import { displayDate } from "../lib/date";
import { cycleMetrics, percentage } from "../lib/metrics";
import {
  Button,
  EmptyState,
  PageHeader,
  Pill,
  Progress,
  SectionHeading,
  Tabs,
} from "../components/UI";

const stages = [
  "Brief",
  "Research & References",
  "Creative Direction",
  "Concept Development",
  "AI Production",
  "Design Execution",
  "Refinement",
  "Review",
  "Final Output",
  "Content Extraction",
  "Completed",
];
export default function Studio() {
  const { data, cycle, today, openForm, update, toast, setPage } = useApp();
  const [tab, setTab] = useState("active");
  const metrics = cycleMetrics(data, cycle, today);
  const active = data.projects.filter((item) => item.stage !== "Completed");
  const completed = data.projects.filter((item) => item.stage === "Completed");
  const visible = tab === "active" ? active : completed;
  async function setStage(id: string, stage: string) {
    try {
      await update("projects", id, { stage });
      toast("Project stage updated.");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Unable to update stage.",
        "error",
      );
    }
  }
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="MAKE SOMETHING MEANINGFUL"
        title="Creative Studio"
        description="From first idea to finished work—and everything it can become."
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => openForm("project")}
          >
            New project
          </Button>
        }
      />
      <div className="studio-summary">
        <div className="studio-summary-icon">
          <Clapperboard size={21} />
        </div>
        <div>
          <span className="overline">THIS WEEK’S CREATIVE OUTPUT</span>
          <h2>
            {metrics.projectsDone} of {cycle.projects_target} projects completed
          </h2>
          <p>Finished work, not just work in progress.</p>
        </div>
        <div className="studio-summary-progress">
          <span>
            {percentage(metrics.projectsDone, cycle.projects_target)}%
          </span>
          <Progress
            value={percentage(metrics.projectsDone, cycle.projects_target)}
            color="highlight"
          />
        </div>
        <button onClick={() => openForm("cycle", asRecord(cycle))}>
          Edit target <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="module-layout studio-layout">
        <section className="studio-projects">
          <div className="studio-list-header">
            <div>
              <h2>Your projects</h2>
              <p>Good ideas deserve a clear path to completion.</p>
            </div>
            <Tabs
              selected={tab}
              onChange={setTab}
              tabs={[
                { id: "active", label: "Active", count: active.length },
                {
                  id: "completed",
                  label: "Completed",
                  count: completed.length,
                },
              ]}
            />
          </div>
          {visible.length ? (
            <div className="project-grid">
              {visible.map((project, index) => {
                const linked = data.content_items.filter(
                  (item) => item.project_id === project.id,
                ).length;
                return (
                  <article className="project-card" key={project.id}>
                    <div className={`project-card-art art-${index % 4}`}>
                      <div className="project-art-shape shape-one" />
                      <div className="project-art-shape shape-two" />
                      <span className="project-type-icon">
                        <Brush size={18} />
                      </span>
                      <span className="project-type">
                        {project.type.toUpperCase()}
                      </span>
                      <button
                        aria-label={`Edit ${project.title}`}
                        onClick={() => openForm("project", asRecord(project))}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="project-card-body">
                      <div className="project-card-heading">
                        <button
                          onClick={() => openForm("project", asRecord(project))}
                        >
                          {project.title}
                        </button>
                        <Pill
                          tone={
                            project.priority === "high" ? "accent" : "neutral"
                          }
                        >
                          {project.priority}
                        </Pill>
                      </div>
                      <p>
                        {project.objective ||
                          project.brief ||
                          "Add a brief and define what this project will become."}
                      </p>
                      <label className="stage-select">
                        <span>PRODUCTION STAGE</span>
                        <select
                          value={project.stage}
                          onChange={(event) =>
                            setStage(project.id, event.target.value)
                          }
                        >
                          {stages.map((stage) => (
                            <option key={stage}>{stage}</option>
                          ))}
                        </select>
                      </label>
                      <div className="project-card-footer">
                        <span>
                          {project.deadline
                            ? `Due ${displayDate(project.deadline)}`
                            : "No deadline"}{" "}
                          <i>·</i> {linked} linked content
                        </span>
                        <button
                          onClick={() =>
                            openForm("content", undefined, {
                              project_id: project.id,
                              cycle_id: project.cycle_id || cycle.id,
                            })
                          }
                        >
                          Create content <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="panel studio-empty">
              <EmptyState
                icon={Clapperboard}
                title={
                  tab === "active"
                    ? "Your next idea starts here"
                    : "No completed projects yet"
                }
                text={
                  tab === "active"
                    ? "Create a project and move it from brief to final output."
                    : "Completed projects stay here as a record of your work."
                }
                action={
                  tab === "active" && (
                    <Button
                      variant="ghost"
                      icon={Plus}
                      onClick={() => openForm("project")}
                    >
                      Create your first project
                    </Button>
                  )
                }
              />
            </div>
          )}
        </section>
        <aside className="module-aside">
          <section className="panel side-panel">
            <div className="side-panel-icon highlight">
              <Layers3 size={18} />
            </div>
            <span className="overline">ONE PROJECT, MANY IDEAS</span>
            <h2>Let the work work harder.</h2>
            <p>
              A single project can become content, portfolio proof, or a useful
              lesson for your audience.
            </p>
            <div className="extraction-list">
              <div>
                <span>01</span>
                <p>
                  <strong>The brief</strong>
                  <small>Share the problem and context.</small>
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>The process</strong>
                  <small>Show the thinking and decisions.</small>
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>The result</strong>
                  <small>Reflect on the outcome and lesson.</small>
                </p>
              </div>
            </div>
            <Button className="wide" onClick={() => setPage("brand")}>
              Open content library <ArrowRight size={14} />
            </Button>
          </section>
          <section className="panel side-panel compact-side">
            <SectionHeading
              title="Studio at a glance"
              action={<Target size={17} className="muted-icon" />}
            />
            <div className="side-counter">
              <span>Active projects</span>
              <strong>{active.length}</strong>
            </div>
            <div className="side-counter">
              <span>Completed projects</span>
              <strong>{completed.length}</strong>
            </div>
            <div className="side-counter">
              <span>Content linked to projects</span>
              <strong>
                {data.content_items.filter((item) => item.project_id).length}
              </strong>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
