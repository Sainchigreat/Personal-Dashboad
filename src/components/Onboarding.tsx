// First-use onboarding. Shown only while onboarding_completed = 0. Skippable
// and reopenable from Settings. Never seeds another account's plan.
import { useState, type FormEvent } from "react";
import { useApp } from "../lib/store";
import { Button, SectionHeading } from "./UI";

const ROLES = [
  { value: "individual", label: "Just me", detail: "A private personal workspace." },
  { value: "business", label: "Running a business", detail: "Goals, sales and a team workspace." },
  { value: "team", label: "Joining a team", detail: "Shared goals and assigned deliverables." },
];
const FOCUS = [
  "Course growth",
  "Client pipeline",
  "Creative projects",
  "Content & brand",
  "Next Chapter",
];
const DAYS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

type Profile = {
  role: string;
  useCase: string;
  workingDays: string;
  focusAreas: string[];
  configuredAt: string;
};

function readProfile(raw: string | undefined): Partial<Profile> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function Onboarding() {
  const { data, updateSettings, setPage, toast } = useApp();
  const existing = readProfile(data.settings?.onboarding_profile);
  const [open, setOpen] = useState(Number(data.settings?.onboarding_completed ?? 0) === 0);
  const [role, setRole] = useState(existing.role || "individual");
  const [useCase, setUseCase] = useState(existing.useCase || "");
  const [timezone, setTimezone] = useState(
    data.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos",
  );
  const [workStart, setWorkStart] = useState(data.settings?.work_start || "08:00");
  const [workEnd, setWorkEnd] = useState(data.settings?.work_end || "17:00");
  const [days, setDays] = useState<string[]>(
    existing.workingDays ? existing.workingDays.split(",").filter(Boolean) : ["1", "2", "3", "4", "5"],
  );
  const [focus, setFocus] = useState<string[]>(existing.focusAreas || []);
  const [autoPlan, setAutoPlan] = useState(Number(data.settings?.auto_plan ?? 1) === 1);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function toggleDay(day: string) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }
  function toggleFocus(area: string) {
    setFocus((prev) =>
      prev.includes(area) ? prev.filter((f) => f !== area) : [...prev, area],
    );
  }

  async function finish(event: FormEvent | undefined, skipped: boolean) {
    event?.preventDefault();
    setBusy(true);
    const profile: Profile = {
      role,
      useCase: skipped ? "" : useCase.trim(),
      workingDays: days.sort().join(","),
      focusAreas: focus,
      configuredAt: new Date().toISOString(),
    };
    try {
      await updateSettings({
        ...(skipped
          ? {}
          : {
              timezone,
              work_start: workStart,
              work_end: workEnd,
              auto_plan: autoPlan ? 1 : 0,
            }),
        onboarding_profile: JSON.stringify(profile),
        onboarding_completed: 1,
      });
      setOpen(false);
      toast(skipped ? "Setup skipped. You can reopen it from Settings." : "Your workspace is ready.");
      if (!skipped) setPage("goals");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save setup.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="Workspace setup">
      <div className="onboarding-card">
        <span className="overline">WELCOME TO MOMENTUM OS</span>
        <SectionHeading
          title="Set up your own workspace"
          sub="This is a clean, private workspace. Nothing from another account is copied here. You can skip this and return later from Settings."
        />
        <form onSubmit={(event) => finish(event, false)} className="onboarding-form">
          <fieldset>
            <legend>What best describes you?</legend>
            <div className="onboarding-options">
              {ROLES.map((option) => (
                <label key={option.value} className={role === option.value ? "selected" : ""}>
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={role === option.value}
                    onChange={() => setRole(option.value)}
                  />
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <label>
            Your main use case (optional)
            <input
              value={useCase}
              maxLength={200}
              placeholder="e.g. Launch a course, grow a studio…"
              onChange={(e) => setUseCase(e.target.value)}
            />
          </label>

          <div className="onboarding-grid">
            <label>
              Timezone
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </label>
            <label>
              Work start
              <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
            </label>
            <label>
              Work end
              <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
            </label>
          </div>

          <fieldset>
            <legend>Working days</legend>
            <div className="onboarding-chips">
              {DAYS.map((day) => (
                <button
                  type="button"
                  key={day.value}
                  className={days.includes(day.value) ? "chip active" : "chip"}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Optional focus areas</legend>
            <div className="onboarding-chips">
              {FOCUS.map((area) => (
                <button
                  type="button"
                  key={area}
                  className={focus.includes(area) ? "chip active" : "chip"}
                  onClick={() => toggleFocus(area)}
                >
                  {area}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="onboarding-check">
            <input
              type="checkbox"
              checked={autoPlan}
              onChange={(e) => setAutoPlan(e.target.checked)}
            />
            Generate an editable daily plan from my routine (never marks work complete)
          </label>

          <div className="onboarding-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => finish(undefined, true)}
            >
              Skip for now
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Finish setup"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
