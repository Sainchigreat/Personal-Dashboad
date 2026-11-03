import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db, ensureTeamOwnerWorkspace, id, now } from "./db";

type Role = "owner" | "manager" | "member";
type Session = {
  user_id: string;
  email: string;
  account_type: "owner" | "team";
};
type Membership = {
  workspace_id: string;
  user_id: string;
  role: Role;
  status: string;
};
type TeamTask = {
  id: string;
  title: string;
  assignee_user_id: string;
  reviewer_user_id: string | null;
  status: string;
};
const router = Router();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid date.")
  .nullable();
const optionalId = z.string().uuid().nullable();
const short = z.string().trim().min(1).max(200);
const notes = z.string().trim().max(4000);
const session = (res: Response) => res.locals.session as Session;
const member = (res: Response) => res.locals.teamMember as Membership;
export const hashInvite = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function requireMember(_req: Request, res: Response, next: NextFunction) {
  const user = session(res);
  if (user.account_type === "owner") await ensureTeamOwnerWorkspace(user.user_id);
  const membership = await db
    .prepare(
      "SELECT workspace_id,user_id,role,status FROM team_members WHERE user_id=?",
    )
    .get(user.user_id) as Membership | undefined;
  if (!membership || membership.status !== "active")
    return res
      .status(403)
      .json({ error: "You do not have access to this team." });
  res.locals.teamMember = membership;
  return next();
}
function requireManager(_req: Request, res: Response, next: NextFunction) {
  if (!["owner", "manager"].includes(member(res).role))
    return res
      .status(403)
      .json({ error: "Only the owner or a manager can do that." });
  return next();
}
async function activeMember(workspaceId: string, userId: string) {
  return await db
    .prepare(
      "SELECT user_id,role,status FROM team_members WHERE workspace_id=? AND user_id=? AND status='active'",
    )
    .get(workspaceId, userId) as
    { user_id: string; role: Role; status: string } | undefined;
}
async function activity(
  m: Membership,
  userId: string,
  action: string,
  type: string,
  entityId: string,
  summary: string,
) {
  await db.prepare(
    "INSERT INTO team_activity(id,workspace_id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(id(), m.workspace_id, userId, action, type, entityId, summary, now());
}
async function transaction<T>(work: () => Promise<T>): Promise<T> {
  await db.exec("BEGIN IMMEDIATE");
  try {
    const result = await work();
    await db.exec("COMMIT");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
async function accessibleTask(
  m: Membership,
  taskId: string,
): Promise<TeamTask | undefined> {
  return await db
    .prepare(
      "SELECT id,title,assignee_user_id,reviewer_user_id,status FROM team_tasks WHERE id=? AND workspace_id=? AND (? != 'member' OR assignee_user_id=?)",
    )
    .get(taskId, m.workspace_id, m.role, m.user_id) as TeamTask | undefined;
}
router.use(requireMember);

router.get("/bootstrap", async (_req, res) => {
  const m = member(res);
  const wid = m.workspace_id;
  const workspace = await db
    .prepare("SELECT id,name FROM team_workspaces WHERE id=?")
    .get(wid);
  const goals = await db
    .prepare(
      `SELECT g.*,s.name AS owner_name FROM team_goals g
    LEFT JOIN settings s ON s.user_id=g.owner_user_id WHERE g.workspace_id=? ORDER BY g.created_at DESC`,
    )
    .all(wid);
  const tasks = await db
    .prepare(
      `SELECT t.*,a.name AS assignee_name,r.name AS reviewer_name,g.title AS goal_title
    FROM team_tasks t JOIN settings a ON a.user_id=t.assignee_user_id
    LEFT JOIN settings r ON r.user_id=t.reviewer_user_id
    LEFT JOIN team_goals g ON g.id=t.goal_id
    WHERE t.workspace_id=? AND (? != 'member' OR t.assignee_user_id=?)
    ORDER BY CASE t.status WHEN 'submitted' THEN 0 WHEN 'revision_requested' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'assigned' THEN 3 ELSE 4 END,t.due_date,t.created_at DESC`,
    )
    .all(wid, m.role, m.user_id);
  const members = await db
    .prepare(
      `SELECT m.user_id,m.role,m.status,m.joined_at,s.name,
    CASE WHEN ?='member' AND m.user_id!=? THEN NULL ELSE u.email END AS email
    FROM team_members m JOIN users u ON u.id=m.user_id JOIN settings s ON s.user_id=m.user_id
    WHERE m.workspace_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,s.name`,
    )
    .all(m.role, m.user_id, wid);
  const events = await db
    .prepare(
      `SELECT a.id,a.action,a.entity_type,a.entity_id,a.summary,a.created_at,s.name
    FROM team_activity a JOIN settings s ON s.user_id=a.actor_user_id
    WHERE a.workspace_id=? AND (? != 'member' OR a.entity_type='goal' OR
      (a.entity_type='task' AND EXISTS(SELECT 1 FROM team_tasks t WHERE t.id=a.entity_id AND t.workspace_id=a.workspace_id AND t.assignee_user_id=?)))
    ORDER BY a.created_at DESC LIMIT 50`,
    )
    .all(wid, m.role, m.user_id);
  const comments = await db
    .prepare(
      `SELECT c.*,s.name FROM team_comments c JOIN team_tasks t ON t.id=c.task_id
    JOIN settings s ON s.user_id=c.user_id
    WHERE t.workspace_id=? AND (? != 'member' OR t.assignee_user_id=?) ORDER BY c.created_at`,
    )
    .all(wid, m.role, m.user_id);
  const invites =
    m.role === "member"
      ? []
      : await db
          .prepare(
            "SELECT id,email,role,expires_at,created_at FROM team_invites WHERE workspace_id=? AND accepted_at IS NULL AND expires_at>? ORDER BY created_at DESC",
          )
          .all(wid, Date.now());
  const preferences = await db
    .prepare("SELECT theme FROM settings WHERE user_id=?")
    .get(m.user_id);
  res.json({
    workspace,
    membership: m,
    goals,
    tasks,
    members,
    activity: events,
    comments,
    invites,
    preferences,
  });
});

router.patch("/preferences", async (req, res, next) => {
  try {
    const input = z
      .object({ theme: z.enum(["system", "dark", "light"]) })
      .strict()
      .parse(req.body);
    await db.prepare("UPDATE settings SET theme=?,updated_at=? WHERE user_id=?").run(
      input.theme,
      now(),
      member(res).user_id,
    );
    res.json(input);
  } catch (error) {
    next(error);
  }
});

router.post("/invites", requireManager, async (req, res, next) => {
  try {
    if (process.env.MOMENTUM_PREVIEW === "1")
      return res.status(403).json({
        error:
          "Invitations are unavailable in the public sandbox. Use a private deployment.",
      });
    const input = z
      .object({
        email: z.string().trim().email().max(254),
        role: z.enum(["manager", "member"]),
      })
      .strict()
      .parse(req.body);
    const m = member(res),
      email = input.email.toLowerCase();
    if (input.role === "manager" && m.role !== "owner")
      return res
        .status(403)
        .json({ error: "Only the owner can invite a manager." });
    if (await db.prepare("SELECT id FROM users WHERE lower(email)=?").get(email))
      return res.status(409).json({
        error:
          "This email already has an account. Existing-account invitations are not supported yet.",
      });
    const existingInvite = await db
      .prepare(
        "SELECT role FROM team_invites WHERE workspace_id=? AND lower(email)=? AND accepted_at IS NULL AND expires_at>?",
      )
      .get(m.workspace_id, email, Date.now()) as { role: Role } | undefined;
    if (m.role !== "owner" && existingInvite?.role === "manager")
      return res
        .status(403)
        .json({ error: "Only the owner can replace a manager invitation." });
    const inviteToken = randomBytes(32).toString("base64url"),
      inviteId = id(),
      expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await transaction(async () => {
      await db.prepare(
        "DELETE FROM team_invites WHERE workspace_id=? AND lower(email)=? AND accepted_at IS NULL",
      ).run(m.workspace_id, email);
      await db.prepare(
        "INSERT INTO team_invites(id,workspace_id,email,role,token_hash,invited_by,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        inviteId,
        m.workspace_id,
        email,
        input.role,
        hashInvite(inviteToken),
        m.user_id,
        expires,
        now(),
      );
      await activity(
        m,
        m.user_id,
        "invited",
        "invite",
        inviteId,
        `Created an invitation for ${email}`,
      );
    });
    return res.status(201).json({
      id: inviteId,
      email,
      role: input.role,
      token: inviteToken,
      expires_at: new Date(expires).toISOString(),
      join_path: `/#join?token=${inviteToken}`,
    });
  } catch (error) {
    return next(error);
  }
});
router.delete("/invites/:id", requireManager, async (req, res, next) => {
  try {
    const m = member(res);
    const invite = await db
      .prepare(
        "SELECT id,role,email FROM team_invites WHERE id=? AND workspace_id=? AND accepted_at IS NULL",
      )
      .get(req.params.id, m.workspace_id) as
      { id: string; role: Role; email: string } | undefined;
    if (!invite)
      return res.status(404).json({ error: "Invitation not found." });
    if (invite.role === "manager" && m.role !== "owner")
      return res
        .status(403)
        .json({ error: "Only the owner can revoke a manager invitation." });
    await transaction(async () => {
      await db.prepare("DELETE FROM team_invites WHERE id=? AND workspace_id=?").run(
        invite.id,
        m.workspace_id,
      );
      await activity(
        m,
        m.user_id,
        "revoked",
        "invite",
        invite.id,
        `Revoked the invitation for ${invite.email}`,
      );
    });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
router.patch("/members/:userId", requireManager, async (req, res, next) => {
  try {
    const input = z
      .object({
        status: z.enum(["active", "suspended"]).optional(),
        role: z.enum(["manager", "member"]).optional(),
      })
      .strict()
      .refine((v) => v.status || v.role, "Choose a change.")
      .parse(req.body);
    const m = member(res);
    const target = await db
      .prepare(
        "SELECT user_id,role,status FROM team_members WHERE workspace_id=? AND user_id=?",
      )
      .get(m.workspace_id, req.params.userId) as
      { user_id: string; role: Role; status: string } | undefined;
    if (!target) return res.status(404).json({ error: "Member not found." });
    if (target.role === "owner" || target.user_id === m.user_id)
      return res.status(403).json({
        error: "You cannot change your own or the owner's access here.",
      });
    if (m.role !== "owner" && (target.role === "manager" || input.role))
      return res
        .status(403)
        .json({ error: "Only the owner can change manager access or roles." });
    await transaction(async () => {
      await db.prepare(
        "UPDATE team_members SET status=?,role=? WHERE workspace_id=? AND user_id=?",
      ).run(
        input.status ?? target.status,
        input.role ?? target.role,
        m.workspace_id,
        target.user_id,
      );
      if (input.status === "suspended")
        await db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(
          target.user_id,
        );
      await activity(
        m,
        m.user_id,
        "updated",
        "member",
        target.user_id,
        "Updated a member's team access",
      );
    });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

// Remove a member from the workspace. The account itself is preserved; only
// its membership and active sessions are revoked. The owner cannot be removed.
router.delete("/members/:userId", requireManager, async (req, res, next) => {
  try {
    const m = member(res);
    const target = await db
      .prepare(
        "SELECT user_id,role,status FROM team_members WHERE workspace_id=? AND user_id=?",
      )
      .get(m.workspace_id, req.params.userId) as
      { user_id: string; role: Role; status: string } | undefined;
    if (!target) return res.status(404).json({ error: "Member not found." });
    if (target.role === "owner")
      return res.status(403).json({ error: "The workspace owner cannot be removed." });
    if (target.user_id === m.user_id)
      return res.status(403).json({ error: "Use Leave team to remove yourself." });
    if (m.role !== "owner" && target.role === "manager")
      return res
        .status(403)
        .json({ error: "Only the owner can remove a manager." });
    await transaction(async () => {
      await activity(
        m,
        m.user_id,
        "removed",
        "member",
        target.user_id,
        "Removed a member from the team",
      );
      await db
        .prepare("DELETE FROM team_members WHERE workspace_id=? AND user_id=?")
        .run(m.workspace_id, target.user_id);
      await db
        .prepare("DELETE FROM auth_sessions WHERE user_id=?")
        .run(target.user_id);
    });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

// A member may leave a team they do not own. Explicit action, never automatic.
router.post("/leave", async (req, res, next) => {
  try {
    const m = member(res);
    if (m.role === "owner")
      return res.status(403).json({
        error: "The owner cannot leave their own workspace. Remove other members or delete your account instead.",
      });
    await transaction(async () => {
      await activity(m, m.user_id, "left", "member", m.user_id, "Left the team");
      await db
        .prepare("DELETE FROM team_members WHERE workspace_id=? AND user_id=?")
        .run(m.workspace_id, m.user_id);
    });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

const goalFields = {
  title: short,
  description: notes.default(""),
  target: z.number().positive().max(1_000_000_000),
  current: z.number().min(0).max(1_000_000_000).default(0),
  unit: z.string().trim().min(1).max(40).default("deliverables"),
  due_date: date.default(null),
  owner_user_id: optionalId.default(null),
};
router.post("/goals", requireManager, async (req, res, next) => {
  try {
    const input = z.object(goalFields).strict().parse(req.body),
      m = member(res);
    if (
      input.owner_user_id &&
      !await activeMember(m.workspace_id, input.owner_user_id)
    )
      return res
        .status(400)
        .json({ error: "Goal owner must be an active team member." });
    const gid = id(),
      stamp = now();
    await transaction(async () => {
      await db.prepare(
        "INSERT INTO team_goals(id,workspace_id,title,description,target,current,unit,due_date,owner_user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        gid,
        m.workspace_id,
        input.title,
        input.description,
        input.target,
        input.current,
        input.unit,
        input.due_date,
        input.owner_user_id,
        m.user_id,
        stamp,
        stamp,
      );
      await activity(
        m,
        m.user_id,
        "created",
        "goal",
        gid,
        `Created the shared goal: ${input.title}`,
      );
    });
    return res
      .status(201)
      .json(
        await db
          .prepare("SELECT * FROM team_goals WHERE id=? AND workspace_id=?")
          .get(gid, m.workspace_id),
      );
  } catch (error) {
    return next(error);
  }
});
router.patch("/goals/:id", requireManager, async (req, res, next) => {
  try {
    // PATCH must not apply create-time defaults: doing so would silently reset
    // progress, descriptions, or dates when only one field changes.
    const input = z
        .object({
          title: short.optional(),
          description: notes.optional(),
          target: z.number().positive().max(1_000_000_000).optional(),
          current: z.number().min(0).max(1_000_000_000).optional(),
          unit: z.string().trim().min(1).max(40).optional(),
          due_date: date.optional(),
          owner_user_id: optionalId.optional(),
        })
        .strict()
        .parse(req.body),
      m = member(res);
    const goal = await db
      .prepare("SELECT id,title FROM team_goals WHERE id=? AND workspace_id=?")
      .get(req.params.id, m.workspace_id) as
      { id: string; title: string } | undefined;
    if (!goal) return res.status(404).json({ error: "Goal not found." });
    if (
      input.owner_user_id &&
      !await activeMember(m.workspace_id, input.owner_user_id)
    )
      return res
        .status(400)
        .json({ error: "Goal owner must be an active team member." });
    const keys = Object.keys(input) as Array<keyof typeof input>;
    if (!keys.length)
      return res.status(400).json({ error: "Choose a change." });
    await transaction(async () => {
      await db.prepare(
        `UPDATE team_goals SET ${keys.map((key) => `${key}=?`).join(",")},updated_at=? WHERE id=? AND workspace_id=?`,
      ).run(
        ...keys.map((key) => input[key] as string | number | null),
        now(),
        goal.id,
        m.workspace_id,
      );
      await activity(
        m,
        m.user_id,
        "updated",
        "goal",
        goal.id,
        `Updated the shared goal: ${input.title ?? goal.title}`,
      );
    });
    return res.json(
      await db
        .prepare("SELECT * FROM team_goals WHERE id=? AND workspace_id=?")
        .get(goal.id, m.workspace_id),
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/tasks", requireManager, async (req, res, next) => {
  try {
    const input = z
      .object({
        title: short,
        description: notes.default(""),
        assignee_user_id: z.string().uuid(),
        goal_id: optionalId.default(null),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        due_date: date.default(null),
        deliverable: z.string().trim().max(2000).default(""),
        reviewer_user_id: optionalId.default(null),
      })
      .strict()
      .parse(req.body);
    const m = member(res),
      reviewer = input.reviewer_user_id ?? m.user_id;
    if (!await activeMember(m.workspace_id, input.assignee_user_id))
      return res
        .status(400)
        .json({ error: "Assignee must be an active team member." });
    const reviewMember = await activeMember(m.workspace_id, reviewer);
    if (!reviewMember || reviewMember.role === "member")
      return res
        .status(400)
        .json({ error: "Reviewer must be an active owner or manager." });
    if (reviewer === input.assignee_user_id)
      return res
        .status(400)
        .json({ error: "Choose a reviewer other than the assignee." });
    if (
      input.goal_id &&
      !await db
        .prepare("SELECT id FROM team_goals WHERE id=? AND workspace_id=?")
        .get(input.goal_id, m.workspace_id)
    )
      return res
        .status(400)
        .json({ error: "Selected team goal is unavailable." });
    const tid = id(),
      stamp = now();
    await transaction(async () => {
      await db.prepare(
        "INSERT INTO team_tasks(id,workspace_id,title,description,assignee_user_id,goal_id,priority,due_date,deliverable,reviewer_user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        tid,
        m.workspace_id,
        input.title,
        input.description,
        input.assignee_user_id,
        input.goal_id,
        input.priority,
        input.due_date,
        input.deliverable,
        reviewer,
        m.user_id,
        stamp,
        stamp,
      );
      await activity(
        m,
        m.user_id,
        "assigned",
        "task",
        tid,
        `Assigned: ${input.title}`,
      );
    });
    return res
      .status(201)
      .json(
        await db
          .prepare("SELECT * FROM team_tasks WHERE id=? AND workspace_id=?")
          .get(tid, m.workspace_id),
      );
  } catch (error) {
    return next(error);
  }
});
router.patch("/tasks/:id", requireManager, async (req, res, next) => {
  try {
    const input = z
      .object({
        title: short.optional(),
        description: notes.optional(),
        assignee_user_id: z.string().uuid().optional(),
        goal_id: optionalId.optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        due_date: date.optional(),
        deliverable: z.string().trim().max(2000).optional(),
        reviewer_user_id: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    const m = member(res),
      task = await accessibleTask(m, req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found." });
    const keys = Object.keys(input) as Array<keyof typeof input>;
    if (!keys.length)
      return res.status(400).json({ error: "Choose a change." });
    const reviewerOnly =
      ["submitted", "approved"].includes(task.status) &&
      keys.length === 1 &&
      keys[0] === "reviewer_user_id";
    // Preserve submitted evidence, while letting the owner replace an
    // unavailable reviewer without rewriting the work under review.
    if (reviewerOnly && m.role !== "owner")
      return res.status(403).json({
        error: "Only the owner can replace the reviewer after submission.",
      });
    if (
      !reviewerOnly &&
      !["assigned", "in_progress", "revision_requested"].includes(task.status)
    )
      return res.status(409).json({
        error:
          "Submitted or reviewed work cannot be edited. Request changes first.",
      });
    if (
      input.assignee_user_id &&
      input.assignee_user_id !== task.assignee_user_id &&
      task.status !== "assigned"
    )
      return res
        .status(409)
        .json({ error: "Reassign work before it is started." });
    const assignee = input.assignee_user_id ?? task.assignee_user_id;
    const reviewer = input.reviewer_user_id ?? task.reviewer_user_id;
    if (!await activeMember(m.workspace_id, assignee))
      return res
        .status(400)
        .json({ error: "Assignee must be an active team member." });
    const reviewMember = reviewer && await activeMember(m.workspace_id, reviewer);
    if (!reviewMember || reviewMember.role === "member")
      return res
        .status(400)
        .json({ error: "Reviewer must be an active owner or manager." });
    if (assignee === reviewer)
      return res
        .status(400)
        .json({ error: "Choose a reviewer other than the assignee." });
    if (
      input.goal_id &&
      !await db
        .prepare("SELECT id FROM team_goals WHERE id=? AND workspace_id=?")
        .get(input.goal_id, m.workspace_id)
    )
      return res
        .status(400)
        .json({ error: "Selected team goal is unavailable." });
    await transaction(async () => {
      await db.prepare(
        `UPDATE team_tasks SET ${keys.map((key) => `${key}=?`).join(",")},updated_at=? WHERE id=? AND workspace_id=?`,
      ).run(
        ...keys.map((key) => input[key] as string | null),
        now(),
        task.id,
        m.workspace_id,
      );
      await activity(
        m,
        m.user_id,
        "updated",
        "task",
        task.id,
        `Updated: ${input.title ?? task.title}`,
      );
    });
    return res.json(
      await db
        .prepare("SELECT * FROM team_tasks WHERE id=? AND workspace_id=?")
        .get(task.id, m.workspace_id),
    );
  } catch (error) {
    return next(error);
  }
});
router.patch("/tasks/:id/status", async (req, res, next) => {
  try {
    const input = z
      .object({
        status: z.enum([
          "in_progress",
          "submitted",
          "revision_requested",
          "approved",
          "completed",
        ]),
        feedback: notes.optional(),
        submission: notes.optional(),
      })
      .strict()
      .parse(req.body);
    const m = member(res),
      task = await accessibleTask(m, req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found." });
    const workAction = ["in_progress", "submitted"].includes(input.status);
    if (workAction && task.assignee_user_id !== m.user_id)
      return res
        .status(403)
        .json({ error: "Only the assignee can update this work." });
    if (
      !workAction &&
      (task.assignee_user_id === m.user_id ||
        m.role === "member" ||
        (m.role !== "owner" && task.reviewer_user_id !== m.user_id))
    )
      return res.status(403).json({
        error: "Only the designated reviewer or owner can review this work.",
      });
    const transitions: Record<string, string[]> = {
      assigned: ["in_progress"],
      in_progress: ["submitted"],
      revision_requested: ["in_progress"],
      submitted: ["approved", "revision_requested"],
      approved: ["completed"],
    };
    if (!transitions[task.status]?.includes(input.status))
      return res.status(409).json({
        error: "That status change is not available from the current stage.",
      });
    if (input.status === "submitted" && !input.submission?.trim())
      return res.status(400).json({
        error: "Describe the work or add a deliverable link before submitting.",
      });
    if (input.status === "revision_requested" && !input.feedback?.trim())
      return res
        .status(400)
        .json({ error: "Add feedback so the assignee knows what to revise." });
    const stamp = now();
    await transaction(async () => {
      await db.prepare(
        `UPDATE team_tasks SET status=?,
        submission=CASE WHEN ?='submitted' THEN ? ELSE submission END,
        feedback=CASE WHEN ? IN ('approved','revision_requested') THEN ? ELSE feedback END,
        submitted_at=CASE WHEN ?='submitted' THEN ? ELSE submitted_at END,
        reviewed_at=CASE WHEN ? IN ('approved','revision_requested') THEN ? ELSE reviewed_at END,
        updated_at=? WHERE id=? AND workspace_id=?`,
      ).run(
        input.status,
        input.status,
        input.submission ?? "",
        input.status,
        input.feedback ?? "",
        input.status,
        stamp,
        input.status,
        stamp,
        stamp,
        task.id,
        m.workspace_id,
      );
      await activity(
        m,
        m.user_id,
        "changed_status",
        "task",
        task.id,
        `${task.title}: ${input.status.replaceAll("_", " ")}`,
      );
    });
    return res.json(
      await db
        .prepare("SELECT * FROM team_tasks WHERE id=? AND workspace_id=?")
        .get(task.id, m.workspace_id),
    );
  } catch (error) {
    return next(error);
  }
});
router.post("/tasks/:id/comments", async (req, res, next) => {
  try {
    const input = z
        .object({ body: notes.min(1) })
        .strict()
        .parse(req.body),
      m = member(res),
      task = await accessibleTask(m, req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found." });
    const cid = id(),
      stamp = now();
    await transaction(async () => {
      await db.prepare(
        "INSERT INTO team_comments(id,task_id,user_id,body,created_at) VALUES (?,?,?,?,?)",
      ).run(cid, task.id, m.user_id, input.body, stamp);
      await activity(
        m,
        m.user_id,
        "commented",
        "task",
        task.id,
        `Commented on: ${task.title}`,
      );
    });
    return res.status(201).json({
      id: cid,
      task_id: task.id,
      user_id: m.user_id,
      body: input.body,
      created_at: stamp,
    });
  } catch (error) {
    return next(error);
  }
});
export default router;
