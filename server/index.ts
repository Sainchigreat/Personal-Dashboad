import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import {
  db,
  id,
  now,
  createWorkspace,
  ensureDailyPlan,
  dateInZone,
} from "./db";
import {
  configs,
  foreignKeys,
  settingsSchema,
  type Resource,
} from "./validation";

const app = express();
const port = Number(process.env.PORT || 3001);
const preview = process.env.MOMENTUM_PREVIEW === "1";
if (preview && process.env.NODE_ENV === "production")
  throw new Error("Preview sign-in cannot be enabled in production.");
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(express.json({ limit: "1mb" }));

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");
const sessionCookie = "momentum_session";
type UserSession = { user_id: string; csrf_token: string; email: string };
function getSession(req: Request): UserSession | undefined {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`));
  // Preview frames can be cross-site and block cookies. A short-lived bearer is accepted only in explicitly insecure preview mode.
  const bearer =
    preview && req.get("authorization")?.startsWith("Bearer ")
      ? req.get("authorization")!.slice(7)
      : "";
  const token =
    bearer || (cookie ? cookie.slice(sessionCookie.length + 1) : "");
  if (!token) return undefined;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return undefined;
  return db
    .prepare(
      `SELECT s.user_id,s.csrf_token,u.email FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
    )
    .get(hash(token), Date.now()) as UserSession | undefined;
}
function setSession(res: Response, userId: string) {
  const token = randomToken();
  const csrf = randomToken();
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 30;
  db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(Date.now());
  db.prepare(
    "INSERT INTO auth_sessions(token_hash,user_id,csrf_token,expires_at) VALUES (?,?,?,?)",
  ).run(hash(token), userId, csrf, expires);
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  return { csrfToken: csrf, token };
}
function clearSession(req: Request, res: Response) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`));
  const bearer =
    preview && req.get("authorization")?.startsWith("Bearer ")
      ? req.get("authorization")!.slice(7)
      : "";
  const token =
    bearer || (cookie ? cookie.slice(sessionCookie.length + 1) : "");
  if (token)
    db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hash(token));
  res.clearCookie(sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}
// Small in-memory throttle; put a reverse-proxy rate limiter in front of a production deployment too.
const attempts = new Map<string, { count: number; expires: number }>();
function authThrottle(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || "unknown";
  const current = attempts.get(key);
  if (!current || current.expires < Date.now())
    attempts.set(key, { count: 1, expires: Date.now() + 15 * 60_000 });
  else if (current.count >= 12)
    return res
      .status(429)
      .json({ error: "Too many attempts. Please try again later." });
  else current.count++;
  return next();
}
function requireUser(req: Request, res: Response, next: NextFunction) {
  const session = getSession(req);
  if (!session)
    return res.status(401).json({ error: "Please sign in to continue." });
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("x-csrf-token") !== session.csrf_token
  )
    return res
      .status(403)
      .json({ error: "Your session changed. Refresh and try again." });
  res.locals.session = session;
  return next();
}
if (
  preview &&
  !db
    .prepare("SELECT id FROM users WHERE email=?")
    .get("preview@momentum.local")
) {
  createWorkspace(
    id(),
    "preview@momentum.local",
    bcrypt.hashSync(randomToken(), 10),
    "Chisom Ogbonna",
  );
}

app.get("/api/auth/status", (req, res) => {
  const session = getSession(req);
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
    count: number;
  };
  res.json({
    authenticated: Boolean(session),
    needsSetup: count.count === 0,
    previewEnabled: preview,
    csrfToken: session?.csrf_token || null,
    email: session?.email || null,
  });
});
app.post("/api/auth/register", authThrottle, async (req, res, next) => {
  try {
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z.string().trim().email().max(254),
        password: z.string().min(12).max(200),
      })
      .strict()
      .parse(req.body);
    const count = db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
      count: number;
    };
    if (count.count > 0)
      return res
        .status(403)
        .json({ error: "This private workspace has already been set up." });
    const userId = id();
    const passwordHash = await bcrypt.hash(input.password, 12);
    // Recheck after the asynchronous hash; only one owner is allowed.
    const afterHash = db
      .prepare("SELECT COUNT(*) AS count FROM users")
      .get() as { count: number };
    if (afterHash.count > 0)
      return res
        .status(403)
        .json({ error: "This private workspace has already been set up." });
    createWorkspace(userId, input.email, passwordHash, input.name);
    res.json({ csrfToken: setSession(res, userId).csrfToken });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/login", authThrottle, async (req, res, next) => {
  try {
    const input = z
      .object({
        email: z.string().trim().email().max(254),
        password: z.string().max(200),
      })
      .strict()
      .parse(req.body);
    const user = db
      .prepare("SELECT id,password_hash FROM users WHERE email=?")
      .get(input.email.toLowerCase()) as
      { id: string; password_hash: string } | undefined;
    // Verify against a fixed hash for unknown accounts to avoid a cheap account-existence timing oracle.
    const matches = await bcrypt.compare(
      input.password,
      user?.password_hash ||
        "$2b$12$C6UzMDM.H6dfI/f/IKcEe.ouQvB9ynvFq4EejZ4y4xO6K3mQZsVTa",
    );
    if (!user || !matches)
      return res.status(401).json({ error: "Email or password is incorrect." });
    res.json({ csrfToken: setSession(res, user.id).csrfToken });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/preview", authThrottle, (_req, res) => {
  if (!preview) return res.status(404).json({ error: "Not found." });
  const user = db
    .prepare("SELECT id FROM users WHERE email=?")
    .get("preview@momentum.local") as { id: string };
  const session = setSession(res, user.id);
  return res.json({
    csrfToken: session.csrfToken,
    previewToken: session.token,
  });
});
app.post("/api/auth/logout", requireUser, (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

const resources = Object.keys(configs) as Resource[];
function tableRows(resource: Resource, userId: string) {
  return db
    .prepare(
      `SELECT * FROM ${resource} WHERE user_id=? ORDER BY created_at DESC`,
    )
    .all(userId);
}
function getBootstrap(userId: string) {
  const settings = db
    .prepare("SELECT * FROM settings WHERE user_id=?")
    .get(userId);
  const result: Record<string, unknown> = { settings };
  for (const resource of resources)
    result[resource] = tableRows(resource, userId);
  return result;
}
app.get("/api/bootstrap", requireUser, (_req, res) => {
  const userId = (res.locals.session as UserSession).user_id;
  ensureDailyPlan(userId);
  res.json(getBootstrap(userId));
});
app.get("/api/export", requireUser, (_req, res) => {
  const userId = (res.locals.session as UserSession).user_id;
  res.json({
    format: "momentum-os-export",
    version: 1,
    exported_at: now(),
    data: getBootstrap(userId),
  });
});
app.patch("/api/settings", requireUser, (req, res, next) => {
  try {
    const userId = (res.locals.session as UserSession).user_id;
    const data = settingsSchema.parse(req.body) as Record<
      string,
      string | number
    >;
    const existing = db
      .prepare("SELECT * FROM settings WHERE user_id=?")
      .get(userId) as Record<string, string | number>;
    if (
      String(data.work_start ?? existing.work_start) >=
      String(data.work_end ?? existing.work_end)
    )
      return res
        .status(400)
        .json({ error: "Workday end must be after its start." });
    const keys = Object.keys(data);
    if (keys.length)
      db.prepare(
        `UPDATE settings SET ${keys.map((key) => `${key}=?`).join(",")},updated_at=? WHERE user_id=?`,
      ).run(...keys.map((key) => data[key]), now(), userId);
    return res.json(
      db.prepare("SELECT * FROM settings WHERE user_id=?").get(userId),
    );
  } catch (error) {
    return next(error);
  }
});

const rolloverSchema = z
  .object({
    source_cycle_id: z.string().uuid(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    theme: z.string().trim().max(240),
    objective: z.string().trim().max(20000),
    objectives: z.string().trim().max(20000),
    sales_target: z.number().int().min(0).max(1_000_000_000),
    revenue_target: z.number().min(0).max(1_000_000_000),
    outreach_target: z.number().int().min(0).max(1_000_000_000),
    projects_target: z.number().int().min(0).max(1_000_000_000),
    chapter_content_target: z.number().int().min(0).max(1_000_000_000),
    course_days: z.string().regex(/^(?:[0-6](?:,[0-6])*)?$/),
    session_day: z.number().int().min(0).max(6),
    carry_tasks: z.boolean(),
  })
  .strict();
app.post("/api/cycles/rollover", requireUser, (req, res, next) => {
  try {
    const data = rolloverSchema.parse(req.body);
    const userId = (res.locals.session as UserSession).user_id;
    const source = db
      .prepare("SELECT id FROM cycles WHERE id=? AND user_id=?")
      .get(data.source_cycle_id, userId);
    if (!source)
      return res.status(404).json({ error: "Source cycle not found." });
    if (
      db
        .prepare("SELECT id FROM cycles WHERE user_id=? AND month=?")
        .get(userId, data.month)
    )
      return res.status(409).json({
        error:
          "A cycle for that month already exists. Select it from the cycle menu.",
      });
    const newId = id();
    const stamp = now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "UPDATE cycles SET status='archived',updated_at=? WHERE user_id=? AND status='active'",
      ).run(stamp, userId);
      db.prepare(
        `INSERT INTO cycles(id,user_id,month,theme,objective,objectives,sales_target,revenue_target,outreach_target,projects_target,chapter_content_target,course_days,session_day,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`,
      ).run(
        newId,
        userId,
        data.month,
        data.theme,
        data.objective,
        data.objectives,
        data.sales_target,
        data.revenue_target,
        data.outreach_target,
        data.projects_target,
        data.chapter_content_target,
        data.course_days,
        data.session_day,
        stamp,
        stamp,
      );
      if (data.carry_tasks) {
        const tasks = db
          .prepare(
            "SELECT * FROM tasks WHERE user_id=? AND cycle_id=? AND status IN ('todo','in_progress','deferred')",
          )
          .all(userId, data.source_cycle_id) as Array<
          Record<string, string | number | null>
        >;
        const insert =
          db.prepare(`INSERT INTO tasks(id,user_id,cycle_id,project_id,session_id,carried_from_id,title,description,category,priority,status,due_date,scheduled_time,estimated_minutes,actual_minutes,sort_order,notes,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,'todo',?,?,?,?,?,?,?,?)`);
        for (const task of tasks) {
          const first = `${data.month}-01`;
          const due =
            task.due_date && String(task.due_date) >= first
              ? String(task.due_date)
              : first;
          insert.run(
            id(),
            userId,
            newId,
            task.project_id,
            task.session_id,
            task.id,
            task.title,
            task.description,
            task.category,
            task.priority,
            due,
            task.scheduled_time,
            task.estimated_minutes,
            task.actual_minutes,
            task.sort_order,
            task.notes,
            stamp,
            stamp,
          );
          db.prepare(
            "UPDATE tasks SET status='carried',updated_at=? WHERE id=? AND user_id=?",
          ).run(stamp, task.id, userId);
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return res
      .status(201)
      .json(
        db
          .prepare("SELECT * FROM cycles WHERE id=? AND user_id=?")
          .get(newId, userId),
      );
  } catch (error) {
    return next(error);
  }
});

function resourceFor(value: string): Resource | undefined {
  return resources.find((resource) => resource === value);
}
function validateReferences(data: Record<string, unknown>, userId: string) {
  for (const [key, table] of Object.entries(foreignKeys)) {
    if (typeof data[key] === "string" && data[key]) {
      const row = db
        .prepare(`SELECT id FROM ${table} WHERE id=? AND user_id=?`)
        .get(data[key] as string, userId);
      if (!row) throw new Error(`INVALID_REFERENCE:${key}`);
    }
  }
}
function normalize(data: Record<string, unknown>) {
  for (const key of Object.keys(data)) {
    if (
      data[key] === "" &&
      (key.endsWith("_id") ||
        key.endsWith("_date") ||
        ["day", "week_start", "researched_at"].includes(key))
    )
      data[key] = null;
  }
  return data;
}
function validateBusinessRules(
  resource: Resource,
  data: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  userId: string,
) {
  if (
    resource === "content_items" &&
    existing &&
    [
      "title",
      "body",
      "ai_assisted",
      "session_id",
      "project_id",
      "asset_url",
    ].some((key) => key in data && data[key] !== existing[key]) &&
    !("human_approved" in data)
  )
    data.human_approved = 0;
  const combined = { ...(existing || {}), ...data };
  if (
    resource === "sales" &&
    combined.status === "paid" &&
    Number(combined.amount) <= 0
  )
    throw new Error(
      "VALIDATION:A confirmed paid sale must have an amount greater than zero.",
    );
  if (resource === "sales" && combined.cycle_id && combined.sale_date) {
    const selected = db
      .prepare("SELECT month FROM cycles WHERE id=? AND user_id=?")
      .get(String(combined.cycle_id), userId) as { month: string } | undefined;
    if (selected && !String(combined.sale_date).startsWith(selected.month))
      throw new Error(
        "VALIDATION:Sale date must fall within its operating cycle.",
      );
  }
  if (
    resource === "content_items" &&
    ["Published", "Distributed"].includes(String(combined.status)) &&
    (combined.ai_assisted === 1 || combined.session_id) &&
    combined.human_approved !== 1
  ) {
    throw new Error(
      "VALIDATION:Human review and approval are required before marking this content published.",
    );
  }
  const profile = db
    .prepare("SELECT timezone FROM settings WHERE user_id=?")
    .get(userId) as { timezone: string };
  if (resource === "tasks" && "status" in data) {
    if (data.status === "done" && existing?.status !== "done")
      data.completed_at = now();
    if (data.status !== "done" && existing?.status === "done")
      data.completed_at = null;
  }
  if (resource === "projects" && "stage" in data) {
    if (data.stage === "Completed" && existing?.stage !== "Completed")
      data.completed_at = now();
    if (data.stage !== "Completed" && existing?.stage === "Completed")
      data.completed_at = null;
  }
  if (
    resource === "content_items" &&
    ["Published", "Distributed"].includes(String(combined.status)) &&
    !combined.published_date
  )
    data.published_date = dateInZone(profile.timezone);
}
function makeSessionPlan(
  userId: string,
  sessionId: string,
  data: Record<string, unknown>,
) {
  const stamp = now();
  const checklist = [
    "Choose the topic and central question",
    "Confirm the guest",
    "Prepare the promotional assets",
    "Share the announcement and reminders",
    "Collect audience questions",
    "Prepare the live session",
    "Save the recording and transcript",
    "Review and approve the article or summary",
    "Share the replay and lessons",
  ];
  const insert = db.prepare(
    "INSERT INTO session_checklists(id,user_id,session_id,title,done,sort_order,created_at,updated_at) VALUES (?,?,?,?,0,?,?,?)",
  );
  checklist.forEach((title, index) =>
    insert.run(id(), userId, sessionId, title, index, stamp, stamp),
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks(id,user_id,cycle_id,session_id,title,category,priority,status,due_date,estimated_minutes,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,'Next Chapter','medium','todo',?,0,?,?,?)`,
  );
  [
    "Prepare promotion",
    "Plan the session",
    "Review the post-session editorial",
  ].forEach((title, index) => {
    insertTask.run(
      id(),
      userId,
      (data.cycle_id as string | null) || null,
      sessionId,
      `${title}: ${String(data.title)}`,
      data.session_date as string,
      100 + index,
      stamp,
      stamp,
    );
  });
}

