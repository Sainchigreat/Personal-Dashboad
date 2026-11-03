import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { api, setCsrf, setPreviewToken } from "../lib/api";
import { browserStorage } from "../lib/storage";
import { invitationToken } from "../lib/invite";
import type { AuthStatus } from "../types";
import { Logo } from "../components/UI";

type Mode = "signin" | "signup";

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
  // Both options are always visible. A brand-new deployment starts on sign-up;
  // returning visitors start on sign-in and can switch with one click.
  const [mode, setMode] = useState<Mode>(status.needsSetup ? "signup" : "signin");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const signingUp = joining || mode === "signup";

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const password = String(fields.get("password") || "");
      if (signingUp && password.length < 12) {
        setError("Use a password with at least 12 characters.");
        return;
      }
      const body: Record<string, string> = {
        email: String(fields.get("email") || "").trim(),
        password,
      };
      if (signingUp) body.name = String(fields.get("name") || "").trim();
      if (inviteToken) body.inviteToken = inviteToken;
      const result = await api<{ csrfToken: string }>(
        signingUp ? "/auth/register" : "/auth/login",
        { method: "POST", body },
      );
      setCsrf(result.csrfToken);
      setSuccess(
        signingUp ? "Account created. Opening your workspace…" : "Signed in.",
      );
      if (joining) history.replaceState(null, "", "/");
      await onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to continue.");
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
            you’re building. Create a private workspace or sign back in.
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
              : mode === "signup"
                ? "Create your account"
                : "Welcome back"}
          </h2>
          <p>
            {joining
              ? status.authenticated
                ? `You are signed in as ${status.email}. Sign out before accepting this invitation.`
                : "Create your account using the email address the invitation was sent to."
              : mode === "signup"
                ? "Set up your own independent, private workspace."
                : "Sign in to continue where you left off."}
          </p>

          {!joining && (
            <div className="auth-tabs" role="tablist" aria-label="Account access">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signin"}
                className={mode === "signin" ? "active" : ""}
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={mode === "signup" ? "active" : ""}
                onClick={() => switchMode("signup")}
              >
                Create account
              </button>
            </div>
          )}

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
              {signingUp && (
                <label>
                  Name
                  <input
                    name="name"
                    placeholder="Your name"
                    required
                    minLength={1}
                    maxLength={100}
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
                  minLength={signingUp ? 12 : undefined}
                  maxLength={200}
                  placeholder={
                    signingUp ? "At least 12 characters" : "Enter your password"
                  }
                  required
                  autoComplete={signingUp ? "new-password" : "current-password"}
                />
              </label>
              {signingUp && (
                <p className="auth-hint">
                  Use at least 12 characters. Your workspace is private to this
                  account.
                </p>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div className="form-success" role="status">
                  {success}
                </div>
              )}
              <button className="button primary wide" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : joining
                    ? "Create team account"
                    : mode === "signup"
                      ? "Create account"
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
    </main>
  );
}
