// Momentum AI — live REST backend (Supabase Edge Function, Deno).
// Deployed at /functions/v1/momentum-api. Every data request is executed with
// the caller's own JWT, so Postgres RLS is the final authorization boundary.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-momentum-client",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

const PERSONAL = [
  "settings", "cycles", "products", "projects", "chapter_sessions", "tasks",
  "sales", "leads", "campaigns", "promotions", "prospects", "interactions",
  "jobs", "content_items", "session_checklists", "daily_notes", "weekly_reviews",
  "ai_suggestions", "ai_daily_briefs", "activity_events",
];
const TEAM_OWNER_FIELD: Record<string, string> = {
  team_goals: "created_by",
  team_tasks: "created_by",
  team_comments: "user_id",
  team_activity: "actor_user_id",
};
const RESOURCES = new Set([...PERSONAL, ...Object.keys(TEAM_OWNER_FIELD)]);
const PROTECTED = ["id", "user_id", "created_at", "updated_at", "created_by", "actor_user_id"];

function clean(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (PROTECTED.includes(key)) continue;
    if (value === undefined || typeof value === "function") continue;
    result[key] = value;
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  let path = url.pathname.replace(/\/+$/, "") || "/";
  const marker = path.indexOf("/momentum-api");
  if (marker >= 0) path = path.slice(marker + "/momentum-api".length) || "/";
  const segments = path.split("/").filter(Boolean);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !anonKey) return reply({ error: "Backend is not configured." }, 500);

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Public, metadata-only health check.
  if (req.method === "GET" && segments[0] === "health") {
    const { data, error } = await publicClient.rpc("momentum_health");
    return error ? reply({ error: error.message }, 500) : reply(data);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply({ error: "Sign in to Momentum Cloud first." }, 401);
  const { data: identity, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !identity?.user) {
    return reply({ error: "Invalid or expired session." }, 401);
  }
  const user = identity.user;
  const db: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (req.method === "GET" && segments[0] === "me") {
      return reply({ id: user.id, email: user.email, role: "authenticated" });
    }

    if (req.method === "GET" && segments[0] === "bootstrap") {
      const { data, error } = await db.rpc("workspace_bootstrap");
      return error ? reply({ error: error.message }, 400) : reply(data);
    }

    if (req.method === "GET" && segments[0] === "metrics") {
      const { data, error } = await db.rpc("command_centre", { p_month: url.searchParams.get("month") });
      return error ? reply({ error: error.message }, 400) : reply(data);
    }

    if (req.method === "POST" && segments[0] === "planner" && segments[1] === "ensure") {
      const body = await req.json().catch(() => ({}));
      const { data, error } = await db.rpc("ensure_daily_plan", {
        p_reference_date: (body as { day?: string })?.day ?? null,
      });
      return error ? reply({ error: error.message }, 400) : reply({ generated_tasks: data });
    }

    if (req.method === "POST" && segments[0] === "ai" && segments[1] === "brief") {
      const { data, error } = await db.rpc("generate_ai_suggestions");
      if (error) return reply({ error: error.message }, 400);
      const [inbox, briefs] = await Promise.all([
        db.from("v_ai_inbox").select("*").order("created_at", { ascending: false }),
        db.from("ai_daily_briefs").select("*").order("day", { ascending: false }).limit(1),
      ]);
      return reply({
        suggestions_created: data,
        inbox: inbox.data ?? [],
        brief: briefs.data?.[0] ?? null,
      });
    }

    if (req.method === "GET" && segments[0] === "ai" && segments[1] === "suggestions") {
      const { data, error } = await db
        .from("ai_suggestions").select("*")
        .order("created_at", { ascending: false }).limit(100);
      return error ? reply({ error: error.message }, 400) : reply(data);
    }

    if (req.method === "GET" && segments[0] === "resources") {
      return reply({ personal: PERSONAL, team: Object.keys(TEAM_OWNER_FIELD) });
    }

    const resource = segments[0];
    if (!resource || !RESOURCES.has(resource)) {
      return reply({ error: "Unknown endpoint.", available: [...RESOURCES] }, 404);
    }
    const recordId = segments[1];
    const isPersonal = PERSONAL.includes(resource);
    const ownerField = isPersonal ? "user_id" : TEAM_OWNER_FIELD[resource];

    if (req.method === "GET") {
      let query = db.from(resource).select("*");
      for (const [key, value] of url.searchParams.entries()) {
        if (key === "limit" || key === "order" || key === "select") continue;
        if (/^[a-z_]+$/.test(key)) query = query.eq(key, value);
      }
      const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
      const { data, error } = await query.limit(limit);
      return error ? reply({ error: error.message }, 400) : reply(data);
    }

    if (req.method === "POST" && !recordId) {
      const body = clean(await req.json().catch(() => ({})));
      body[ownerField] = user.id;
      const { data, error } = await db.from(resource).insert(body).select().single();
      return error ? reply({ error: error.message }, 400) : reply(data, 201);
    }

    if (req.method === "PATCH" && recordId) {
      const body = clean(await req.json().catch(() => ({})));
      const { data, error } = await db
        .from(resource).update(body).eq("id", recordId).select().single();
      return error ? reply({ error: error.message }, 400) : reply(data);
    }

    if (req.method === "DELETE" && recordId) {
      const { error } = await db.from(resource).delete().eq("id", recordId);
      return error ? reply({ error: error.message }, 400) : reply({ deleted: recordId });
    }

    return reply({ error: "Method not allowed for this endpoint." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected backend error.";
    return reply({ error: message }, 500);
  }
});