app.post("/api/:resource", requireUser, (req, res, next) => {
  try {
    const resource = resourceFor(req.params.resource);
    if (!resource || resource === "cycles")
      return res.status(404).json({ error: "Resource not found." });
    const userId = (res.locals.session as UserSession).user_id;
    const config = configs[resource];
    const data = normalize(
      config.schema.parse(req.body) as Record<string, unknown>,
    );
    for (const key of config.required)
      if (data[key] === undefined || data[key] === null || data[key] === "")
        return res
          .status(400)
          .json({ error: `${key.replaceAll("_", " ")} is required.` });
    validateReferences(data, userId);
    validateBusinessRules(resource, data, undefined, userId);
    const newId = id();
    const stamp = now();
    const fields = [
      "id",
      "user_id",
      ...Object.keys(data),
      "created_at",
      "updated_at",
    ];
    const values = [
      newId,
      userId,
      ...Object.values(data),
      stamp,
      stamp,
    ] as Array<string | number | null>;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        `INSERT INTO ${resource}(${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`,
      ).run(...values);
      if (resource === "chapter_sessions") makeSessionPlan(userId, newId, data);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return res
      .status(201)
      .json(
        db
          .prepare(`SELECT * FROM ${resource} WHERE id=? AND user_id=?`)
          .get(newId, userId),
      );
  } catch (error) {
    return next(error);
  }
});
app.patch("/api/:resource/:id", requireUser, (req, res, next) => {
  try {
    const resource = resourceFor(req.params.resource);
    if (!resource)
      return res.status(404).json({ error: "Resource not found." });
    const userId = (res.locals.session as UserSession).user_id;
    const existing = db
      .prepare(`SELECT * FROM ${resource} WHERE id=? AND user_id=?`)
      .get(req.params.id, userId) as Record<string, unknown> | undefined;
    if (!existing) return res.status(404).json({ error: "Record not found." });
    const data = normalize(
      configs[resource].schema.parse(req.body) as Record<string, unknown>,
    );
    if (resource === "cycles" && ("month" in data || "status" in data))
      return res.status(400).json({
        error:
          "Create a new cycle instead of changing an existing month or its archival status.",
      });
    for (const key of configs[resource].required)
      if (key in data && (data[key] === null || data[key] === ""))
        return res
          .status(400)
          .json({ error: `${key.replaceAll("_", " ")} is required.` });
    validateReferences(data, userId);
    validateBusinessRules(resource, data, existing, userId);
    const keys = Object.keys(data);
    if (keys.length)
      db.prepare(
        `UPDATE ${resource} SET ${keys.map((key) => `${key}=?`).join(",")},updated_at=? WHERE id=? AND user_id=?`,
      ).run(
        ...keys.map((key) => data[key] as string | number | null),
        now(),
        req.params.id,
        userId,
      );
    return res.json(
      db
        .prepare(`SELECT * FROM ${resource} WHERE id=? AND user_id=?`)
        .get(req.params.id, userId),
    );
  } catch (error) {
    return next(error);
  }
});
app.delete("/api/:resource/:id", requireUser, (req, res, next) => {
  try {
    const resource = resourceFor(req.params.resource);
    if (!resource)
      return res.status(404).json({ error: "Resource not found." });
    if (["cycles", "products"].includes(resource))
      return res
        .status(400)
        .json({ error: "Archive this record instead to preserve history." });
    const result = db
      .prepare(`DELETE FROM ${resource} WHERE id=? AND user_id=?`)
      .run(req.params.id, (res.locals.session as UserSession).user_id);
    if (!Number(result.changes))
      return res.status(404).json({ error: "Record not found." });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
if (process.env.NODE_ENV === "production") {
  const dist = resolve(process.cwd(), "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get("*", (_req, res) => res.sendFile(resolve(dist, "index.html")));
  }
}
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError)
    return res
      .status(400)
      .json({ error: error.issues[0]?.message || "Please check the form." });
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("VALIDATION:"))
    return res.status(400).json({ error: message.slice(11) });
  if (message.startsWith("INVALID_REFERENCE:"))
    return res.status(400).json({
      error: `The selected ${message.slice(18).replace("_id", "").replaceAll("_", " ")} is unavailable.`,
    });
  if (message.includes("UNIQUE constraint failed"))
    return res
      .status(409)
      .json({ error: "A record for this date or month already exists." });
  console.error("Request failed:", error);
  return res
    .status(500)
    .json({ error: "Something went wrong. Your data was not saved." });
});

app.listen(port, "0.0.0.0", () =>
  console.log(
    `Momentum OS API listening on ${port}${preview ? " (isolated preview mode)" : ""}`,
  ),
);
