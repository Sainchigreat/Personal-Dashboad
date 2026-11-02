import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { api, setCsrf, setPreviewToken } from "../lib/api";
import { browserStorage } from "../lib/storage";
import { invitationToken } from "../lib/invite";
import type { AuthStatus } from "../types";
import { Logo } from "../components/UI";

export default function Auth({
  status,
  onAuthenticated,
  onSignOut,
}: {
  status: AuthStatus;
  onAuthenticated: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const inviteToken = invitationToken();
  const joining = Boolean(inviteToken);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const body: Record<string, string> = {
        email: String(fields.get("email")),
        password: String(fields.get("password")),
      };
      if (status.needsSetup || joining) body.name = String(fields.get("name"));
      if (inviteToken) body.inviteToken = inviteToken;
      const result = await api<{ csrfToken: string }>(
        status.needsSetup || joining ? "/auth/register" : "/auth/login",
        { method: "POST", body },
      );
      setCsrf(result.csrfToken);
      if (joining) history.replaceState(null, "", "/");
      await onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  async function openPreview() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ csrfToken: string; previewToken: string }>(
        "/auth/preview",
        { method: "POST" },
      );
      setCsrf(result.csrfToken);
      setPreviewToken(result.previewToken);
      browserStorage.remove("momentum-preview-signed-out");
      await onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open preview.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-top">
        <Logo />
        <span>YOUR PERSONAL OPERATING SYSTEM</span>
      </div>
      <div className="auth-wrap">
        <div className="auth-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> MADE FOR YOUR MOMENTUM
          </div>
          <h1>
            Make room for
            <br />
            <em>what matters.</em>
          </h1>
          <p>
            One thoughtful place for your work, your ideas, and everything
            you’re building.
          </p>
          <div className="auth-orbit">
            <div />
            <div />
            <span>
              <Logo compact />
            </span>
          </div>
        </div>
        <div className="auth-card">
          <div className="auth-icon">
            <LockKeyhole size={20} />
          </div>
          <h2>
            {joining
              ? "Join your team"
              : status.needsSetup
                ? "Create your workspace"
                : "Welcome back"}
          </h2>
          <p>
            {joining
              ? status.authenticated
                ? `You are signed in as ${status.email}. Sign out before accepting this invitation.`
                : "Create your account using the email address the invitation was sent to."
              : status.needsSetup
                ? "Set up a private owner account to get started."
                : "Sign in to continue where you left off."}
          </p>
          {joining && status.authenticated ? (
            <div className="auth-form">
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button
                className="button primary wide"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await onSignOut();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Unable to sign out.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sign out to join <ArrowRight size={16} />
              </button>
              <a href="/">Keep current account</a>
            </div>
          ) : (
            <form onSubmit={submit} className="auth-form">
              {(status.needsSetup || joining) && (
                <label>
                  Name
                  <input
                    name="name"
                    placeholder="Your name"
                    required
                    autoComplete="name"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={status.needsSetup || joining ? 12 : undefined}
                  placeholder={
                    status.needsSetup || joining
                      ? "At least 12 characters"
                      : "Enter your password"
                  }
                  required
                  autoComplete={
                    status.needsSetup || joining
                      ? "new-password"
                      : "current-password"
                  }
                />
              </label>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary wide" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : joining
                    ? "Create team account"
                    : status.needsSetup
                      ? "Create workspace"
                      : "Sign in"}{" "}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          {status.previewEnabled && !joining && (
            <>
              <div className="auth-divider">
                <span>OR</span>
              </div>
              <button
                className="button secondary wide"
                onClick={openPreview}
                disabled={busy}
              >
                Open sandbox preview <ArrowRight size={16} />
              </button>
              <p className="preview-warning">
                Preview access is not private. Use a normal deployment for
                personal data.
              </p>
            </>
          )}
          <div className="auth-foot">
            <ShieldCheck size={15} /> Your workspace, thoughtfully protected.
          </div>
        </div>
      </div>
      <div className="auth-bottom">
        ONE SYSTEM. EVERY AMBITION. <span>© MOMENTUM OS</span>
      </div>
    </main>
  );
}
