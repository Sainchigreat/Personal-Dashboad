import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  CheckCircle2,
  CloudCog,
  Database,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Server,
  Sparkles,
  WifiOff,
  Zap,
} from "lucide-react";
import { Button, PageHeader, SectionHeading } from "../components/UI";
import {
  cloudAiBrief,
  cloudBootstrap,
  cloudConfigured,
  cloudHealth,
  cloudMetrics,
  cloudPlanner,
  cloudProjectRef,
  cloudSession,
  cloudSignIn,
  cloudSignOut,
  cloudSignUp,
  cloudSuggestions,
  cloudUpdateSuggestion,
  cloudUrl,
  supabase,
  watchCloudAuth,
  type CloudBrief,
  type CloudHealth,
  type CloudMetrics,
  type CloudSuggestion,
} from "../lib/cloud";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);

export default function Cloud() {
  const [health, setHealth] = useState<CloudHealth | null>(null);
  const [healthError, setHealthError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [metrics, setMetrics] = useState<CloudMetrics | null>(null);
  const [bootstrap, setBootstrap] = useState<Record<string, unknown> | null>(null);
  const [suggestions, setSuggestions] = useState<CloudSuggestion[]>([]);
  const [brief, setBrief] = useState<CloudBrief | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signup");

  const loadHealth = useCallback(async () => {
    setHealthError("");
    try {
      setHealth(await cloudHealth());
    } catch (caught) {
      setHealth(null);
      setHealthError(message(caught));
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!session) return;
    setBusy("Loading live workspace…");
    try {
      const [boot, metricValues, inbox] = await Promise.all([
        cloudBootstrap(),
        cloudMetrics(),
        cloudSuggestions(),
      ]);
      setBootstrap(boot);
      setMetrics(metricValues);
      setSuggestions(inbox);
      if (supabase) {
        const { data } = await supabase
          .from("ai_daily_briefs")
          .select("day, content")
          .order("day", { ascending: false })
          .limit(1);
        setBrief((data?.[0] as CloudBrief | undefined) ?? null);
      }
      setError("");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy("");
    }
  }, [session]);

  useEffect(() => {
    void loadHealth();
    void cloudSession().then(setSession);
    return watchCloudAuth(setSession);
  }, [loadHealth]);

  useEffect(() => {
    if (session) void loadWorkspace();
    else {
      setBootstrap(null);
      setMetrics(null);
      setSuggestions([]);
      setBrief(null);
    }
  }, [session, loadWorkspace]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(mode === "signup" ? "Creating your cloud workspace…" : "Signing in…");
    setError("");
    setNotice("");
    try {
      if (password.length < 12) throw new Error("Use a password of at least 12 characters.");
      const next =
        mode === "signup"
          ? await cloudSignUp(email.trim(), password, name.trim())
          : await cloudSignIn(email.trim(), password);
      if (next) {
        setSession(next);
        setNotice(mode === "signup" ? "Owner workspace created on Supabase." : "Signed in.");
      } else {
        setNotice("Account created. Sign in to open it.");
        setMode("signin");
      }
      setPassword("");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy("");
    }
  };

  const run = async (action: "planner" | "brief", fn: () => Promise<unknown>) => {
    setBusy(action === "planner" ? "Building today's plan…" : "Generating your AI brief…");
    setError("");
    setNotice("");
    try {
      const result = await fn();
      if (action === "brief") {
        const value = result as { suggestions_created: number; inbox: CloudSuggestion[]; brief: CloudBrief | null };
        setSuggestions(value.inbox);
        setBrief(value.brief);
        setNotice(`${value.suggestions_created} new suggestion(s) generated from your real records.`);
      } else {
        const value = result as { generated_tasks: number };
        setNotice(`${value.generated_tasks} plan item(s) created. Nothing is marked complete.`);
      }
      await loadWorkspace();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy("");
    }
  };

  const decide = async (id: string, status: "accepted" | "dismissed") => {
    setBusy("Saving decision…");
    try {
      await cloudUpdateSuggestion(id, status);
      setSuggestions((current) => current.filter((item) => item.id !== id));
      setNotice(status === "accepted" ? "Suggestion accepted." : "Suggestion dismissed.");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy("");
    }
  };

  const signOut = async () => {
    setBusy("Signing out…");
    try {
      await cloudSignOut();
      setSession(null);
      setNotice("Signed out of Momentum Cloud.");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy("");
    }
  };

  const stats = [
    { label: "Tables", value: health?.tables },
    { label: "RLS protected", value: health?.rls_enabled_tables },
    { label: "Policies", value: health?.policies },
    { label: "RPC functions", value: health?.rpc_functions },
  ];

  return (
    <div className="page-wrap cloud-page">
      <PageHeader
        eyebrow="Momentum AI"
        title="Momentum Cloud"
        description="The live Supabase backend behind your workspace: database, API, planner and the AI suggestion engine."
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => {
              void loadHealth();
              void loadWorkspace();
            }}
            disabled={Boolean(busy)}
          >
            Refresh
          </Button>
        }
      />

      {!cloudConfigured && (
        <div className="panel cloud-card cloud-warning">
          <CloudCog size={18} />
          <div>
            <strong>Cloud credentials are not set in this preview.</strong>
            <p>
              Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{" "}
              <code>.env.local</code> and restart the dev server. The local workspace continues to
              work without them.
            </p>
          </div>
        </div>
      )}

      <div className="cloud-grid">
        <section className="panel cloud-card">
          <div className="cloud-card-head">
            <div>
              <div className="overline">DATABASE</div>
              <h2>Live connection</h2>
            </div>
            <span className={`cloud-badge ${health ? "online" : "offline"}`}>
              {health ? <CheckCircle2 size={14} /> : <WifiOff size={14} />}
              {health ? "Online" : "Unreachable"}
            </span>
          </div>
          {health ? (
            <>
              <p className="cloud-copy">
                <strong>{health.product}</strong> · {health.database} · project{" "}
                <code>{cloudProjectRef}</code>
              </p>
              <div className="cloud-stats">
                {stats.map((item) => (
                  <div className="cloud-stat" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value ?? 0}</strong>
                  </div>
                ))}
              </div>
              <p className="cloud-hint">
                Checked {new Date(health.checked_at).toLocaleString()} · every table has row level
                security, so accounts are isolated.
              </p>
            </>
          ) : (
            <p className="cloud-copy">
              {healthError ||
                "Waiting for the public health check. The browser talks to Supabase directly, so this needs network access from your device."}
            </p>
          )}
          <div className="cloud-endpoint">
            <Server size={14} />
            <code>{cloudUrl || "VITE_SUPABASE_URL not set"}</code>
          </div>
        </section>

        <section className="panel cloud-card">
          <div className="cloud-card-head">
            <div>
              <div className="overline">ACCOUNT</div>
              <h2>{session ? "Owner session" : "Open your workspace"}</h2>
            </div>
            <LockKeyhole size={18} className="cloud-muted-icon" />
          </div>
          {session ? (
            <>
              <p className="cloud-copy">
                Signed in as <strong>{session.user.email}</strong>.
              </p>
              <div className="cloud-kv">
                <span>User id</span>
                <code>{session.user.id}</code>
              </div>
              <div className="cloud-kv">
                <span>Auth</span>
                <span>Supabase GoTrue · JWT + RLS</span>
              </div>
              <div className="cloud-actions">
                <Button variant="ghost" onClick={() => void signOut()} disabled={Boolean(busy)}>
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="cloud-tabs">
                <button
                  type="button"
                  className={mode === "signup" ? "active" : ""}
                  onClick={() => setMode("signup")}
                >
                  Create owner account
                </button>
                <button
                  type="button"
                  className={mode === "signin" ? "active" : ""}
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </div>
              <form className="cloud-form" onSubmit={(event) => void submitAuth(event)}>
                {mode === "signup" && (
                  <label>
                    <span>Name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </label>
                )}
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    required
                    minLength={12}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 12 characters"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </label>
                <Button variant="primary" type="submit" disabled={Boolean(busy)}>
                  {mode === "signup" ? "Create workspace" : "Sign in"}
                </Button>
              </form>
              <p className="cloud-hint">
                A new account is seeded automatically with your settings, product, cycle and team
                workspace. Passwords never enter the app code.
              </p>
            </>
          )}
        </section>
      </div>

      {error && <div className="cloud-alert error">{error}</div>}
      {notice && <div className="cloud-alert success">{notice}</div>}
      {busy && (
        <div className="cloud-busy">
          <LoaderCircle size={15} className="spin" /> {busy}
        </div>
      )}

      {session && (
        <>
          <section className="panel cloud-card cloud-workspace">
            <SectionHeading
              title="Live workspace"
              sub="Numbers below come from your Supabase rows, not from the local preview database."
              action={
                <div className="cloud-actions">
                  <Button
                    variant="secondary"
                    icon={Activity}
                    onClick={() => void run("planner", cloudPlanner)}
                    disabled={Boolean(busy)}
                  >
                    Build today's plan
                  </Button>
                  <Button
                    variant="primary"
                    icon={Sparkles}
                    onClick={() => void run("brief", cloudAiBrief)}
                    disabled={Boolean(busy)}
                  >
                    Generate AI brief
                  </Button>
                </div>
              }
            />
            <div className="cloud-metrics">
              <div className="cloud-metric">
                <span>Paid sales</span>
                <strong>{metrics?.paid_sales ?? 0}</strong>
                <small>of {metrics?.sales_target ?? 0} target</small>
              </div>
              <div className="cloud-metric">
                <span>Realised revenue</span>
                <strong>₦{(metrics?.realised_revenue ?? 0).toLocaleString()}</strong>
                <small>of ₦{(metrics?.revenue_target ?? 0).toLocaleString()}</small>
              </div>
              <div className="cloud-metric">
                <span>Outreach logged</span>
                <strong>{metrics?.outreach_actions ?? 0}</strong>
                <small>of {metrics?.outreach_target ?? 0} target</small>
              </div>
              <div className="cloud-metric">
                <span>Open tasks</span>
                <strong>{metrics?.open_tasks ?? 0}</strong>
                <small>{metrics?.completed_tasks ?? 0} completed</small>
              </div>
            </div>
            <div className="cloud-rows">
              <div className="cloud-row">
                <Database size={15} />
                <span>Records in this workspace</span>
                <strong>
                  {count(bootstrap?.tasks)} tasks · {count(bootstrap?.cycles)} cycles ·{" "}
                  {count(bootstrap?.products)} products · {count(bootstrap?.content_items)} content
                </strong>
              </div>
              <div className="cloud-row">
                <Zap size={15} />
                <span>Last AI brief</span>
                <strong>{brief?.day || "Not generated yet"}</strong>
              </div>
            </div>
            {brief && (
              <div className="cloud-code">
                {Object.entries(brief.content).map(([key, value]) => (
                  <div className="cloud-kv" key={key}>
                    <span>{key.replaceAll("_", " ")}</span>
                    <code>{String(value)}</code>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel cloud-card cloud-workspace">
            <SectionHeading
              title="AI inbox"
              sub="Rules-based suggestions from recorded activity. No external model is called and no work is fabricated."
            />
            {suggestions.length === 0 ? (
              <p className="cloud-copy">
                Nothing pending. Generate a brief to review your pipeline, plans and pace.
              </p>
            ) : (
              <div className="cloud-list">
                {suggestions.map((item) => (
                  <div className="cloud-item" key={item.id}>
                    <div className="cloud-item-main">
                      <div className="cloud-item-top">
                        <span className={`cloud-priority ${item.priority}`}>{item.priority}</span>
                        <span className="cloud-category">{item.category}</span>
                      </div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                    <div className="cloud-actions">
                      <Button
                        variant="ghost"
                        onClick={() => void decide(item.id, "accepted")}
                        disabled={Boolean(busy)}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void decide(item.id, "dismissed")}
                        disabled={Boolean(busy)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <p className="cloud-footer">
        The workspace pages on the left still use the local Express/SQLite API for this sandbox
        preview. Momentum Cloud is the production backend; switch the client adapter to it when you
        deploy to a host with Supabase access. No service-role key is used in browser code.
      </p>
    </div>
  );
}
