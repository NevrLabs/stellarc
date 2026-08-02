import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setApiOrganization } from "./api";
import { closeAxisEvents } from "./axis-events";
import { axisHttp } from "./axis-http";

// Production identity requests are permanently bound to the Axis origin that
// served the UI. A separate API base exists only for Vite development.
const BASE = import.meta.env.DEV ? (import.meta.env.VITE_API_BASE as string) : "";

export interface AxisUser {
  userId: string;
  username: string;
  kind: "user";
}

export interface AxisOrganization {
  id: string;
  slug: string;
  displayName: string;
  role: string;
}

interface AuthContextValue {
  user: AxisUser;
  organizations: AxisOrganization[];
  organization: AxisOrganization;
  selectOrganization(id: string): void;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function axisFetch(path: string, init?: RequestInit): Promise<Response> {
  return axisHttp.fetch(`${BASE}${path}`, init);
}

export function useAxisAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAxisAuth must be used inside AuthGate");
  return value;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AxisUser | null>(null);
  const [organizations, setOrganizations] = useState<AxisOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // null while unknown; false means this Axis has no account yet, so the
  // unauthenticated view is "claim this install" rather than "sign in".
  const [usersExist, setUsersExist] = useState<boolean | null>(null);

  async function loadIdentity(): Promise<boolean> {
    const session = await axisFetch("/api/auth/session");
    if (session.status === 401) return false;
    if (!session.ok) throw new Error(`session ${session.status}`);
    const sessionBody = await session.json() as { user: AxisUser };
    const memberships = await axisFetch("/api/organizations");
    if (!memberships.ok) throw new Error(`organizations ${memberships.status}`);
    const membershipBody = await memberships.json() as { organizations: AxisOrganization[] };
    if (membershipBody.organizations.length === 0) {
      throw new Error("Your account does not belong to an organization.");
    }
    const stored = localStorage.getItem("stellarc-organization-id");
    const selected = membershipBody.organizations.find((org) => org.id === stored)
      ?? membershipBody.organizations[0];
    setUser(sessionBody.user);
    setOrganizations(membershipBody.organizations);
    setOrganizationId(selected.id);
    setApiOrganization(selected.id);
    return true;
  }

  useEffect(() => {
    void (async () => {
      if (await loadIdentity()) return;
      // Only an unauthenticated visitor needs to know whether the install is
      // still unclaimed. The probe returns a bare boolean.
      const bootstrap = await axisFetch("/api/auth/bootstrap");
      setUsersExist(bootstrap.ok ? (await bootstrap.json() as { usersExist: boolean }).usersExist : true);
    })()
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Authentication unavailable"))
      .finally(() => setLoading(false));
  }, []);

  function selectOrganization(id: string): void {
    if (!organizations.some((org) => org.id === id)) return;
    localStorage.setItem("stellarc-organization-id", id);
    setOrganizationId(id);
    setApiOrganization(id);
    queryClient.clear();
  }

  async function logout(): Promise<void> {
    await axisFetch("/api/auth/logout", { method: "POST" });
    closeAxisEvents();
    setApiOrganization(null);
    queryClient.clear();
    setUser(null);
    setOrganizations([]);
    setOrganizationId(null);
  }

  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const value = useMemo(() => user && organization ? {
    user,
    organizations,
    organization,
    selectOrganization,
    logout,
  } : null, [user, organizations, organization]);

  // Both panels post credentials and then resolve the session the same way;
  // only the path and the failure wording differ.
  async function submitCredentials(path: string, username: string, password: string): Promise<void> {
    setError("");
    const response = await axisFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        // Someone else claimed this Axis first. Fall back to the login form.
        setUsersExist(true);
        setError("This Axis already has an account. Sign in instead.");
        return;
      }
      setError(
        response.status === 401 ? "Invalid username or password."
          : response.status === 400 ? (await response.text()) || "Invalid username or password."
            : response.status === 429 ? "Too many attempts. Wait a minute and try again."
              : `${path.endsWith("register") ? "Registration" : "Login"} failed (${response.status}).`,
      );
      return;
    }
    try {
      await loadIdentity();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication unavailable");
    }
  }

  if (loading) return <LoadingPanel />;
  if (!value && usersExist === false) {
    return <RegisterPanel error={error}
      onRegister={(username, password) => submitCredentials("/api/auth/register", username, password)} />;
  }
  if (!value) return <LoginPanel error={error}
    onLogin={(username, password) => submitCredentials("/api/auth/login", username, password)} />;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The Axis origin identity requests are bound to. Shown (read-only) so the
