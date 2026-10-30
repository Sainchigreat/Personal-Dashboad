import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { api, setCsrf, setPreviewToken } from "../lib/api";
import { browserStorage } from "../lib/storage";
import type { AuthStatus } from "../types";
import { Logo } from "../components/UI";

export default function Auth({
  status,
  onAuthenticated,
}: {
  status: AuthStatus;
  onAuthenticated: () => Promise<void>;
}) {
  const inviteToken = new URLSearchParams(window.location.search).get("token") || "";\n  const registrationMode = status.needsSetup || Boolean(inviteToken);\n  const [error, setError] = useState("");
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
      if (registrationMode) body.name = String(fields.get("name"));\n      if (inviteToken) body.inviteToken = inviteToken;
      const result = await api<{ csrfToken: string }>(
        registrationMode ? "/auth/register" : "/auth/login",
        { method: "POST", body },
      );
      setCsrf(result.csrfToken);
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
            {registrationMode ? "Join the workspace" : "Welcome back"}
          </h2>
          <p>
            {status.needsSetup
              ? "Set up a private owner account to get started."
              : "Sign in to continue where you left off."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {registrationMode && (
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
                minLength={registrationMode ? 12 : undefined}
                placeholder={
                  status.needsSetup
                    ? "At least 12 characters"
                    : "Enter your password"
                }
                required
                autoComplete={
                  registrationMode ? "new-password" : "current-password"
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
                : status.needsSetup
                  ? "Create workspace"
                  : "Sign in"}{" "}
              <ArrowRight size={16} />
            </button>
          </form>
          {status.previewEnabled && (
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
