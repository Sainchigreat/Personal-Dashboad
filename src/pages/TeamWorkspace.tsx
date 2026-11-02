import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckSquare2,
  Flag,
  Link2,
  Plus,
  ShieldCheck,
  Target,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { api } from "../lib/api";
import { displayDate } from "../lib/date";
import { useTeam, type TeamGoal } from "../lib/team";
import type { AuthStatus } from "../types";
import {
  Button,
  EmptyState,
  MetricCard,
  Modal,
  PageHeader,
  Pill,
  Progress,
  SectionHeading,
  Tabs,
} from "../components/UI";
import { TeamWorkList } from "../components/TeamWork";

type Dialog = { kind: "goal" | "assignment" | "invite"; goal?: TeamGoal };
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unable to save your changes.";

export default function TeamWorkspace({ auth }: { auth: AuthStatus }) {
  const { data, error: loadError, loading, refresh } = useTeam();
  const [tab, setTab] = useState("overview");
  const [mine, setMine] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const open = (value: Dialog) => {
    setError("");
    setInviteLink("");
    setInviteEmail("");
    setCopied(false);
    setDialog(value);
  };
  if (loading && !data)
    return (
      <div className="page-wrap">
        <PageHeader
          eyebrow="SHARED WORK"
          title="Team Workspace"
          description="Shared goals, clear assignments, and thoughtful collaboration."
        />
        <div className="panel team-loading">Loading your team workspace…</div>
      </div>
    );
  if (!data)
    return (
      <div className="page-wrap">
        <PageHeader
          eyebrow="SHARED WORK"
          title="Team Workspace"
          description="Shared goals and assigned work, in one place."
        />
        <div className="panel team-loading">
          <p role="alert">
            {loadError || "Unable to load the team workspace."}
          </p>
          <Button onClick={() => void refresh().catch(() => {})}>
            Try again
          </Button>
        </div>
      </div>
    );
  const me = data.membership,
    manager = me.role !== "member",
    owner = me.role === "owner";
  const ownTasks = data.tasks.filter(
    (task) => task.assignee_user_id === me.user_id,
  );
  const openMine = ownTasks.filter(
    (task) => !["approved", "completed"].includes(task.status),
  ).length;
  const toReview = data.tasks.filter(
    (task) =>
      task.status === "submitted" &&
      task.assignee_user_id !== me.user_id &&
      (owner || task.reviewer_user_id === me.user_id),
  ).length;
  async function change(
    path: string,
    method: string,
    body?: unknown,
    success = "Saved.",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, { method, body });
      await refresh();
      setDialog(null);
      setNotice(success);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    if (dialog?.kind === "goal") {
      const payload = {
        title: String(f.get("title")),
        description: String(f.get("description") || ""),
        target: Number(f.get("target")),
        current: Number(f.get("current")),
        unit: String(f.get("unit")),
        due_date: f.get("due") || null,
        owner_user_id: f.get("owner") || null,
      };
      return void change(
        dialog.goal ? `/team/goals/${dialog.goal.id}` : "/team/goals",
        dialog.goal ? "PATCH" : "POST",
        payload,
        "Shared goal saved.",
      );
    }
    if (dialog?.kind === "assignment")
      return void change(
        "/team/tasks",
        "POST",
        {
          title: String(f.get("title")),
          description: String(f.get("description") || ""),
          assignee_user_id: String(f.get("assignee")),
          reviewer_user_id: String(f.get("reviewer")),
          goal_id: f.get("goal") || null,
          priority: String(f.get("priority")),
          due_date: f.get("due") || null,
          deliverable: String(f.get("deliverable") || ""),
        },
        "Assignment created.",
      );
    if (dialog?.kind === "invite") {
      setBusy(true);
      setError("");
      try {
        const result = await api<{ email: string; join_path: string }>(
          "/team/invites",
          {
            method: "POST",
            body: {
              email: String(f.get("email")),
              role: String(f.get("role")),
            },
          },
        );
        // The raw token is returned once; keep it visible even if refreshing fails.
        setInviteEmail(result.email);
        setInviteLink(`${location.origin}${result.join_path}`);
        await refresh().catch(() => {});
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    }
  }
  async function switchDemo() {
    setBusy(true);
    setError("");
    try {
      await api("/team/demo-switch", { method: "POST" });
      location.reload();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const goals = (
    <div className="team-goal-list">
      {data.goals.length ? (
        data.goals.map((goal) => (
          <article key={goal.id} className="team-goal-card">
            <div className="team-goal-top">
              <div>
                <h3>{goal.title}</h3>
                {goal.description && <p>{goal.description}</p>}
              </div>
              {manager && (
                <Button
                  variant="ghost"
                  onClick={() => open({ kind: "goal", goal })}
                >
                  Edit
                </Button>
              )}
            </div>
            <div className="team-goal-progress">
              <span>
                {goal.current} / {goal.target} {goal.unit}
              </span>
              <strong>
                {Math.round(
                  Math.min(
                    100,
                    goal.target > 0 ? (goal.current / goal.target) * 100 : 0,
                  ),
                )}
                %
              </strong>
            </div>
            <Progress
              label={`Progress toward ${goal.title}`}
              value={goal.target > 0 ? (goal.current / goal.target) * 100 : 0}
            />
            <div className="team-goal-meta">
              {goal.owner_name
                ? `Owned by ${goal.owner_name}`
                : "No goal owner"}
              {goal.due_date ? ` · Due ${displayDate(goal.due_date)}` : ""}
            </div>
          </article>
        ))
      ) : (
        <EmptyState
          icon={Target}
          title="No shared goals yet"
          text={
            manager
              ? "Create a goal to give the team a clear outcome to work toward."
              : "Your team will see shared goals here when they are added."
          }
          action={
            manager ? (
              <Button
                variant="ghost"
                icon={Plus}
                onClick={() => open({ kind: "goal" })}
              >
                Create a goal
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
  return (
    <div className="page-wrap team-page">
      <PageHeader
        eyebrow="SHARED WORK"
        title="Team Workspace"
        description={
          manager
            ? "Shared goals, clear assignments, and progress you can trust."
            : "Your assignments and shared goals, together in Momentum OS."
        }
        actions={
          manager ? (
            <>
              <Button icon={UserPlus} onClick={() => open({ kind: "invite" })}>
                Invite member
              </Button>
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => open({ kind: "assignment" })}
              >
                Assign work
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="team-privacy">
        <ShieldCheck size={17} />
        <span>
          <strong>Separate by design.</strong>{" "}
          {manager
            ? "Only team records are shared. Your personal tasks, finances, clients and notes stay private."
            : "You can see shared goals and your own assignments—not another person's work or private records."}
        </span>
      </div>
      {loadError && (
        <div className="form-error" role="alert">
          Team updates could not refresh: {loadError}{" "}
          <button
            className="plain-action"
            onClick={() => void refresh().catch(() => {})}
          >
            Try again
          </button>
        </div>
      )}
      {auth.previewEnabled && (
        <div className="team-demo-banner">
          <div>
            <strong>
              {auth.browserDemo
                ? "Browser demo · sample team"
                : "Public sandbox · not private"}
            </strong>
            <p>
              {auth.browserDemo
                ? "Try shared goals and sample assignments locally. Invitations and changes are not real or synced."
                : "This sandbox is not private. Real invitations are available only in a private deployment."}
            </p>
          </div>
          {auth.browserDemo && (
            <Button onClick={() => void switchDemo()} disabled={busy}>
              {me.role === "member"
                ? "Back to demo owner"
                : "Preview sample member"}
            </Button>
          )}
        </div>
      )}
      {error && !dialog && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="team-notice" role="status">
          {notice}
        </div>
      )}
      <Tabs
        selected={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          {
            id: "work",
            label: manager ? "Assignments" : "My assignments",
            count: data.tasks.length,
          },
          { id: "goals", label: "Shared goals", count: data.goals.length },
          { id: "people", label: "People" },
        ]}
      />
      {tab === "overview" && (
        <>
          <div className="team-stats">
            <MetricCard
              icon={Target}
              label="Shared goals"
              value={data.goals.length}
              detail="Defined by your team"
            />
            <MetricCard
              icon={CheckSquare2}
              iconTone="secondary"
              label="My open assignments"
              value={openMine}
              detail="Assigned to you"
            />
            {manager && (
              <MetricCard
                icon={Flag}
                iconTone="highlight"
                label="Awaiting my review"
                value={toReview}
                detail="Submitted work to review"
              />
            )}
          </div>
          <div className="team-overview-grid">
            <section className="panel team-panel">
              <SectionHeading
                title="Shared goals"
                sub="Progress is updated deliberately by a team lead."
                action={
                  <button
                    className="plain-action"
                    onClick={() => setTab("goals")}
                  >
                    View goals <ArrowRight size={14} />
                  </button>
                }
              />
              {goals}
            </section>
            <section className="panel team-panel">
              <SectionHeading
                title="Your assignments"
                sub="A clear view of the work assigned to you."
                action={
                  <button
                    className="plain-action"
                    onClick={() => {
                      setMine(true);
                      setTab("work");
                    }}
                  >
                    View work <ArrowRight size={14} />
                  </button>
                }
              />
              {ownTasks.length ? (
                <div className="team-summary-list">
                  {ownTasks.slice(0, 5).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => {
                        setMine(true);
                        setTab("work");
                      }}
                    >
                      <span>
                        <strong>{task.title}</strong>
                        <small>
                          {task.due_date
                            ? `Due ${displayDate(task.due_date)}`
                            : "No due date"}
                        </small>
                      </span>
                      <Pill tone="accent">
                        {task.status.replaceAll("_", " ")}
                      </Pill>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CheckSquare2}
                  title="Your list is clear"
                  text="When work is assigned to you, it will appear here."
                />
              )}
            </section>
          </div>
          {data.activity.length > 0 && (
            <section className="panel team-panel team-activity-panel">
              <SectionHeading
                title="Recent team activity"
                sub={
                  manager
                    ? "Shared work recorded in this workspace."
                    : "Updates to shared goals and your own assignments."
                }
              />
              <div className="team-activity">
                {data.activity.slice(0, 8).map((event) => (
                  <div key={event.id}>
                    <span className="activity-dot" />
                    <p>
                      <strong>{event.name}</strong> {event.summary}
                      <small>
                        {new Date(event.created_at).toLocaleDateString()}
                      </small>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {tab === "work" && (
        <section className="panel team-panel">
          <SectionHeading
            title={manager && !mine ? "Team assignments" : "My assignments"}
            sub="Work moves through submission and human review—never automatic approval."
            action={
              manager ? (
                <Button onClick={() => setMine(!mine)}>
                  {mine ? "Show all work" : "Assigned to me"}
                </Button>
              ) : undefined
            }
          />
          <TeamWorkList
            tasks={manager && !mine ? data.tasks : ownTasks}
            emptyText={
              manager && !mine
                ? "Assign work to a team member to get started."
                : "When a team lead assigns you work, it will appear here."
            }
          />
        </section>
      )}
      {tab === "goals" && (
        <section className="panel team-panel">
          <SectionHeading
            title="Shared goals"
            sub="Targets and progress are entered by a team lead, not guessed from tasks."
            action={
              manager ? (
                <Button icon={Plus} onClick={() => open({ kind: "goal" })}>
                  New goal
                </Button>
              ) : undefined
            }
          />
          {goals}
        </section>
      )}
      {tab === "people" && (
        <div className="team-people-layout">
          <section className="panel team-panel">
            <SectionHeading
              title="Team members"
              sub={
                manager
                  ? "Manage who can access shared work."
                  : "People in your shared workspace."
              }
            />
            <div className="team-member-list">
              {data.members.map((person) => {
                const canChange =
                  !auth.browserDemo &&
                  manager &&
                  person.user_id !== me.user_id &&
                  person.role !== "owner" &&
                  (owner || person.role !== "manager");
                return (
                  <div className="team-member-row" key={person.user_id}>
                    <span className="avatar">
                      {person.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div className="team-member-name">
                      <strong>
                        {person.name}
                        {person.user_id === me.user_id ? " (you)" : ""}
                      </strong>
                      <small>
                        {person.email ||
                          (person.status === "suspended"
                            ? "Access suspended"
                            : "Shared workspace")}
                      </small>
                    </div>
                    <Pill
                      tone={person.status === "suspended" ? "muted" : "accent"}
                    >
                      {person.status === "suspended"
                        ? "suspended"
                        : person.role}
                    </Pill>
                    {canChange && (
                      <div className="team-member-actions">
                        {owner && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Change ${person.name} to ${person.role === "member" ? "manager" : "member"}?`,
                                )
                              )
                                void change(
                                  `/team/members/${person.user_id}`,
                                  "PATCH",
                                  {
                                    role:
                                      person.role === "member"
                                        ? "manager"
                                        : "member",
                                  },
                                  "Team role updated.",
                                );
                            }}
                          >
                            {person.role === "member"
                              ? "Make manager"
                              : "Make member"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            const next =
                              person.status === "active"
                                ? "suspended"
                                : "active";
                            if (
                              window.confirm(
                                `${next === "suspended" ? "Suspend" : "Restore"} ${person.name}'s access?`,
                              )
                            )
                              void change(
                                `/team/members/${person.user_id}`,
                                "PATCH",
                                { status: next },
                                "Team access updated.",
                              );
                          }}
                        >
                          {person.status === "active" ? "Suspend" : "Restore"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          {manager && (
            <section className="panel team-panel">
              <SectionHeading
                title="Pending invitations"
                sub="Links expire after seven days and can be used once."
                action={
                  <Button icon={Plus} onClick={() => open({ kind: "invite" })}>
                    Invite
                  </Button>
                }
              />
              {data.invites.length ? (
                <div className="team-invite-list">
                  {data.invites.map((invite) => (
                    <div key={invite.id}>
                      <span>
                        <strong>{invite.email}</strong>
                        <small>
                          {invite.role} · Expires{" "}
                          {new Date(invite.expires_at).toLocaleDateString()}
                        </small>
                      </span>
                      {(owner || invite.role !== "manager") && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Revoke the invitation for ${invite.email}?`,
                              )
                            )
                              void change(
                                `/team/invites/${invite.id}`,
                                "DELETE",
                                undefined,
                                "Invitation revoked.",
                              );
                          }}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline-empty">No pending invitations.</div>
              )}
              <p className="team-form-help">
                Invitation links are shown only when created. If lost, revoke
                and create a new invitation.
              </p>
            </section>
          )}
        </div>
      )}
      {dialog && (
        <Modal
          title={
            dialog.kind === "goal"
              ? dialog.goal
                ? "Edit shared goal"
                : "Create a shared goal"
              : dialog.kind === "assignment"
                ? "Assign team work"
                : "Invite a team member"
          }
          subtitle={
            dialog.kind === "invite"
              ? "Invite-only access to shared work."
              : "Keep your team aligned with clear, intentional work."
          }
          wide={dialog.kind !== "invite"}
          onClose={() => {
            if (!busy) {
              setDialog(null);
              setError("");
            }
          }}
        >
          {dialog.kind === "invite" && auth.previewEnabled ? (
            <div className="dialog-form team-dialog">
              <p className="team-form-help">
                Invitations do not work in this preview. Deploy Momentum OS
                privately over HTTPS to create real, single-use team
                invitations.
              </p>
              <div className="modal-footer">
                <span></span>
                <Button onClick={() => setDialog(null)}>Close</Button>
              </div>
            </div>
          ) : inviteLink ? (
            <div className="dialog-form team-dialog">
              <div className="team-invite-success">
                <Link2 size={20} />
                <div>
                  <strong>Invitation created for {inviteEmail}</strong>
                  <p>
                    Send this private, single-use link yourself. It expires in
                    seven days and is shown only now.
                  </p>
                </div>
              </div>
              <label>
                Invitation link
                <input
                  aria-label="Invitation link"
                  value={inviteLink}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <div className="modal-footer">
                <span></span>
                <div>
                  <Button
                    onClick={() => {
                      if (!navigator.clipboard) {
                        setError("Select and copy the link above.");
                        return;
                      }
                      navigator.clipboard
                        .writeText(inviteLink)
                        .then(() => setCopied(true))
                        .catch(() =>
                          setError("Select and copy the link above."),
                        );
                    }}
                  >
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button variant="primary" onClick={() => setDialog(null)}>
                    Done
                  </Button>
                </div>
              </div>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <form
              className="dialog-form team-dialog"
              onSubmit={(event) => void submit(event)}
            >
              {dialog.kind === "goal" && (
                <div className="form-grid team-form-grid">
                  <label className="team-span-two">
                    Goal title
                    <input
                      name="title"
                      required
                      maxLength={200}
                      defaultValue={dialog.goal?.title}
                      placeholder="What are we working toward?"
                    />
                  </label>
                  <label className="team-span-two">
                    Description
                    <textarea
                      name="description"
                      maxLength={4000}
                      defaultValue={dialog.goal?.description}
                    />
                  </label>
                  <label>
                    Target
                    <input
                      type="number"
                      name="target"
                      required
                      min="0.01"
                      step="any"
                      max="1000000000"
                      defaultValue={dialog.goal?.target ?? 1}
                    />
                  </label>
                  <label>
                    Current progress
                    <input
                      type="number"
                      name="current"
                      required
                      min="0"
                      step="any"
                      max="1000000000"
                      defaultValue={dialog.goal?.current ?? 0}
                    />
                  </label>
                  <label>
                    Unit
                    <input
                      name="unit"
                      required
                      maxLength={40}
                      defaultValue={dialog.goal?.unit ?? "deliverables"}
                    />
                  </label>
                  <label>
                    Due date
                    <input
                      name="due"
                      type="date"
                      defaultValue={dialog.goal?.due_date || ""}
                    />
                  </label>
                  <label className="team-span-two">
                    Goal owner
                    <select
                      name="owner"
                      defaultValue={dialog.goal?.owner_user_id || ""}
                    >
                      <option value="">Unassigned</option>
                      {data.members
                        .filter((person) => person.status === "active")
                        .map((person) => (
                          <option key={person.user_id} value={person.user_id}>
                            {person.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              )}
              {dialog.kind === "assignment" && (
                <div className="form-grid team-form-grid">
                  <label className="team-span-two">
                    Assignment title
                    <input
                      name="title"
                      required
                      maxLength={200}
                      placeholder="What needs to be done?"
                    />
                  </label>
                  <label className="team-span-two">
                    Description
                    <textarea
                      name="description"
                      maxLength={4000}
                      placeholder="Add the context someone needs"
                    />
                  </label>
                  <label>
                    Assignee
                    <select name="assignee" required defaultValue="">
                      <option value="">Choose a person</option>
                      {data.members
                        .filter((person) => person.status === "active")
                        .map((person) => (
                          <option key={person.user_id} value={person.user_id}>
                            {person.name} · {person.role}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Reviewer
                    <select name="reviewer" defaultValue={me.user_id} required>
                      {data.members
                        .filter(
                          (person) =>
                            person.status === "active" &&
                            person.role !== "member",
                        )
                        .map((person) => (
                          <option key={person.user_id} value={person.user_id}>
                            {person.name} · {person.role}
                          </option>
                        ))}
                    </select>
                    <small>Must be different from the assignee.</small>
                  </label>
                  <label>
                    Shared goal
                    <select name="goal" defaultValue="">
                      <option value="">No linked goal</option>
                      {data.goals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select name="priority" defaultValue="medium">
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="low">Low</option>
                    </select>
                  </label>
                  <label>
                    Due date
                    <input name="due" type="date" />
                  </label>
                  <label>
                    Expected deliverable
                    <input
                      name="deliverable"
                      maxLength={2000}
                      placeholder="e.g. A review-ready draft"
                    />
                  </label>
                </div>
              )}
              {dialog.kind === "invite" && (
                <>
                  <div className="team-form-grid">
                    <label>
                      Email address
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                        placeholder="teammate@example.com"
                      />
                    </label>
                    <label>
                      Role
                      <select name="role" defaultValue="member">
                        <option value="member">Member · own assignments</option>
                        {owner && (
                          <option value="manager">
                            Manager · manage shared work
                          </option>
                        )}
                      </select>
                    </label>
                  </div>
                  <p className="team-form-help">
                    You will receive a single-use link, valid for seven days, to
                    send yourself. No email is sent automatically.
                    Existing-account invitations are not supported.
                  </p>
                </>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <div className="modal-footer">
                <span></span>
                <div>
                  <Button
                    type="button"
                    onClick={() => setDialog(null)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : dialog.kind === "goal"
                        ? "Save goal"
                        : dialog.kind === "assignment"
                          ? "Create assignment"
                          : "Create invitation"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
