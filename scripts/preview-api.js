/* Browser-only demo adapter. The real application always uses its authenticated API. */
(() => {
  const initial = __PREVIEW_SEED__;
  const defaults = __PREVIEW_DEFAULTS__;
  const required = __PREVIEW_REQUIRED__;
  const references = __PREVIEW_REFERENCES__;
  const storageKey = "momentum-os-browser-demo-v1";
  const originalFetch = window.fetch.bind(window);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const id = () =>
    window.crypto?.randomUUID?.() ||
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const n = (Math.random() * 16) | 0;
      return (c === "x" ? n : (n & 3) | 8).toString(16);
    });
  const dateInZone = (zone) => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const get = (name) => parts.find((item) => item.type === name).value;
      return `${get("year")}-${get("month")}-${get("day")}`;
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  function warnAboutStorage() {
    if (typeof document === "undefined") return;
    const showWarning = () => {
      const message = document.querySelector("#demo-notice span");
      if (message)
        message.textContent =
          "Browser storage is blocked. Changes will be lost when you refresh.";
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", showWarning, {
        once: true,
      });
    else showWarning();
  }
  function load() {
    let stored = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      warnAboutStorage();
    }
    try {
      const value = JSON.parse(stored || "null");
      if (value && value.data && Array.isArray(value.generatedDays)) {
        // Earlier demos seeded dark by default. Update only untouched settings;
        // preserve every record and any appearance an owner has saved.
        const settings = value.data.settings;
        if (
          settings?.theme === "dark" &&
          settings.created_at &&
          settings.created_at === settings.updated_at
        )
          settings.theme = "system";
        return value;
      }
    } catch {
      /* Use a clean demo if stored data is invalid. */
    }
    const data = copy(initial);
    // A preview built on a different date should still show today's planned tasks.
    const today = dateInZone(data.settings.timezone);
    const cycle = data.cycles.find((item) => item.month === today.slice(0, 7));
    data.tasks.forEach((task) => {
      task.due_date = today;
      task.cycle_id = cycle?.id || null;
    });
    return { data, generatedDays: [today], signedOut: false };
  }
  let state = load();
  // Browser-only team simulation. Sample people are clearly labelled and no
  // invitation or private account is created or synced by this adapter.
  function teamState() {
    if (!state.team) {
      const stamp = now();
      state.team = {
        workspace: { id: "demo-team", name: "Team Workspace" },
        viewer: "owner",
        memberTheme: "system",
        members: [
          {
            user_id: state.data.settings.user_id,
            name: state.data.settings.name || "Demo owner",
            email: "preview@momentum.local",
            role: "owner",
            status: "active",
            joined_at: stamp,
          },
          {
            user_id: "sample-member",
            name: "Sample teammate",
            email: "sample@example.invalid",
            role: "member",
            status: "active",
            joined_at: stamp,
          },
        ],
        goals: [],
        tasks: [],
        comments: [],
        activity: [],
      };
    }
    // Keep an edited owner profile in sync without overwriting demo team work.
    state.team.members[0].name = state.data.settings.name || "Demo owner";
    return state.team;
  }
  function teamViewer() {
    const team = teamState();
    return team.members[team.viewer === "member" ? 1 : 0];
  }
  function teamEvent(entityType, entityId, summary) {
    const team = teamState(),
      actor = teamViewer();
    team.activity.unshift({
      id: id(),
      entity_type: entityType,
      entity_id: entityId,
      name: actor.name,
      summary,
      created_at: now(),
    });
  }
  function teamBootstrap() {
    const team = teamState(),
      viewer = teamViewer(),
      isMember = viewer.role === "member";
    const tasks = team.tasks.filter(
      (task) => !isMember || task.assignee_user_id === viewer.user_id,
    );
    const ids = new Set(tasks.map((task) => task.id));
    const name = (userId) =>
      team.members.find((member) => member.user_id === userId)?.name || null;
    return {
      workspace: team.workspace,
      membership: {
        workspace_id: team.workspace.id,
        user_id: viewer.user_id,
        role: viewer.role,
        status: viewer.status,
      },
      members: team.members.map((member) => ({
        ...member,
        email:
          isMember && member.user_id !== viewer.user_id ? null : member.email,
      })),
      goals: team.goals.map((goal) => ({
        ...goal,
        owner_name: name(goal.owner_user_id),
      })),
      tasks: tasks.map((task) => ({
        ...task,
        assignee_name: name(task.assignee_user_id),
        reviewer_name: name(task.reviewer_user_id),
        goal_title:
          team.goals.find((goal) => goal.id === task.goal_id)?.title || null,
      })),
      comments: team.comments.filter((comment) => ids.has(comment.task_id)),
      activity: team.activity
        .filter(
          (event) =>
            !isMember ||
            event.entity_type === "goal" ||
            (event.entity_type === "task" && ids.has(event.entity_id)),
        )
        .slice(0, 50),
      invites: [],
      preferences: {
        theme: isMember ? team.memberTheme : state.data.settings.theme,
      },
    };
  }
  function teamRoute(path, method, body) {
    const team = teamState(),
      viewer = teamViewer(),
      manager = viewer.role !== "member";
    if (path === "/team/demo-switch" && method === "POST") {
      team.viewer = team.viewer === "owner" ? "member" : "owner";
      save();
      return output({ ok: true });
    }
    if (path === "/team/bootstrap" && method === "GET")
      return output(teamBootstrap());
    if (path === "/team/preferences" && method === "PATCH") {
      if (!["system", "light", "dark"].includes(body.theme))
        fail("Choose a valid appearance.");
      if (manager) state.data.settings.theme = body.theme;
      else team.memberTheme = body.theme;
      save();
      return output({ theme: body.theme });
    }
    if (path === "/team/invites")
      fail(
        "Invitations are unavailable in this browser demo. Use a private deployment.",
        403,
      );
    if (path.startsWith("/team/members/"))
      fail("Sample team access cannot be changed in the browser demo.", 403);
    const parts = path.split("/").filter(Boolean),
      resource = parts[1],
      itemId = parts[2];
    if (resource === "goals") {
      if (!manager) fail("Only a team lead can manage goals.", 403);
      if (!["POST", "PATCH"].includes(method)) fail("Action unavailable.", 404);
      const goal = itemId && team.goals.find((item) => item.id === itemId);
      if (itemId && !goal) fail("Goal not found.", 404);
      const value = { ...(goal || {}), ...body };
      if (
        !String(value.title || "").trim() ||
        !String(value.unit || "").trim() ||
        !(Number(value.target) > 0) ||
        Number(value.current) < 0
      )
        fail(
          "Enter a title, unit, positive target, and non-negative progress.",
        );
      if (
        value.owner_user_id &&
        !team.members.some(
          (person) =>
            person.user_id === value.owner_user_id &&
            person.status === "active",
        )
      )
        fail("Goal owner must be an active team member.");
      const saved = goal || { id: id(), created_at: now() };
      Object.assign(saved, body, { updated_at: now() });
      if (!goal) team.goals.push(saved);
      teamEvent(
        "goal",
        saved.id,
        `${goal ? "Updated" : "Created"} the shared goal: ${saved.title}`,
      );
      save();
      return output(saved, goal ? 200 : 201);
    }
    if (resource === "tasks") {
      if (!itemId && method === "POST") {
        if (!manager) fail("Only a team lead can assign work.", 403);
        const assignee = team.members.find(
          (person) =>
            person.user_id === body.assignee_user_id &&
            person.status === "active",
        );
        const reviewer = team.members.find(
          (person) =>
            person.user_id === body.reviewer_user_id &&
            person.status === "active" &&
            person.role !== "member",
        );
        if (!String(body.title || "").trim() || !assignee)
          fail("Enter a title and choose an active assignee.");
        if (!reviewer || reviewer.user_id === assignee.user_id)
          fail("Choose an active reviewer other than the assignee.");
        if (
          body.goal_id &&
          !team.goals.some((goal) => goal.id === body.goal_id)
        )
          fail("Selected team goal is unavailable.");
        const task = {
          id: id(),
          title: body.title,
          description: body.description || "",
          assignee_user_id: assignee.user_id,
          reviewer_user_id: reviewer.user_id,
          goal_id: body.goal_id || null,
          priority: body.priority || "medium",
          status: "assigned",
          due_date: body.due_date || null,
          deliverable: body.deliverable || "",
          submission: "",
          feedback: "",
          created_at: now(),
          updated_at: now(),
        };
        team.tasks.push(task);
        teamEvent("task", task.id, `Assigned: ${task.title}`);
        save();
        return output(task, 201);
      }
      const task = team.tasks.find(
        (item) =>
          item.id === itemId &&
          (manager || item.assignee_user_id === viewer.user_id),
      );
      if (!task) fail("Task not found.", 404);
      if (parts[3] === "status" && method === "PATCH") {
        const work = ["in_progress", "submitted"].includes(body.status);
        if (work && task.assignee_user_id !== viewer.user_id)
          fail("Only the assignee can update this work.", 403);
        if (
          !work &&
          (!manager ||
            task.assignee_user_id === viewer.user_id ||
            (viewer.role !== "owner" &&
              task.reviewer_user_id !== viewer.user_id))
        )
          fail("Only the reviewer or owner can review this work.", 403);
        const transitions = {
          assigned: ["in_progress"],
          in_progress: ["submitted"],
          revision_requested: ["in_progress"],
          submitted: ["approved", "revision_requested"],
          approved: ["completed"],
        };
        if (!transitions[task.status]?.includes(body.status))
          fail(
            "That status change is not available from the current stage.",
            409,
          );
        if (
          body.status === "submitted" &&
          !String(body.submission || "").trim()
        )
          fail("Describe the work before submitting.");
        if (
          body.status === "revision_requested" &&
          !String(body.feedback || "").trim()
        )
          fail("Add feedback for the assignee.");
        task.status = body.status;
        if (body.status === "submitted") task.submission = body.submission;
        if (["approved", "revision_requested"].includes(body.status))
          task.feedback = body.feedback || "";
        task.updated_at = now();
        teamEvent(
          "task",
          task.id,
          `${task.title}: ${task.status.replaceAll("_", " ")}`,
        );
        save();
        return output(task);
      }
      if (parts[3] === "comments" && method === "POST") {
        if (!String(body.body || "").trim()) fail("A comment is required.");
        const comment = {
          id: id(),
          task_id: task.id,
          user_id: viewer.user_id,
          name: viewer.name,
          body: String(body.body).trim(),
          created_at: now(),
        };
        team.comments.push(comment);
        teamEvent("task", task.id, `Commented on: ${task.title}`);
        save();
        return output(comment, 201);
      }
      if (!parts[3] && method === "PATCH") {
        if (!manager) fail("Only a team lead can edit assignments.", 403);
        const reviewerOnly =
          ["submitted", "approved"].includes(task.status) &&
          Object.keys(body).length === 1 &&
          "reviewer_user_id" in body;
        if (reviewerOnly) {
          if (viewer.role !== "owner")
            fail(
              "Only the owner can replace the reviewer after submission.",
              403,
            );
          const reviewer = team.members.find(
            (person) =>
              person.user_id === body.reviewer_user_id &&
              person.status === "active" &&
              person.role !== "member" &&
              person.user_id !== task.assignee_user_id,
          );
          if (!reviewer)
            fail("Choose an active reviewer other than the assignee.");
          task.reviewer_user_id = reviewer.user_id;
          task.updated_at = now();
          teamEvent("task", task.id, `Updated: ${task.title}`);
          save();
          return output(task);
        }
        if (
          !["assigned", "in_progress", "revision_requested"].includes(
            task.status,
          )
        )
          fail(
            "Submitted or reviewed work cannot be edited. Request changes first.",
            409,
          );
        if (
          body.assignee_user_id !== task.assignee_user_id &&
          task.status !== "assigned"
        )
          fail("Reassign work before it is started.", 409);
        const assignee = team.members.find(
          (person) =>
            person.user_id === body.assignee_user_id &&
            person.status === "active",
        );
        const reviewer = team.members.find(
          (person) =>
            person.user_id === body.reviewer_user_id &&
            person.status === "active" &&
            person.role !== "member",
        );
        if (!assignee || !reviewer || assignee.user_id === reviewer.user_id)
          fail("Choose an active reviewer other than the assignee.");
        if (!String(body.title || "").trim())
          fail("An assignment title is required.");
        if (
          body.goal_id &&
          !team.goals.some((goal) => goal.id === body.goal_id)
        )
          fail("Selected team goal is unavailable.");
        Object.assign(task, body, { updated_at: now() });
        teamEvent("task", task.id, `Updated: ${task.title}`);
        save();
        return output(task);
      }
    }
    fail("This action is not available in the demo.", 404);
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Continue in memory but make the loss of persistence visible.
      warnAboutStorage();
    }
  }
  function fail(message, status = 400) {
    throw { message, status };
  }
  function output(value, status = 200) {
    return new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  function row(resource, data) {
    const stamp = now();
    return {
      ...defaults[resource],
      id: id(),
      user_id: state.data.settings.user_id,
      ...data,
      created_at: stamp,
      updated_at: stamp,
    };
  }
  function normalize(data) {
    const value = { ...data };
    Object.keys(value).forEach((key) => {
      if (
        value[key] === "" &&
        (key.endsWith("_id") ||
          key.endsWith("_date") ||
          ["day", "week_start", "researched_at"].includes(key))
      )
        value[key] = null;
    });
    return value;
  }
  function check(resource, input, previous) {
    const data = normalize(input);
    const combined = { ...previous, ...data };
    for (const field of required[resource] || []) {
      if (
        (!previous || field in data) &&
        (combined[field] === null ||
          combined[field] === undefined ||
          combined[field] === "")
      )
        fail(`${field.replaceAll("_", " ")} is required.`);
    }
    for (const [key, table] of Object.entries(references)) {
      if (data[key] && !state.data[table].some((item) => item.id === data[key]))
        fail(`The selected ${key.replace("_id", "")} is unavailable.`);
    }
    if (resource === "sales") {
      if (combined.status === "paid" && Number(combined.amount) <= 0)
        fail("A confirmed paid sale must have an amount greater than zero.");
      const cycle = state.data.cycles.find(
        (item) => item.id === combined.cycle_id,
      );
      if (
        cycle &&
        combined.sale_date &&
        !String(combined.sale_date).startsWith(cycle.month)
      )
        fail("Sale date must fall within its operating cycle.");
    }
    if (resource === "content_items") {
      if (
        previous &&
        [
          "title",
          "body",
          "ai_assisted",
          "session_id",
          "project_id",
          "asset_url",
        ].some((key) => key in data && data[key] !== previous[key]) &&
        !("human_approved" in data)
      ) {
        data.human_approved = 0;
        combined.human_approved = 0;
      }
      if (
        ["Published", "Distributed"].includes(combined.status) &&
        (combined.ai_assisted === 1 || combined.session_id) &&
        combined.human_approved !== 1
      )
        fail(
          "Human review and approval are required before marking this content published.",
        );
      if (
        ["Published", "Distributed"].includes(combined.status) &&
        !combined.published_date
      )
        data.published_date = dateInZone(state.data.settings.timezone);
    }
    if (resource === "tasks" && "status" in data) {
      if (data.status === "done" && previous?.status !== "done")
        data.completed_at = now();
      if (data.status !== "done" && previous?.status === "done")
        data.completed_at = null;
    }
    if (resource === "projects" && "stage" in data) {
      if (data.stage === "Completed" && previous?.stage !== "Completed")
        data.completed_at = now();
      if (data.stage !== "Completed" && previous?.stage === "Completed")
        data.completed_at = null;
    }
    const uniqueField = { daily_notes: "day", weekly_reviews: "week_start" }[
      resource
    ];
    if (
      uniqueField &&
      state.data[resource].some(
        (item) =>
          item.id !== previous?.id &&
          item[uniqueField] === combined[uniqueField],
      )
    )
      fail("A record for that date already exists.", 409);
    return data;
  }
  function planDay() {
    const { data } = state;
    const today = dateInZone(data.settings.timezone);
    if (!data.settings.auto_plan || state.generatedDays.includes(today)) return;
    let templates = [];
    try {
      templates = JSON.parse(data.settings.daily_templates);
    } catch {
      /* Leave the day empty. */
    }
    const cycle = data.cycles.find((item) => item.month === today.slice(0, 7));
    if (Array.isArray(templates))
      templates.forEach((template, index) => {
        if (!template?.title) return;
        data.tasks.push(
          row("tasks", {
            title: template.title,
            category: template.category || "Personal",
            priority: template.priority || "medium",
            estimated_minutes: template.estimated_minutes || 0,
            due_date: today,
            cycle_id: cycle?.id || null,
            sort_order: index,
          }),
        );
      });
    state.generatedDays.push(today);
    save();
  }
  function addSessionPlan(session) {
    [
      "Choose the topic and central question",
      "Confirm the guest",
      "Prepare the promotional assets",
      "Share the announcement and reminders",
      "Collect audience questions",
      "Prepare the live session",
      "Save the recording and transcript",
      "Review and approve the article or summary",
      "Share the replay and lessons",
    ].forEach((title, index) =>
      state.data.session_checklists.push(
        row("session_checklists", {
          session_id: session.id,
          title,
          sort_order: index,
        }),
      ),
    );
    [
      "Prepare promotion",
      "Plan the session",
      "Review the post-session editorial",
    ].forEach((title, index) =>
      state.data.tasks.push(
        row("tasks", {
          cycle_id: session.cycle_id,
          session_id: session.id,
          title: `${title}: ${session.title}`,
          category: "Next Chapter",
          priority: "medium",
          due_date: session.session_date,
          sort_order: 100 + index,
        }),
      ),
    );
  }
  function rollover(body) {
    const source = state.data.cycles.find(
      (item) => item.id === body.source_cycle_id,
    );
    if (!source) fail("Source cycle not found.", 404);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month || ""))
      fail("Choose a valid month.");
    if (state.data.cycles.some((item) => item.month === body.month))
      fail(
        "A cycle for that month already exists. Select it from the cycle menu.",
        409,
      );
    const fields = [
      "month",
      "theme",
      "objective",
      "objectives",
      "sales_target",
      "revenue_target",
      "outreach_target",
      "projects_target",
      "chapter_content_target",
      "course_days",
      "session_day",
    ];
    const cycle = row(
      "cycles",
      Object.fromEntries(fields.map((key) => [key, body[key]])),
    );
    state.data.cycles.forEach((item) => {
      if (item.status === "active") {
        item.status = "archived";
        item.updated_at = now();
      }
    });
    state.data.cycles.push(cycle);
    if (body.carry_tasks) {
      const tasks = state.data.tasks.filter(
        (task) =>
          task.cycle_id === source.id &&
          ["todo", "in_progress", "deferred"].includes(task.status),
      );
      tasks.forEach((task) => {
        const first = `${cycle.month}-01`;
        state.data.tasks.push(
          row("tasks", {
            ...task,
            id: id(),
            cycle_id: cycle.id,
            carried_from_id: task.id,
            status: "todo",
            completed_at: null,
            due_date:
              task.due_date && task.due_date >= first ? task.due_date : first,
          }),
        );
        task.status = "carried";
        task.updated_at = now();
      });
    }
    save();
    return cycle;
  }
  function remove(resource, itemId) {
    if (["cycles", "products"].includes(resource))
      fail("Archive this record instead to preserve history.");
    const index = state.data[resource].findIndex((item) => item.id === itemId);
    if (index < 0) fail("Record not found.", 404);
    state.data[resource].splice(index, 1);
    if (resource === "prospects")
      state.data.interactions = state.data.interactions.filter(
        (item) => item.prospect_id !== itemId,
      );
    if (resource === "chapter_sessions") {
      state.data.session_checklists = state.data.session_checklists.filter(
        (item) => item.session_id !== itemId,
      );
      state.data.tasks.forEach((item) => {
        if (item.session_id === itemId) item.session_id = null;
      });
      state.data.content_items.forEach((item) => {
        if (item.session_id === itemId) item.session_id = null;
      });
    }
    if (resource === "projects") {
      state.data.tasks.forEach((item) => {
        if (item.project_id === itemId) item.project_id = null;
      });
      state.data.content_items.forEach((item) => {
        if (item.project_id === itemId) item.project_id = null;
      });
    }
    if (resource === "tasks")
      state.data.tasks.forEach((item) => {
        if (item.carried_from_id === itemId) item.carried_from_id = null;
      });
    save();
  }
  window.fetch = async (input, options = {}) => {
    if (typeof input !== "string" || !input.startsWith("/api"))
      return originalFetch(input, options);
    const path = input.slice(4);
    const method = (options.method || "GET").toUpperCase();
    try {
      const body = options.body ? JSON.parse(options.body) : {};
      if (path === "/auth/status")
        return output({
          authenticated: !state.signedOut,
          needsSetup: false,
          previewEnabled: true,
          csrfToken: state.signedOut ? null : "local-demo",
          email: state.signedOut ? null : teamViewer().email,
          accountType: state.signedOut
            ? null
            : teamViewer().role === "member"
              ? "team"
              : "owner",
          theme: state.signedOut
            ? null
            : teamViewer().role === "member"
              ? teamState().memberTheme
              : state.data.settings.theme,
          browserDemo: true,
        });
      if (path === "/auth/preview" && method === "POST") {
        state.signedOut = false;
        teamState().viewer = "owner";
        save();
        return output({ csrfToken: "local-demo", previewToken: "local-demo" });
      }
      if (path === "/auth/login" || path === "/auth/register")
        fail(
          "This preview has no account. Choose Open sandbox preview instead.",
        );
      if (path === "/auth/logout" && method === "POST") {
        state.signedOut = true;
        save();
        return output({ ok: true });
      }
      if (state.signedOut) fail("Open the demo preview to continue.", 401);
      if (path.startsWith("/team/")) return teamRoute(path, method, body);
      if (teamViewer().role === "member")
        fail("This sample account can access shared work only.", 403);
      if (path === "/bootstrap" && method === "GET") {
        planDay();
        return output(state.data);
      }
      if (path === "/export" && method === "GET")
        return output({
          format: "momentum-os-export",
          version: 1,
          exported_at: now(),
          data: state.data,
          team: teamBootstrap(),
        });
      if (path === "/settings" && method === "PATCH") {
        const combined = { ...state.data.settings, ...body };
        if (!["system", "dark", "light"].includes(combined.theme))
          fail("Choose a valid appearance.");
        if (combined.work_start >= combined.work_end)
          fail("Workday end must be after its start.");
        try {
          new Intl.DateTimeFormat("en", { timeZone: combined.timezone });
        } catch {
          fail("Choose a valid timezone.");
        }
        Object.assign(state.data.settings, body, { updated_at: now() });
        save();
        return output(state.data.settings);
      }
      if (path === "/cycles/rollover" && method === "POST")
        return output(rollover(body), 201);
      const parts = path.split("/").filter(Boolean);
      const resource = parts[0];
      const itemId = parts[1];
      if (!Object.prototype.hasOwnProperty.call(defaults, resource))
        fail("Resource not found.", 404);
      if (method === "POST" && !itemId) {
        if (resource === "cycles") fail("Create a new cycle using rollover.");
        const data = check(resource, body);
        const item = row(resource, data);
        state.data[resource].push(item);
        if (resource === "chapter_sessions") addSessionPlan(item);
        save();
        return output(item, 201);
      }
      if (method === "PATCH" && itemId) {
        const existing = state.data[resource].find(
          (item) => item.id === itemId,
        );
        if (!existing) fail("Record not found.", 404);
        if (resource === "cycles" && ("month" in body || "status" in body))
          fail("Create a new cycle instead of changing its month or status.");
        Object.assign(existing, check(resource, body, existing), {
          updated_at: now(),
        });
        save();
        return output(existing);
      }
      if (method === "DELETE" && itemId) {
        remove(resource, itemId);
        return output({ ok: true });
      }
      fail("This action is not available in the demo.", 404);
    } catch (error) {
      return output(
        { error: error?.message || "Unable to complete that request." },
        error?.status || 400,
      );
    }
  };
})();
