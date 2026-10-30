import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Archive,
  Check,
  CircleDollarSign,
  Clock3,
  Database,
  Download,
  Globe2,
  LockKeyhole,
  LogOut,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "../lib/api";
import { asRecord, useApp } from "../lib/store";
import { displayMonth } from "../lib/date";
import { currency } from "../lib/metrics";
import {
  Button,
  PageHeader,
  Pill,
  SectionHeading,
  Tabs,
} from "../components/UI";

type DailyTemplate = {
  title: string;
  category?: string;
  priority?: string;
  estimated_minutes?: number;
};
function templatesFrom(value: string): DailyTemplate[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
export default function Settings() {
  const {
    data,
    cycle,
    selectCycle,
    openForm,
    updateSettings,
    toast,
    auth,
    signOut,
  } = useApp();
  const [tab, setTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const settings = data.settings;
  const [values, setValues] = useState({
    name: settings.name,
    business_name: settings.business_name,
    timezone: settings.timezone,
    work_start: settings.work_start,
    work_end: settings.work_end,
    theme: settings.theme,
    platforms: settings.platforms,
    notifications_enabled: Boolean(settings.notifications_enabled),
    auto_plan: Boolean(settings.auto_plan),
    templates: templatesFrom(settings.daily_templates)
      .map((item) => item.title)
      .join("\n"),
  });
  useEffect(() => {
    setValues({
      name: settings.name,
      business_name: settings.business_name,
      timezone: settings.timezone,
      work_start: settings.work_start,
      work_end: settings.work_end,
      theme: settings.theme,
      platforms: settings.platforms,
      notifications_enabled: Boolean(settings.notifications_enabled),
      auto_plan: Boolean(settings.auto_plan),
      templates: templatesFrom(settings.daily_templates)
        .map((item) => item.title)
        .join("\n"),
    });
  }, [settings.updated_at]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const previous = templatesFrom(settings.daily_templates);
      const templates = values.templates
        .split("\n")
        .map((title) => title.trim())
        .filter(Boolean)
        .map(
          (title) =>
            previous.find((item) => item.title === title) || {
              title,
              category: "Personal",
              priority: "medium",
              estimated_minutes: 0,
            },
        );
      const platforms = values.platforms
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .join(",");
      await updateSettings({
        name: values.name,
        business_name: values.business_name,
        timezone: values.timezone,
        work_start: values.work_start,
        work_end: values.work_end,
        theme: values.theme,
        platforms,
        notifications_enabled: values.notifications_enabled ? 1 : 0,
        auto_plan: values.auto_plan ? 1 : 0,
        daily_templates: JSON.stringify(templates),
      });
      toast("Preferences saved.");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Unable to save preferences.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }
  async function exportData() {
    try {
      const output = await api<unknown>("/export");
      const blob = new Blob([JSON.stringify(output, null, 2)], {
        type: "application/json",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `momentum-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast("Your backup has been downloaded.");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Unable to export your data.",
        "error",
      );
    }
  }
  async function logout() {
    try {
      await signOut();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to sign out.", "error");
    }
  }
  const cycles = data.cycles
    .slice()
    .sort((a, b) => b.month.localeCompare(a.month));
  const previous = data.cycles
    .filter((item) => item.month < cycle.month)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  const totals = (cycleId: string) => {
    const sales = data.sales.filter(
      (sale) => sale.cycle_id === cycleId && sale.status === "paid",
    );
    return {
      sales: sales.length,
      revenue: sales.reduce((sum, item) => sum + item.amount, 0),
    };
  };
  const currentTotals = totals(cycle.id);
  const previousTotals = previous ? totals(previous.id) : null;
  return (
    <div className="page-wrap settings-page">
      <PageHeader
        eyebrow="MAKE IT YOURS"
        title="Settings"
        description="Shape your operating system around the way you work."
      />
      <div className="settings-tabs">
        <Tabs
          selected={tab}
          onChange={setTab}
          tabs={[
            { id: "general", label: "General" },
            { id: "cycles", label: "Operating cycles" },
            { id: "products", label: "Products & data" },
          ]}
        />
      </div>
      {tab === "general" && (
        <div className="settings-layout">
          <div className="settings-main">
            <form onSubmit={save}>
              <section className="panel settings-section">
                <SectionHeading
                  title="Your workspace"
                  sub="The details that make this place feel like yours."
                />
                <div className="settings-form-grid">
                  <label>
                    Display name
                    <input
                      value={values.name}
                      onChange={(e) =>
                        setValues({ ...values, name: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    Business name <small>Optional</small>
                    <input
                      value={values.business_name}
                      onChange={(e) =>
                        setValues({ ...values, business_name: e.target.value })
                      }
                      placeholder="Your business or studio"
                    />
                  </label>
                  <label>
                    Time zone
                    <input
                      value={values.timezone}
                      onChange={(e) =>
                        setValues({ ...values, timezone: e.target.value })
                      }
                      list="timezones"
                      required
                    />
                    <datalist id="timezones">
                      <option value="Africa/Lagos" />
                      <option value="UTC" />
                      <option value="Europe/London" />
                      <option value="America/New_York" />
                      <option value="Africa/Nairobi" />
                    </datalist>
                    <small>Use an IANA time zone, e.g. Africa/Lagos.</small>
                  </label>
                  <label>
                    Appearance
                    <select
                      value={values.theme}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          theme: e.target.value as "dark" | "light",
                        })
                      }
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </label>
                </div>
              </section>
              <section className="panel settings-section">
                <SectionHeading
                  title="Working rhythm"
                  sub="Create a baseline, not a rigid schedule."
                />
                <div className="settings-form-grid">
                  <label>
                    Workday starts
                    <input
                      type="time"
                      value={values.work_start}
                      onChange={(e) =>
                        setValues({ ...values, work_start: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    Workday ends
                    <input
                      type="time"
                      value={values.work_end}
                      onChange={(e) =>
                        setValues({ ...values, work_end: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label className="field-full">
                    Content platforms
                    <input
                      value={values.platforms}
                      onChange={(e) =>
                        setValues({ ...values, platforms: e.target.value })
                      }
                      required
                    />
                    <small>
                      Separate platforms with commas. Existing content is
                      preserved.
                    </small>
                  </label>
                  <label className="checkbox-field field-full">
                    <input
                      type="checkbox"
                      checked={values.auto_plan}
                      onChange={(e) =>
                        setValues({ ...values, auto_plan: e.target.checked })
                      }
                    />
                    <span>
                      Generate my recurring daily plan
                      <small>
                        Editable tasks are created once per local day. No task
                        is marked complete automatically.
                      </small>
                    </span>
                  </label>
                  <label className="field-full">
                    Daily task template
                    <textarea
                      rows={7}
                      value={values.templates}
                      onChange={(e) =>
                        setValues({ ...values, templates: e.target.value })
                      }
                    />
                    <small>
                      One task per line. Changes apply the next time a day is
                      generated.
                    </small>
                  </label>
                  <label className="checkbox-field field-full">
                    <input
                      type="checkbox"
                      checked={values.notifications_enabled}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          notifications_enabled: e.target.checked,
                        })
                      }
                    />
                    <span>
                      Show an in-app attention badge
                      <small>
                        For due follow-ups, overdue tasks, and project
                        deadlines. No external notifications are sent.
                      </small>
                    </span>
                  </label>
                </div>
              </section>
              <div className="settings-save">
                <span>Preferences are saved to your workspace.</span>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? "Saving…" : "Save preferences"}
                </Button>
              </div>
            </form>
          </div>
          <aside className="module-aside">
            <section className="panel side-panel">
              <div className="side-panel-icon blue">
                <Sparkles size={18} />
              </div>
              <span className="overline">YOUR SYSTEM, YOUR RULES</span>
              <h2>Built to adapt with you.</h2>
              <p>
                Change your working hours, daily plan, or priorities whenever
                life changes.
              </p>
              <div className="settings-tip">
                <Clock3 size={16} />
                <span>
                  Your current time zone is <strong>{settings.timezone}</strong>
                  .
                </span>
              </div>
            </section>
            <section className="panel side-panel compact-side">
              <SectionHeading
                title="Account"
                action={<LockKeyhole size={17} className="muted-icon" />}
              />
              <p className="side-small-copy">
                {auth.previewEnabled
                  ? "You are using an isolated sandbox preview. Preview access is not private."
                  : `Signed in as ${auth.email}.`}
              </p>
              <Button icon={LogOut} onClick={logout} className="wide">
                Sign out
              </Button>
            </section>
          </aside>
        </div>
      )}
      {tab === "cycles" && (
        <div className="settings-layout">
          <div className="settings-main">
            <section className="panel settings-section">
              <SectionHeading
                title="Operating cycles"
                sub="Each month has its own targets. Your work and history stay connected."
                action={
                  <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => openForm("rollover")}
                  >
                    Start new cycle
                  </Button>
                }
              />
              <div className="cycles-list">
                {cycles.map((item) => (
                  <div
                    className={`cycle-row ${item.id === cycle.id ? "selected" : ""}`}
                    key={item.id}
                  >
                    <button
                      className="cycle-row-main"
                      onClick={() => selectCycle(item.id)}
                    >
                      <span className="cycle-row-icon">
                        <CalendarIcon />
                      </span>
                      <span>
                        <strong>{displayMonth(item.month)}</strong>
                        <small>
                          {item.theme || "No theme set"} · {item.sales_target}{" "}
                          sales target
                        </small>
                      </span>
                    </button>
                    <Pill
                      tone={item.status === "active" ? "green" : "neutral"}
                      dot
                    >
                      {item.status === "active" ? "Active" : "Archived"}
                    </Pill>
                    <Button onClick={() => openForm("cycle", asRecord(item))}>
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
              <div className="settings-info">
                <Archive size={16} />
                <span>
                  Starting a new cycle archives the current one without deleting
                  its records. Ongoing projects, prospects, and content stay
                  available.
                </span>
              </div>
            </section>
            <section className="panel settings-section">
              <SectionHeading
                title={`${displayMonth(cycle.month)} objectives`}
                sub={cycle.objective || "No primary objective set."}
                action={
                  <button
                    className="plain-action"
                    onClick={() => openForm("cycle", asRecord(cycle))}
                  >
                    Edit goals <ArrowRight size={14} />
                  </button>
                }
              />
              <div className="objective-list">
                {cycle.objectives
                  .split("\n")
                  .filter(Boolean)
                  .map((line, index) => (
                    <div key={`${line}-${index}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {line}
                    </div>
                  ))}
                {!cycle.objectives.trim() && (
                  <div className="small-empty">
                    Add objectives for this cycle when you’re ready.
                  </div>
                )}
              </div>
            </section>
          </div>
          <aside className="module-aside">
            <section className="panel side-panel">
              <div className="side-panel-icon blue">
                <Database size={18} />
              </div>
              <span className="overline">HISTORY IS NEVER RESET</span>
              <h2>Every month builds on the last.</h2>
              <p>
                Switch cycles from the top bar to revisit earlier targets and
                results.
              </p>
            </section>
            <section className="panel side-panel compact-side">
              <SectionHeading
                title="Cycle comparison"
                sub={
                  previous
                    ? `${displayMonth(previous.month)} → ${displayMonth(cycle.month)}`
                    : "No earlier cycle to compare yet."
                }
              />
              {previousTotals && (
                <>
                  <div className="side-counter">
                    <span>Paid sales</span>
                    <strong>
                      {previousTotals.sales} → {currentTotals.sales}
                    </strong>
                  </div>
                  <div className="side-counter">
                    <span>Revenue</span>
                    <strong>
                      {currency(previousTotals.revenue)} →{" "}
                      {currency(currentTotals.revenue)}
                    </strong>
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>
      )}
      {tab === "products" && (
        <div className="settings-layout">
          <div className="settings-main">
            <section className="panel settings-section">
              <SectionHeading
                title="Products & services"
                sub="Offerings persist across operating cycles."
                action={
                  <Button icon={Plus} onClick={() => openForm("product")}>
                    Add product
                  </Button>
                }
              />
              <div className="cycles-list">
                {data.products.map((product) => (
                  <button
                    className="product-row"
                    key={product.id}
                    onClick={() => openForm("product", asRecord(product))}
                  >
                    <span className="record-icon blue">
                      <CircleDollarSign size={17} />
                    </span>
                    <span>
                      <strong>{product.name}</strong>
                      <small>
                        {product.description || "Digital product"} ·{" "}
                        {currency(product.price)}
                      </small>
                    </span>
                    <Pill tone={product.active ? "green" : "neutral"}>
                      {product.active ? "Available" : "Archived"}
                    </Pill>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
            </section>
            <section className="panel settings-section">
              <SectionHeading
                title="Your data"
                sub="Keep a portable copy of your workspace."
              />
              <div className="data-export">
                <span className="side-panel-icon blue">
                  <Download size={18} />
                </span>
                <span>
                  <strong>Export a JSON backup</strong>
                  <small>
                    Includes your cycles, tasks, transactions, projects,
                    content, and settings. Passwords and sessions are never
                    exported.
                  </small>
                </span>
                <Button icon={Download} onClick={exportData}>
                  Download backup
                </Button>
              </div>
            </section>
            <section className="panel settings-section">
              <SectionHeading
                title="Integrations"
                sub="Your system is in control of what goes out."
              />
              <div className="settings-info">
                <Globe2 size={17} />
                <span>
                  No external integrations are configured. Momentum OS does not
                  send messages or publish content automatically.
                </span>
              </div>
            </section>
          </div>
          <aside className="module-aside">
            <section className="panel side-panel">
              <div className="side-panel-icon green">
                <ShieldCheck size={18} />
              </div>
              <span className="overline">YOUR WORK BELONGS TO YOU</span>
              <h2>Keep the important things safe.</h2>
              <p>
                Download backups regularly and store them somewhere secure. For
                deployment, use a persistent disk and HTTPS.
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
function CalendarIcon() {
  return (
    <span className="calendar-glyph">
      <span />
      <span />
      <span />
    </span>
  );
}
