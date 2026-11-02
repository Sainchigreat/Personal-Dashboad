import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

// Browser-side client for the live Momentum AI backend on Supabase.
// The publishable/anon key is safe to ship: every table is protected by RLS
// and the Edge Function re-checks the caller's JWT before any data access.
const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || "").replace(/\/$/, "");
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "";

export const cloudConfigured = Boolean(url && key);
export const cloudUrl = url;
export const cloudApiUrl = `${url}/functions/v1/momentum-api`;
export const cloudRestUrl = `${url}/rest/v1`;
export const cloudProjectRef = (() => {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "";
  }
})();

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "momentum-cloud-session",
      },
    })
  : null;

export type CloudHealth = {
  product: string;
  status: string;
  database: string;
  tables: number;
  rls_enabled_tables: number;
  policies: number;
  rpc_functions: number;
  checked_at: string;
};

export type CloudMetrics = {
  month: string;
  sales_target: number;
  revenue_target: number;
  outreach_target: number;
  paid_sales: number;
  realised_revenue: number;
  outreach_actions: number;
  open_tasks: number;
  completed_tasks: number;
  completed_projects: number;
  published_content: number;
  next_session_date: string | null;
  generated_at: string;
};

export type CloudSuggestion = {
  id: string;
  category: string;
  title: string;
  body: string;
  priority: "low" | "medium" | "high";
  confidence: number;
  status: "pending" | "accepted" | "dismissed";
  source: string;
  created_at: string;
};

export type CloudBrief = {
  day: string;
  content: Record<string, unknown>;
};

const notConfigured = () =>
  new Error(
    "Momentum Cloud is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local and restart the dev server.",
  );

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; anonymous?: boolean } = {},
): Promise<T> {
  if (!cloudConfigured || !supabase) throw notConfigured();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: key,
  };
  if (!options.anonymous) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("Sign in to Momentum Cloud first.");
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  let response: Response;
  try {
    response = await fetch(`${cloudApiUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(
      "The browser could not reach Supabase. Check your connection; the local workspace is still available.",
    );
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error;
    throw new Error(message || `The cloud backend returned ${response.status}.`);
  }
  return payload as T;
}

export const cloudHealth = () => call<CloudHealth>("/health", { anonymous: true });
export const cloudMe = () => call<{ id: string; email: string | null }>("/me");
export const cloudBootstrap = () => call<Record<string, unknown>>("/bootstrap");
export const cloudMetrics = () => call<CloudMetrics>("/metrics");
export const cloudPlanner = () => call<{ generated_tasks: number }>("/planner/ensure", { method: "POST", body: {} });
export const cloudAiBrief = () =>
  call<{ suggestions_created: number; inbox: CloudSuggestion[]; brief: CloudBrief | null }>("/ai/brief", {
    method: "POST",
    body: {},
  });
export const cloudSuggestions = () => call<CloudSuggestion[]>("/ai/suggestions");
export const cloudUpdateSuggestion = (id: string, status: "accepted" | "dismissed") =>
  call<CloudSuggestion>(`/ai_suggestions/${id}`, { method: "PATCH", body: { status } });
export const cloudCreate = <T>(resource: string, body: Record<string, unknown>) =>
  call<T>(`/${resource}`, { method: "POST", body });
export const cloudList = <T>(resource: string, query = "") => call<T[]>(`/${resource}${query}`);

export async function cloudSignUp(email: string, password: string, name: string) {
  if (!supabase) throw notConfigured();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, account_type: "owner" } },
  });
  if (error) throw new Error(error.message);
  return data.session as Session | null;
}

export async function cloudSignIn(email: string, password: string) {
  if (!supabase) throw notConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.session as Session | null;
}

export async function cloudSignOut() {
  if (!supabase) throw notConfigured();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function cloudSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function watchCloudAuth(onChange: (session: Session | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => onChange(session));
  return () => data.subscription.unsubscribe();
}
