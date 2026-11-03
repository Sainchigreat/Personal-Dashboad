// Next Chapter speaker / partner register (blueprint §9).
// Explicitly separate from the Graphic Design with AI promotional-partner
// workflow, which is a daily Course Growth routine.
import { useMemo, useState, type FormEvent } from "react";
import { useApp } from "../lib/store";
import {
  Button,
  EmptyState,
  PageHeader,
  SectionHeading,
} from "../components/UI";
import { Mic2, Plus, Trash2, CalendarDays, CheckCircle2 } from "lucide-react";
import type { Speaker } from "../types";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "invited", label: "Invited" },
  { value: "awaiting_response", label: "Awaiting response" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
  { value: "completed", label: "Completed" },
] as const;

const STATUS = [
  "not_invited",
  "invited",
  "awaiting_response",
  "confirmed",
  "declined",
  "completed",
] as const;

export default function Speakers() {
  const { data, create, update, remove, toast, today } = useApp();
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const speakers = useMemo(
    () =>
      data.speakers.filter(
        (speaker) => filter === "all" || speaker.invitation_status === filter,
      ),
    [data.speakers, filter],
  );
  const active = speakers.find((speaker) => speaker.id === selected) || speakers[0];
  const followups = useMemo(
    () =>
      data.speaker_followups
        .filter((item) => item.speaker_id === active?.id)
        .sort((a, b) => b.occurred_date.localeCompare(a.occurred_date)),
    [data.speaker_followups, active?.id],
  );

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await action();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addSpeaker(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await run(
      async () => {
        const created = (await create("speakers", {
          name: trimmed,
          invitation_status: "not_invited",
          confirmation_status: "pending",
        })) as { id: string };
        setSelected(created.id);
      },
      "Speaker added.",
    );
    setName("");
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="NEXT CHAPTER"
        title="Speaker register"
        description="Invite, confirm and prepare Next Chapter guests. Course promotional partners are tracked separately in Course Growth."
      />

      <section className="review-intro">
        <div>
          <span className="overline">SPEAKERS &amp; PARTNERS</span>
          <h2>{data.speakers.length} registered</h2>
          <p>
            Track invitation status, confirmation, agreed and alternative dates,
            reminders, asset requirements, bio/photo receipt, flyer approval and
            follow-up ownership.
          </p>
        </div>
        <span className="review-intro-icon">
          <Mic2 size={24} />
        </span>
      </section>

      <div className="speaker-toolbar">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            className={filter === item.value ? "chip active" : "chip"}
            onClick={() => {
              setFilter(item.value);
              setSelected(null);
            }}
          >
            {item.label}
          </button>
        ))}
        <form onSubmit={addSpeaker} className="goal-create speaker-add">
          <input
            aria-label="New speaker name"
            placeholder="Add a speaker or guest…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="primary" icon={Plus} disabled={busy}>
            Add speaker
          </Button>
        </form>
      </div>

      {speakers.length === 0 ? (
        <EmptyState
          icon={Mic2}
          title="No speakers in this view"
          text="Add a guest to start tracking invitations, confirmations and preparation assets."
        />
      ) : (
        <div className="speaker-layout">
          <div className="panel speaker-list">
            <SectionHeading title="Speakers" sub="Select one to edit its details." />
            {speakers.map((speaker) => (
              <button
                key={speaker.id}
                className={`speaker-row ${active?.id === speaker.id ? "active" : ""}`}
                onClick={() => setSelected(speaker.id)}
              >
                <span>
                  <strong>{speaker.name}</strong>
                  <small>{speaker.topic || "No topic yet"}</small>
                </span>
                <span className="speaker-status">{speaker.invitation_status.replaceAll("_", " ")}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className="panel speaker-detail">
              <div className="goal-card-head">
                <div>
                  <span className="goal-eyebrow">SPEAKER RECORD</span>
                  <strong>{active.name}</strong>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove speaker"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await remove("speakers", active.id);
                      setSelected(null);
                    }, "Speaker removed.")
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <form
                className="goal-edit"
                key={active.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  run(
                    () =>
                      update("speakers", active.id, {
                        name: String(form.get("name") || active.name),
                        email: String(form.get("email") || ""),
                        phone: String(form.get("phone") || ""),
                        organisation: String(form.get("organisation") || ""),
                        topic: String(form.get("topic") || ""),
                        biography: String(form.get("biography") || ""),
                        session_id: String(form.get("session_id") || "") || null,
                        invitation_status: String(form.get("invitation_status") || active.invitation_status),
                        confirmation_status: String(form.get("confirmation_status") || active.confirmation_status),
                        agreed_date: String(form.get("agreed_date") || "") || null,
                        alternative_dates: String(form.get("alternative_dates") || ""),
                        reminder_dates: String(form.get("reminder_dates") || ""),
                        asset_requirements: String(form.get("asset_requirements") || ""),
                        bio_photo_received: form.get("bio_photo_received") ? 1 : 0,
                        flyer_approved: form.get("flyer_approved") ? 1 : 0,
                        notes: String(form.get("notes") || ""),
                      }),
                    "Speaker saved.",
                  );
                }}
              >
                <div className="goal-grid">
                  <label>Name<input name="name" defaultValue={active.name} /></label>
                  <label>Email<input name="email" type="email" defaultValue={active.email} /></label>
                  <label>Phone<input name="phone" defaultValue={active.phone} /></label>
                </div>
                <div className="goal-grid">
                  <label>Organisation<input name="organisation" defaultValue={active.organisation} /></label>
                  <label>Topic<input name="topic" defaultValue={active.topic} /></label>
                  <label>
                    Linked session
                    <select name="session_id" defaultValue={active.session_id || ""}>
                      <option value="">No session</option>
                      {data.chapter_sessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.title} · {session.session_date}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>Biography<textarea name="biography" rows={3} defaultValue={active.biography} /></label>
                <div className="goal-grid">
                  <label>
                    Invitation status
                    <select name="invitation_status" defaultValue={active.invitation_status}>
                      {STATUS.map((status) => (
                        <option key={status} value={status}>
                          {status.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Confirmation
                    <select name="confirmation_status" defaultValue={active.confirmation_status}>
                      <option value="pending">pending</option>
                      <option value="confirmed">confirmed</option>
                      <option value="declined">declined</option>
                    </select>
                  </label>
                  <label>
                    Agreed date
                    <input name="agreed_date" type="date" defaultValue={active.agreed_date || ""} />
                  </label>
                </div>
                <div className="goal-grid">
                  <label>Alternative dates<input name="alternative_dates" defaultValue={active.alternative_dates} /></label>
                  <label>Reminder dates<input name="reminder_dates" defaultValue={active.reminder_dates} /></label>
                  <label>Asset requirements<input name="asset_requirements" defaultValue={active.asset_requirements} /></label>
                </div>
                <div className="speaker-checks">
                  <label className="onboarding-check">
                    <input type="checkbox" name="bio_photo_received" defaultChecked={Boolean(active.bio_photo_received)} />
                    Bio / photo received
                  </label>
                  <label className="onboarding-check">
                    <input type="checkbox" name="flyer_approved" defaultChecked={Boolean(active.flyer_approved)} />
                    Flyer approved
                  </label>
                </div>
                <label>Notes<textarea name="notes" rows={2} defaultValue={active.notes} /></label>
                <Button type="submit" variant="secondary" disabled={busy}>
                  Save speaker
                </Button>
              </form>

              <div className="speaker-followups">
                <SectionHeading
                  title={`Follow-up history (${followups.length})`}
                  sub="Ownership stays with this workspace; each entry is a real recorded contact."
                />
                {followups.map((item) => (
                  <div key={item.id} className="speaker-followup">
                    <CalendarDays size={14} />
                    <span>
                      <strong>{item.occurred_date}</strong>
                      <small>
                        {item.channel ? `${item.channel} · ` : ""}
                        {item.summary}
                      </small>
                    </span>
                  </div>
                ))}
                {followups.length === 0 && (
                  <p className="muted">No follow-ups recorded yet.</p>
                )}
                <form
                  className="goal-create"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const summary = String(form.get("summary") || "").trim();
                    if (!summary) return;
                    run(
                      async () => {
                        await create("speaker_followups", {
                          speaker_id: active.id,
                          occurred_date: String(form.get("occurred_date") || today),
                          channel: String(form.get("channel") || ""),
                          summary,
                        });
                        (event.currentTarget as HTMLFormElement).reset();
                      },
                      "Follow-up recorded.",
                    );
                  }}
                >
                  <input name="occurred_date" type="date" defaultValue={today} aria-label="Follow-up date" />
                  <input name="channel" placeholder="Channel (email, call…)" aria-label="Channel" />
                  <input name="summary" placeholder="What happened?" aria-label="Follow-up summary" />
                  <Button type="submit" variant="secondary" icon={Plus} disabled={busy}>
                    Log
                  </Button>
                </form>
              </div>
              <p className="muted speaker-note">
                <CheckCircle2 size={13} /> Course promotional partners for Graphic
                Design with AI are intentionally not part of this register.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