// operator can see which Axis they are signing into — never an editable field.
const AXIS_HOST = typeof window !== "undefined" ? window.location.host : "";

// Restrained monochrome Stellarc mark: twin ascending peaks (altitude / signal),
// stroked in the accent. Purely decorative — hidden from assistive tech.
function AuthMark() {
  return <svg className="auth-brandmark" width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 13 L12 6 L20 13" />
    <path d="M4 18 L12 11 L20 18" />
  </svg>;
}

function AuthShell({ title, subtitle, busy, children }: {
  title: string; subtitle: string; busy?: boolean; children: React.ReactNode;
}) {
  return <main className="auth-screen">
    <section className="auth-card" aria-busy={busy || undefined}>
      <header className="auth-head">
        <span className="auth-kicker">Control plane</span>
        <div className="auth-brand"><AuthMark /><span className="auth-wordmark">Stellarc</span></div>
        <h1 className="auth-title">{title}</h1>
        <p className="auth-sub">{subtitle}</p>
      </header>
      {children}
      <footer className="auth-foot">
        <span className="auth-foot-dot" aria-hidden="true" />
        <span className="auth-foot-key">Axis</span>
        {AXIS_HOST && <span className="auth-foot-host">{AXIS_HOST}</span>}
      </footer>
    </section>
  </main>;
}

function LoadingPanel() {
  return <AuthShell title="Connecting to Axis" subtitle="Establishing a secure session." busy>
    <div className="auth-status" role="status">
      <span className="ol-spinner ol-spinner-lg" aria-hidden="true" />
      <span className="auth-status-text">Connecting…</span>
    </div>
  </AuthShell>;
}

function RegisterPanel({ error, onRegister }: {
  error: string; onRegister(username: string, password: string): Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const errorId = "auth-error";
  const shown = mismatch || error;
  return <AuthShell title="Create the first account"
    subtitle="This Axis has no account yet. The account you create owns it.">
    <form className="auth-form" onSubmit={(event) => {
      event.preventDefault();
      if (password !== confirm) {
        setMismatch("Passwords do not match.");
        return;
      }
      setMismatch("");
      setSubmitting(true);
      void onRegister(username, password).finally(() => setSubmitting(false));
    }}>
      <label className="auth-field">
        <span className="ol-field-label">Username</span>
        <Input className="ol-input" autoFocus autoComplete="username" required
          aria-invalid={shown ? true : undefined} aria-describedby={shown ? errorId : undefined}
          value={username} onChange={(event) => setUsername(event.target.value)} />
      </label>
      <label className="auth-field">
        <span className="ol-field-label">Password</span>
        <Input className="ol-input" type="password" autoComplete="new-password" required minLength={8}
          aria-invalid={shown ? true : undefined} aria-describedby={shown ? errorId : undefined}
          value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <label className="auth-field">
        <span className="ol-field-label">Confirm password</span>
        <Input className="ol-input" type="password" autoComplete="new-password" required minLength={8}
          aria-invalid={shown ? true : undefined} aria-describedby={shown ? errorId : undefined}
          value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </label>
      {shown && <p className="auth-error" role="alert" id={errorId}>{shown}</p>}
      <Button type="submit" className="ol-btn ol-btn-primary ol-btn-block auth-submit" disabled={submitting}>
        {submitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  </AuthShell>;
}

function LoginPanel({ error, onLogin }: { error: string; onLogin(username: string, password: string): Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const errorId = "auth-error";
  return <AuthShell title="Sign in to this Axis" subtitle="Enter your operator credentials to continue.">
    <form className="auth-form" onSubmit={(event) => {
      event.preventDefault();
      setSubmitting(true);
      void onLogin(username, password).finally(() => setSubmitting(false));
    }}>
      <label className="auth-field">
        <span className="ol-field-label">Username</span>
        <Input className="ol-input" autoFocus autoComplete="username" required
          aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
          value={username} onChange={(event) => setUsername(event.target.value)} />
      </label>
      <label className="auth-field">
        <span className="ol-field-label">Password</span>
        <Input className="ol-input" type="password" autoComplete="current-password" required
          aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
          value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error && <p className="auth-error" role="alert" id={errorId}>{error}</p>}
      <Button type="submit" className="ol-btn ol-btn-primary ol-btn-block auth-submit" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  </AuthShell>;
}
