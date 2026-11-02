import { useEffect, useState } from "react";
import {
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  Settings2,
  UsersRound,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useTeam } from "../lib/team";
import type { AuthStatus, ThemePreference } from "../types";
import { Button, Logo, PageHeader, SectionHeading } from "../components/UI";
import { TeamWorkList } from "../components/TeamWork";
import TeamWorkspace from "./TeamWorkspace";

type Page = "workspace" | "day" | "settings";
const portalPages = [
  { page: "workspace" as Page, label: "Team Workspace", icon: LayoutGrid },
  { page: "day" as Page, label: "My assignments", icon: CheckSquare2 },
  { page: "settings" as Page, label: "Settings", icon: Settings2 },
];
const initialPage = (): Page =>
  location.hash === "#team-day"
    ? "day"
    : location.hash === "#team-settings"
      ? "settings"
      : "workspace";
export default function TeamPortal({
  auth,
  signOut,
  onThemeChanged,
}: {
  auth: AuthStatus;
  signOut: () => Promise<void>;
  onThemeChanged: (theme: ThemePreference) => void;
}) {
  const { data } = useTeam();
  const [page, setPage] = useState<Page>(initialPage);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  useEffect(() => {
    const update = () => setPage(initialPage());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  function navigate(next: Page) {
    location.hash = next === "workspace" ? "team" : `team-${next}`;
    setPage(next);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const name =
    data?.members.find((person) => person.user_id === data.membership.user_id)
      ?.name || "Team member";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="app-shell">
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label team-workspace-label">
          <span className="workspace-icon">
            <UsersRound size={15} />
          </span>
          <span>
            <strong>{data?.workspace.name || "Team Workspace"}</strong>
            <small>Shared work only</small>
          </span>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <div className="nav-group">
            <div className="nav-heading">YOUR WORKSPACE</div>
            {portalPages.map((item) => (
              <button
                key={item.page}
                className={`nav-item ${page === item.page ? "active" : ""}`}
                onClick={() => navigate(item.page)}
              >
                <item.icon size={17} strokeWidth={1.7} />
                <span>{item.label}</span>
                {page === item.page && <span className="nav-active-dot" />}
              </button>
            ))}
          </div>
        </nav>
        <div className="sidebar-bottom">
          {auth.previewEnabled && (
            <div className="preview-label">Demo only · not private</div>
          )}
          <button
            className="profile-button"
            onClick={() => navigate("settings")}
          >
            <span className="avatar">{initials}</span>
            <span className="profile-copy">
              <strong>{name}</strong>
              <small>{data?.membership.role || "Team member"}</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {portalPages.find((item) => item.page === page)?.label}
            </strong>
          </div>
          <div className="top-actions">
            <Button
              icon={LogOut}
              onClick={() =>
                void signOut().catch((e) =>
                  setSignOutError(
                    e instanceof Error ? e.message : "Unable to sign out.",
                  ),
                )
              }
            >
              Sign out
            </Button>
          </div>
        </header>
        <main className="main-content">
          {signOutError && (
            <div className="form-error" role="alert">
              {signOutError}
            </div>
          )}
          {page === "workspace" ? (
            <TeamWorkspace auth={auth} />
          ) : page === "day" ? (
            <MemberDay />
          ) : (
            <TeamSettings
              auth={auth}
              onThemeChanged={onThemeChanged}
              signOut={signOut}
            />
          )}
          <footer className="app-footer">
            <span>Make progress, together.</span>
            <span>
              MOMENTUM OS <i>•</i> SHARED WORKSPACE
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function MemberDay() {
  const { data, loading, error, refresh } = useTeam();
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const datePart = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  const own =
    data?.tasks.filter(
      (task) => task.assignee_user_id === data.membership.user_id,
    ) || [];
  const active = own.filter(
    (task) => !["approved", "completed"].includes(task.status),
  );
  const current = active.filter(
    (task) => !task.due_date || task.due_date <= today,
  );
  const upcoming = active.filter(
    (task) => task.due_date && task.due_date > today,
  );
  const finished = own.filter((task) =>
    ["approved", "completed"].includes(task.status),
  );
  return (
    <div className="page-wrap team-page">
      <PageHeader
        eyebrow="YOUR SHARED WORK"
        title="My assignments"
        description="A focused view of work assigned to you."
      />
      {loading && !data ? (
        <div className="panel team-loading">Loading your assignments…</div>
      ) : !data ? (
        <div className="panel team-loading">
          <p role="alert">{error}</p>
          <Button onClick={() => void refresh().catch(() => {})}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <section className="panel team-panel">
            <SectionHeading
              title="Ready to move forward"
              sub="Work due today, overdue, or without a date."
            />
            <TeamWorkList
              tasks={current}
              emptyText="You have no current or undated team assignments."
            />
          </section>
          {upcoming.length > 0 && (
            <section className="panel team-panel team-spaced">
              <SectionHeading
                title="Coming up"
                sub="Assignments with a future due date."
              />
              <TeamWorkList
                tasks={upcoming}
                emptyText="No upcoming assignments."
              />
            </section>
          )}
          {finished.length > 0 && (
            <section className="panel team-panel team-spaced">
              <SectionHeading
                title="Reviewed work"
                sub="Your approved and completed assignments."
              />
              <TeamWorkList
                tasks={finished}
                emptyText="No reviewed work yet."
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
function TeamSettings({
  auth,
  onThemeChanged,
  signOut,
}: {
  auth: AuthStatus;
  onThemeChanged: (theme: ThemePreference) => void;
  signOut: () => Promise<void>;
}) {
  const { data, refresh } = useTeam();
  const [theme, setTheme] = useState<ThemePreference>(auth.theme || "light");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await api("/team/preferences", { method: "PATCH", body: { theme } });
      onThemeChanged(theme);
      await refresh();
      setFeedback("Appearance saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save appearance.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-wrap team-page">
      <PageHeader
        eyebrow="YOUR ACCOUNT"
        title="Settings"
        description="Personalise your view of shared work."
      />
      <section className="panel team-panel team-settings">
        <SectionHeading
          title="Appearance"
          sub="Follow your device or choose a fixed appearance."
        />
        <label>
          Theme
          <select
            value={theme}
            onChange={(event) =>
              setTheme(event.target.value as ThemePreference)
            }
          >
            <option value="light">Light (default)</option>
            <option value="system">System · follow device</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save appearance"}
        </Button>
        {feedback && (
          <p className="team-notice" role="status">
            {feedback}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="panel team-panel team-settings team-spaced">
        <SectionHeading
          title="Account"
          sub="Your access is limited to this shared workspace."
        />
        <p>{auth.email}</p>
        <p className="team-form-help">
          Role: {data?.membership.role || "team member"}
        </p>
        <Button
          icon={LogOut}
          onClick={() =>
            void signOut().catch((e) =>
              setError(e instanceof Error ? e.message : "Unable to sign out."),
            )
          }
        >
          Sign out
        </Button>
      </section>
    </div>
  );
}
