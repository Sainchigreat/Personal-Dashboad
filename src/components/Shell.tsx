import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Command,
  LayoutGrid,
  Menu,
  PenLine,
  Plus,
  Radio,
  Search,
  Settings2,
  Sparkles,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { FormName, Page } from "../types";
import { asRecord, useApp } from "../lib/store";
import { displayDate, displayMonth } from "../lib/date";
import { isOpenTask } from "../lib/metrics";
import { Button, IconButton, Logo, Modal } from "./UI";

type NavItem = { page: Page; label: string; icon: LucideIcon };
const groups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "WORKSPACE",
    items: [
      { page: "command", label: "Command Centre", icon: LayoutGrid },
      { page: "day", label: "My Day", icon: CheckSquare2 },
      { page: "review", label: "Weekly Review", icon: BarChart3 },
    ],
  },
  {
    title: "YOUR WORK",
    items: [
      { page: "course", label: "Course Growth", icon: CircleDollarSign },
      { page: "studio", label: "Creative Studio", icon: Clapperboard },
      { page: "chapter", label: "Next Chapter", icon: Radio },
      { page: "brand", label: "Personal Brand", icon: PenLine },
      { page: "pipeline", label: "Client Pipeline", icon: BriefcaseBusiness },
    ],
  },
  {
    title: "COLLABORATION",
    items: [{ page: "team", label: "Team Workspace", icon: UsersRound }],
  },
  {
    title: "SYSTEM",
    items: [{ page: "settings", label: "Settings", icon: Settings2 }],
  },
];
export const allNav = groups.flatMap((group) => group.items);
const quickActions: Array<{
  name: FormName;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    name: "task",
    label: "Add a task",
    description: "Make a plan",
    icon: CheckSquare2,
    tone: "accent",
  },
  {
    name: "sale",
    label: "Log a sale",
    description: "Record a payment",
    icon: CircleDollarSign,
    tone: "green",
  },
  {
    name: "prospect",
    label: "Add a prospect",
    description: "Grow your network",
    icon: BriefcaseBusiness,
    tone: "secondary",
  },
  {
    name: "project",
    label: "Create a project",
    description: "Start something new",
    icon: Clapperboard,
    tone: "highlight",
  },
  {
    name: "content",
    label: "Capture an idea",
    description: "Plan your content",
    icon: PenLine,
    tone: "secondary",
  },
  {
    name: "session",
    label: "Plan a session",
    description: "Make a conversation happen",
    icon: Radio,
    tone: "accent",
  },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const {
    data,
    cycle,
    selectCycle,
    page,
    setPage,
    openForm,
    today,
    auth,
    notice,
  } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const selectedPage = allNav.find((item) => item.page === page);
  const initials =
    data.settings.name
      .split(" ")
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "M";
  const alerts = useMemo(
    () =>
      [
        ...data.prospects
          .filter(
            (item) =>
              item.follow_up_date &&
              item.follow_up_date <= today &&
              !["Won", "Lost", "Not a fit"].includes(item.status),
          )
          .map((item) => ({
            id: item.id,
            title: `Follow up with ${item.company}`,
            date: item.follow_up_date!,
            page: "pipeline" as Page,
          })),
        ...data.leads
          .filter(
            (item) =>
              item.follow_up_date &&
              item.follow_up_date <= today &&
              !["Converted", "Not interested"].includes(item.status),
          )
          .map((item) => ({
            id: item.id,
            title: `Follow up with ${item.name}`,
            date: item.follow_up_date!,
            page: "course" as Page,
          })),
        ...data.projects
          .filter(
            (item) =>
              item.deadline &&
              item.deadline <= today &&
              item.stage !== "Completed",
          )
          .map((item) => ({
            id: item.id,
            title: `Project due: ${item.title}`,
            date: item.deadline!,
            page: "studio" as Page,
          })),
        ...data.tasks
          .filter(
            (item) =>
              item.due_date && item.due_date < today && isOpenTask(item),
          )
          .map((item) => ({
            id: item.id,
            title: item.title,
            date: item.due_date!,
            page: "day" as Page,
          })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    [data, today],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  function navigate(target: Page) {
    setPage(target);
    setMobileOpen(false);
    setQuickOpen(false);
    setAlertsOpen(false);
  }
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
        <button
          className="workspace-label"
          onClick={() => navigate("settings")}
        >
          <span className="workspace-icon">
            <Sparkles size={14} />
          </span>
          <span>
            <strong>My workspace</strong>
            <small>Personal</small>
          </span>
          <ChevronRight size={14} />
        </button>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {groups.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-heading">{group.title}</div>
              {group.items.map((item) => (
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
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="cycle-side" onClick={() => navigate("settings")}>
            <div className="cycle-side-top">
              <span>OPERATING CYCLE</span>
              <Activity size={14} />
            </div>
            <strong>{displayMonth(cycle.month)}</strong>
            <small>
              <span />{" "}
              {cycle.status === "active" ? "Active cycle" : "Viewing history"}
            </small>
          </button>
          {auth.previewEnabled && (
            <div className="preview-label">Sandbox preview · not private</div>
          )}
          <button
            className="profile-button"
            onClick={() => navigate("settings")}
          >
            <span className="avatar">{initials}</span>
            <span className="profile-copy">
              <strong>{data.settings.name}</strong>
              <small>Personal workspace</small>
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
            <strong>{selectedPage?.label}</strong>
          </div>
          <div className="top-actions">
            <button
              className="search-trigger"
              aria-label="Search workspace ⌘ K"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={15} />
              <span>Search workspace</span>
              <kbd aria-hidden="true">⌘ K</kbd>
            </button>
            <label className="cycle-select">
              <CalendarDays size={15} />
              <span className="sr-only">Select operating cycle</span>
              <select
                value={cycle.id}
                onChange={(event) => selectCycle(event.target.value)}
              >
                {data.cycles
                  .slice()
                  .sort((a, b) => b.month.localeCompare(a.month))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {displayMonth(item.month)}
                      {item.status === "archived" ? " · archived" : ""}
                    </option>
                  ))}
              </select>
              <ChevronDown size={13} />
            </label>
            <div className="popover-anchor">
              <IconButton
                icon={Bell}
                label={`Attention items${alerts.length ? ` (${alerts.length})` : ""}`}
                onClick={() => {
                  setAlertsOpen(!alertsOpen);
                  setQuickOpen(false);
                }}
              />
              {alerts.length > 0 &&
                Boolean(data.settings.notifications_enabled) && (
                  <span className="notification-dot" />
                )}
              {alertsOpen && (
                <div className="popover alerts-popover">
                  <div className="popover-title">
                    Needs your attention <span>{alerts.length}</span>
                  </div>
                  {alerts.length ? (
                    alerts.slice(0, 6).map((item) => (
                      <button
                        key={`${item.page}-${item.id}`}
                        onClick={() => navigate(item.page)}
                      >
                        <span>
                          {item.title}
                          <small>{displayDate(item.date)}</small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))
                  ) : (
                    <div className="popover-empty">
                      Nothing waiting on you right now.
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="popover-anchor">
              <Button
                variant="primary"
                icon={Plus}
                className="quick-add"
                aria-label="Quick add"
                onClick={() => {
                  setQuickOpen(!quickOpen);
                  setAlertsOpen(false);
                }}
              >
                Quick add
              </Button>
              {quickOpen && (
                <div className="popover quick-popover">
                  <div className="popover-title">QUICK ACTIONS</div>
                  {quickActions.map((action) => (
                    <button
                      key={action.name}
                      onClick={() => {
                        setQuickOpen(false);
                        openForm(action.name);
                      }}
                    >
                      <span className={`quick-icon ${action.tone}`}>
                        <action.icon size={16} />
                      </span>
                      <span>
                        {action.label}
                        <small>{action.description}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="main-content">
          {children}
          <footer className="app-footer">
            <span>Make progress, at your own pace.</span>
            <span>
              MOMENTUM OS <i>•</i> YOUR PERSONAL WORKSPACE
            </span>
          </footer>
        </main>
      </div>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
      {notice && (
        <div className={`toast ${notice.kind}`} role="status">
          {notice.message}
        </div>
      )}
    </div>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const { data, setPage, openForm } = useApp();
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const results = [
    ...allNav.map((item) => ({
      id: `page-${item.page}`,
      title: item.label,
      subtitle: "Go to page",
      icon: item.icon,
      action: () => setPage(item.page),
    })),
    ...data.tasks.map((item) => ({
      id: `task-${item.id}`,
      title: item.title,
      subtitle: "Task",
      icon: CheckSquare2,
      action: () => {
        setPage("day");
        openForm("task", asRecord(item));
      },
    })),
    ...data.projects.map((item) => ({
      id: `project-${item.id}`,
      title: item.title,
      subtitle: "Creative project",
      icon: Clapperboard,
      action: () => {
        setPage("studio");
        openForm("project", asRecord(item));
      },
    })),
    ...data.prospects.map((item) => ({
      id: `prospect-${item.id}`,
      title: item.company,
      subtitle: "Prospect",
      icon: BriefcaseBusiness,
      action: () => {
        setPage("pipeline");
        openForm("prospect", asRecord(item));
      },
    })),
    ...data.content_items.map((item) => ({
      id: `content-${item.id}`,
      title: item.title,
      subtitle: "Content",
      icon: PenLine,
      action: () => {
        setPage("brand");
        openForm("content", asRecord(item));
      },
    })),
    ...data.chapter_sessions.map((item) => ({
      id: `session-${item.id}`,
      title: item.title,
      subtitle: "Next Chapter session",
      icon: Radio,
      action: () => {
        setPage("chapter");
        openForm("session", asRecord(item));
      },
    })),
  ]
    .filter(
      (item) =>
        !term || `${item.title} ${item.subtitle}`.toLowerCase().includes(term),
    )
    .slice(0, 9);
  return (
    <Modal
      title="Search your workspace"
      subtitle="Find a page, task, project, prospect, or idea."
      onClose={onClose}
    >
      <div className="search-modal">
        <div className="search-input">
          <Search size={18} />
          <input
            placeholder="Start typing..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span>ESC</span>
        </div>
        <div className="search-results">
          {results.length ? (
            results.map((result) => (
              <button
                key={result.id}
                onClick={() => {
                  onClose();
                  result.action();
                }}
              >
                <span className="search-result-icon">
                  <result.icon size={16} />
                </span>
                <span>
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))
          ) : (
            <div className="popover-empty">
              No matches yet. Try another search.
            </div>
          )}
        </div>
        <div className="search-help">
          <Command size={13} /> Search stays inside your workspace.
        </div>
      </div>
    </Modal>
  );
}
