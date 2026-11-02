import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  MessageSquareText,
  Pencil,
  Play,
  Send,
} from "lucide-react";
import { api } from "../lib/api";
import { displayDate } from "../lib/date";
import { useTeam, type TeamTask, type TeamTaskStatus } from "../lib/team";
import { Button, EmptyState, Modal, SectionHeading, Status } from "./UI";

type Dialog = {
  kind: "submit" | "approve" | "revision" | "comments" | "edit" | "reviewer";
  id: string;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to save this change.";

export function TeamWorkList({
  tasks,
  emptyText,
}: {
  tasks: TeamTask[];
  emptyText: string;
}) {
  const { data, refresh } = useTeam();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!data) return null;
  const me = data.membership,
    isManager = me.role !== "member";
  const task = dialog ? data.tasks.find((item) => item.id === dialog.id) : null;
  const openDialog = (kind: Dialog["kind"], selected: TeamTask) => {
    setError("");
    setDialog({ kind, id: selected.id });
  };
  async function change(
    path: string,
    body: unknown,
    method = "PATCH",
    close = true,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, { method, body });
      await refresh();
      if (close) setDialog(null);
      setNotice("Team work updated.");
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const updateStatus = (
    selected: TeamTask,
    status: TeamTaskStatus,
    extra: Record<string, string> = {},
  ) => change(`/team/tasks/${selected.id}/status`, { status, ...extra });
  const form = (event: FormEvent<HTMLFormElement>, selected: TeamTask) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    if (dialog?.kind === "submit")
      return void updateStatus(selected, "submitted", {
        submission: String(f.get("submission")),
      });
    if (dialog?.kind === "approve")
      return void updateStatus(selected, "approved", {
        feedback: String(f.get("feedback") || ""),
      });
    if (dialog?.kind === "revision")
      return void updateStatus(selected, "revision_requested", {
        feedback: String(f.get("feedback")),
      });
    if (dialog?.kind === "comments") {
      const formElement = event.currentTarget;
      return void change(
        `/team/tasks/${selected.id}/comments`,
        { body: String(f.get("body")) },
        "POST",
        false,
      ).then((saved) => {
        if (saved) formElement.reset();
      });
    }
    if (dialog?.kind === "reviewer")
      return void change(`/team/tasks/${selected.id}`, {
        reviewer_user_id: String(f.get("reviewer")),
      });
    if (dialog?.kind === "edit")
      return void change(`/team/tasks/${selected.id}`, {
        title: String(f.get("title")),
        description: String(f.get("description") || ""),
        assignee_user_id: String(
          f.get("assignee") || selected.assignee_user_id,
        ),
        reviewer_user_id: String(f.get("reviewer")),
        goal_id: f.get("goal") || null,
        priority: String(f.get("priority")),
        due_date: f.get("due") || null,
        deliverable: String(f.get("deliverable") || ""),
      });
  };
  return (
    <>
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
      {tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing assigned here yet"
          text={emptyText}
        />
      ) : (
        <div className="team-task-list">
          {tasks.map((item) => {
            const own = item.assignee_user_id === me.user_id;
            const canReview =
              isManager &&
              !own &&
              (me.role === "owner" || item.reviewer_user_id === me.user_id);
            const editable =
              isManager &&
              ["assigned", "in_progress", "revision_requested"].includes(
                item.status,
              );
            return (
              <article className="team-task-card" key={item.id}>
                <div className="team-task-title">
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      {isManager ? `Assigned to ${item.assignee_name} · ` : ""}
                      {item.goal_title || "No linked goal"}
                      {item.due_date
                        ? ` · Due ${displayDate(item.due_date)}`
                        : " · No due date"}{" "}
                      · {item.priority} priority
                    </p>
                  </div>
                  <Status value={item.status} />
                </div>
                {item.description && (
                  <p className="team-task-description">{item.description}</p>
                )}
                {item.deliverable && (
                  <p className="team-task-detail">
                    <strong>Expected:</strong> {item.deliverable}
                  </p>
                )}
                {item.submission && (
                  <p className="team-task-detail">
                    <strong>Submission:</strong> {item.submission}
                  </p>
                )}
                {item.feedback && (
                  <p className="team-task-feedback">
                    <strong>Review feedback:</strong> {item.feedback}
                  </p>
                )}
                <div className="team-task-actions">
                  {own &&
                    ["assigned", "revision_requested"].includes(
                      item.status,
                    ) && (
                      <Button
                        icon={Play}
                        disabled={busy}
                        onClick={() => void updateStatus(item, "in_progress")}
                      >
                        {item.status === "assigned"
                          ? "Start work"
                          : "Resume work"}
                      </Button>
                    )}
                  {own && item.status === "in_progress" && (
                    <Button
                      variant="primary"
                      icon={Send}
                      disabled={busy}
                      onClick={() => openDialog("submit", item)}
                    >
                      Submit for review
                    </Button>
                  )}
                  {canReview && item.status === "submitted" && (
                    <>
                      <Button
                        variant="primary"
                        icon={ClipboardCheck}
                        onClick={() => openDialog("approve", item)}
                      >
                        Review & approve
                      </Button>
                      <Button onClick={() => openDialog("revision", item)}>
                        Request changes
                      </Button>
                    </>
                  )}
                  {canReview && item.status === "approved" && (
                    <Button
                      icon={ClipboardCheck}
                      disabled={busy}
                      onClick={() => void updateStatus(item, "completed")}
                    >
                      Mark complete
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    icon={MessageSquareText}
                    onClick={() => openDialog("comments", item)}
                  >
                    Discussion
                    {data.comments.filter((c) => c.task_id === item.id).length
                      ? ` (${data.comments.filter((c) => c.task_id === item.id).length})`
                      : ""}
                  </Button>
                  {me.role === "owner" &&
                    ["submitted", "approved"].includes(item.status) && (
                      <Button
                        variant="ghost"
                        icon={Pencil}
                        onClick={() => openDialog("reviewer", item)}
                      >
                        Change reviewer
                      </Button>
                    )}
                  {editable && (
                    <Button
                      variant="ghost"
                      icon={Pencil}
                      onClick={() => openDialog("edit", item)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {dialog && task && (
        <Modal
          title={
            dialog.kind === "submit"
              ? "Submit for review"
              : dialog.kind === "approve"
                ? "Review and approve"
                : dialog.kind === "revision"
                  ? "Request changes"
                  : dialog.kind === "edit"
                    ? "Edit assignment"
                    : dialog.kind === "reviewer"
                      ? "Change reviewer"
                      : "Task discussion"
          }
          subtitle={task.title}
          onClose={() => {
            if (!busy) {
              setDialog(null);
              setError("");
            }
          }}
          wide={dialog.kind === "edit"}
        >
          <form
            className="dialog-form team-dialog"
            onSubmit={(event) => form(event, task)}
          >
            {dialog.kind === "submit" && (
              <>
                <p className="team-form-help">
                  Share what you completed or where your reviewer can find it.
                  Submission does not mark work approved.
                </p>
                <label>
                  Submission or deliverable link
                  <textarea
                    name="submission"
                    required
                    maxLength={4000}
                    placeholder="Describe the completed work or paste a link"
                  />
                </label>
              </>
            )}
            {(dialog.kind === "approve" || dialog.kind === "revision") && (
              <>
                <div className="team-submission">
                  <span className="overline">SUBMITTED WORK</span>
                  <p>{task.submission}</p>
                </div>
                <label>
                  Review feedback
                  {dialog.kind === "approve" ? " (optional)" : ""}
                  <textarea
                    name="feedback"
                    required={dialog.kind === "revision"}
                    maxLength={4000}
                    placeholder={
                      dialog.kind === "revision"
                        ? "What should be revised?"
                        : "Add a note for the assignee"
                    }
                  />
                </label>
                <p className="team-form-help">
                  A person reviews the work; goal progress is updated
                  separately, never inferred.
                </p>
              </>
            )}
            {dialog.kind === "comments" && (
              <>
                <div className="team-comments">
                  {data.comments.filter((c) => c.task_id === task.id).length ? (
                    data.comments
                      .filter((c) => c.task_id === task.id)
                      .map((comment) => (
                        <div key={comment.id}>
                          <strong>{comment.name}</strong>
                          <small>
                            {new Date(comment.created_at).toLocaleString()}
                          </small>
                          <p>{comment.body}</p>
                        </div>
                      ))
                  ) : (
                    <p className="team-form-help">
                      No comments yet. Keep discussion relevant to this
                      assignment.
                    </p>
                  )}
                </div>
                <label>
                  Add a comment
                  <textarea
                    name="body"
                    required
                    maxLength={4000}
                    placeholder="Write a comment"
                  />
                </label>
              </>
            )}
            {dialog.kind === "reviewer" && (
              <>
                <p className="team-form-help">
                  The owner can replace an unavailable reviewer without changing
                  submitted work.
                </p>
                <label>
                  Reviewer
                  <select
                    name="reviewer"
                    required
                    defaultValue={task.reviewer_user_id || ""}
                  >
                    <option value="">Choose reviewer</option>
                    {data.members
                      .filter(
                        (person) =>
                          person.status === "active" &&
                          person.role !== "member" &&
                          person.user_id !== task.assignee_user_id,
                      )
                      .map((person) => (
                        <option key={person.user_id} value={person.user_id}>
                          {person.name} · {person.role}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            {dialog.kind === "edit" && (
              <div className="form-grid team-form-grid">
                <label className="team-span-two">
                  Assignment title
                  <input
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={task.title}
                  />
                </label>
                <label className="team-span-two">
                  Description
                  <textarea
                    name="description"
                    maxLength={4000}
                    defaultValue={task.description}
                  />
                </label>
                <label>
                  Assignee
                  <select
                    name="assignee"
                    defaultValue={task.assignee_user_id}
                    disabled={task.status !== "assigned"}
                  >
                    {data.members
                      .filter((m) => m.status === "active")
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <small>Only unstarted work can be reassigned.</small>
                </label>
                <label>
                  Reviewer
                  <select
                    name="reviewer"
                    defaultValue={task.reviewer_user_id || ""}
                    required
                  >
                    <option value="">Choose reviewer</option>
                    {data.members
                      .filter(
                        (m) => m.status === "active" && m.role !== "member",
                      )
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.name} · {m.role}
                        </option>
                      ))}
                  </select>
                  <small>Must be different from the assignee.</small>
                </label>
                <label>
                  Shared goal
                  <select name="goal" defaultValue={task.goal_id || ""}>
                    <option value="">No linked goal</option>
                    {data.goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select name="priority" defaultValue={task.priority}>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    name="due"
                    type="date"
                    defaultValue={task.due_date || ""}
                  />
                </label>
                <label>
                  Expected deliverable
                  <input
                    name="deliverable"
                    maxLength={2000}
                    defaultValue={task.deliverable}
                  />
                </label>
              </div>
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
                    : dialog.kind === "submit"
                      ? "Submit work"
                      : dialog.kind === "approve"
                        ? "Approve work"
                        : dialog.kind === "revision"
                          ? "Send feedback"
                          : dialog.kind === "comments"
                            ? "Add comment"
                            : "Save changes"}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function TeamDaySection({
  day,
  onOpenTeam,
}: {
  day: string;
  onOpenTeam: () => void;
}) {
  const { data, error, loading } = useTeam();
  const tasks =
    data?.tasks.filter(
      (task) =>
        task.assignee_user_id === data.membership.user_id &&
        task.due_date === day,
    ) || [];
  return (
    <section className="panel task-panel team-day-section">
      <SectionHeading
        title="Assigned team work"
        sub="Shared assignments due this day are separate from your personal progress."
        action={
          <button className="plain-action" onClick={onOpenTeam}>
            Team Workspace <ArrowRight size={14} />
          </button>
        }
      />
      {loading ? (
        <div className="inline-empty">Loading team work…</div>
      ) : error && !data ? (
        <div className="inline-empty">
          Team work unavailable. Open Team Workspace to retry.
        </div>
      ) : (
        <TeamWorkList
          tasks={tasks}
          emptyText="No team assignments are due on this day."
        />
      )}
    </section>
  );
}
