import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
// AppShell — the Stellarc application frame.
//
// Layout (matches docs/design/concept/stellarc-app-concept.html):
//   ┌─────────────────────────────────────────────────┐
//   │ TopBar (sidebar toggle · nav rail · search · org · profile) │
//   ├──────────┬──────────────┬───────────────────────┤
//   │ Left     │ Secondary    │ Viewport              │
//   │ rail     │ sidebar      │ (chat / fleet / etc.) │
//   │ (icons)  │ (per-surface)│                      │
//   │          │              │                      │
//   └──────────┴──────────────┴───────────────────────┘
//
// The left rail is a slim icon column with the 5 surfaces. Each surface
// provides its own secondary sidebar slot (session list, vault tree, etc.).
// Surfaces whose card hasn't merged render a .ol-* placeholder pane.

import { useState } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { Icon, type IconName } from "./components/Icon";
import { useUIStore } from "./store";
import { useCockpit } from "./cockpit/store";
import { Cockpit } from "./cockpit/Cockpit";
import { SearchPill, CommandPalette } from "./CommandPalette";
import { parseRoute, type SurfaceName } from "./router";
import { useTheme } from "./theme";
import { useAxisAuth } from "./auth";
import { SessionsView } from "./views/SessionsView";
import { VaultWorkspaceView } from "./views/VaultWorkspaceView";
import { ProjectsView } from "./views/ProjectsView";
import FleetView from "./views/FleetView";
import { DocsView } from "./views/docs/DocsView";
import { SettingsView } from "./views/SettingsView";
import { StatusBar } from "./components/StatusBar";

// ── Helpers ────────────────────────────────────────

// timeAgo moved to views/sessions/helpers.ts (View-owned)

// ── Nav definition ─────────────────────────────────
// The 5 surfaces, in nav order. Matches the plan's table exactly.
const SURFACES: {
  surface: SurfaceName;
  label: string;
  icon: IconName;
  path: string;
}[] = [
  { surface: "sessions", label: "Sessions", icon: "message-square", path: "/" },
  { surface: "vaults", label: "Vaults", icon: "book", path: "/vaults" },
  { surface: "projects", label: "Projects", icon: "folder", path: "/projects" },
  { surface: "fleet", label: "Fleet", icon: "server", path: "/fleet" },
  { surface: "settings", label: "Settings", icon: "gear", path: "/settings" },
  { surface: "docs", label: "Docs", icon: "book", path: "/docs" },
];

// ── Helpers ────────────────────────────────────────

// (timeAgo moved to views/sessions/helpers.ts)

// ── Main shell ─────────────────────────────────────

export function AppShell() {
  const { location } = useRouterState();
  const { surface, sessionId, projectId, page, nodeId } = parseRoute(location.pathname);
  const { sidebarCollapsed, sidebarWidth } = useUIStore();

  return (
    <div className="app">
      <TopBar activeSurface={surface} />
      <div className="body">
        {/* Keep all views mounted; toggle visibility for instant switching.
            Trades RAM for zero re-mount latency on tab change. */}
        <div className={surface === "sessions" ? "" : "view-hidden"}>
          <SessionsView sessionId={sessionId} projectId={projectId} page={page} />
        </div>
        <div className={surface === "vaults" ? "" : "view-hidden"}>
          <VaultWorkspaceView />
        </div>
        <div className={surface === "projects" ? "" : "view-hidden"}>
          <ProjectsView />
        </div>
        <div className={surface === "fleet" ? "" : "view-hidden"}>
          <FleetView nodeId={nodeId} />
        </div>
        <div className={surface === "docs" ? "" : "view-hidden"}>
          <DocsView />
        </div>
        <div className={surface === "settings" ? "" : "view-hidden"}>
          {!sidebarCollapsed && (
            <SecondarySidebar width={sidebarWidth}>
              <PlaceholderSidebar surface={surface} />
            </SecondarySidebar>
          )}
          <div className="viewport">
            <SettingsView />
          </div>
        </div>
      </div>
      <StatusBar />
      {/* Operator cockpit (ADR 0021): floating, persists across every surface
          because it is mounted here at the app root, outside the body switch. */}
      <Cockpit />
      {/* Command palette (⌘K) — search sessions, vaults, nodes. */}
      <CommandPalette />
    </div>
  );
}

// ── TopBar ─────────────────────────────────────────

function TopBar({ activeSurface }: { activeSurface: SurfaceName }) {
  const navigate = useNavigate();
  const { toggleSidebar } = useUIStore();
  const { theme, toggleTheme } = useTheme();
  const { user, organization, organizations, logout } = useAxisAuth();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="topbar">
      <div className="tb-left">
        <Button
          type="button"
          variant="ghost" size="icon-sm"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <Icon name="mountain" size={14} />
        </Button>
        {import.meta.env.VITE_STELLARC_ENV === "dev" && <span className="env-pill">DEV</span>}
        <span className="divider" />
        {/* View selector — icon chips for each surface (concept: topbar .layouts) */}
        <div className="layouts" role="tablist" aria-label="Surfaces">
          {SURFACES.map((s) => (
            <Button
              type="button"
              key={s.surface}
              className={`chip ${activeSurface === s.surface ? "on" : ""}`}
              onClick={() => void navigate({ to: s.path })}
              title={s.label}
              aria-label={s.label}
              aria-current={activeSurface === s.surface ? "page" : undefined}
            >
              <Icon name={s.icon} size={13} />
            </Button>
          ))}
        </div>
      </div>

      <div className="tb-center">
        <SearchPill />
      </div>

      <div className="tb-right">
        {/* Operator cockpit toggle (ADR 0021) — floating terminal workspace. */}
        <CockpitToggle />
        {/* Theme toggle */}
        <Button
          type="button"
          variant="ghost" size="icon-sm"
          onClick={toggleTheme}
          title={theme === "obsidian" ? "Switch to light" : "Switch to dark"}
          aria-label="Toggle theme"
        >
          <Icon name={theme === "obsidian" ? "sun" : "moon"} size={14} />
        </Button>
        <OrgChip />
        <div className="account-menu-wrap">
          <Button
            type="button"
            className="profile"
            title={`Account menu for ${user.username}`}
            aria-label={`Account menu for ${user.username}`}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((open) => !open)}
          >
            {user.username.slice(0, 2).toLowerCase()}
          </Button>
          {accountOpen && (
            <div className="account-menu" role="menu">
              <div className="account-menu-user" role="none">
                <span className="profile" aria-hidden="true">{user.username.slice(0, 2).toLowerCase()}</span>
                <div>
                  <div className="account-menu-name">{user.username}</div>
                  <div className="account-menu-meta">{user.kind}</div>
                </div>
              </div>
              <div className="account-menu-sep" role="separator" />
              <div className="account-menu-item account-menu-muted" role="menuitem" aria-disabled="true">
                <span>Organization</span>
                <strong>{organization.displayName}</strong>
              </div>
              <div className="account-menu-item account-menu-muted" role="menuitem" aria-disabled="true">
                {organizations.length > 1 ? "Use the organization selector in the top bar." : "No other organizations available."}
              </div>
              <Button type="button" className="account-menu-item" role="menuitem" onClick={() => { setAccountOpen(false); void navigate({ to: "/settings" }); }}>
                Settings
              </Button>
              <Button type="button" className="account-menu-item danger" role="menuitem" onClick={() => void logout()}>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CockpitToggle() {
  const { open, toggle } = useCockpit();
  return (
    <Button
      type="button"
      variant="ghost" size="icon-sm" aria-expanded={open}
      onClick={toggle}
      title="Operator cockpit (terminal)"
      aria-label="Toggle operator cockpit"
      aria-pressed={open}
    >
      <Icon name="terminal" size={14} />
    </Button>
  );
}

function OrgChip() {
  const { organization, organizations, selectOrganization } = useAxisAuth();
  return (
    <label className="org" title="Organization">
      <span className="mk" />
      <NativeSelect
        aria-label="Organization"
        value={organization.id}
        onChange={(event) => selectOrganization(event.target.value)}
        style={{ background: "transparent", border: 0, color: "inherit", maxWidth: 180 }}
      >
        {organizations.map((org) => <option key={org.id} value={org.id}>{org.displayName}</option>)}
      </NativeSelect>
    </label>
  );
}

// ── Secondary sidebar wrappers ─────────────────────

function SecondarySidebar({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <aside className="sidebar" style={{ width }}>
        {children}
      </aside>
      <div className="rz-x" />
    </>
  );
}

function PlaceholderSidebar({ surface }: { surface: SurfaceName }) {
  const label = SURFACES.find((s) => s.surface === surface)?.label ?? surface;
  return (
    <div className="sb-scroll">
      <div className="sec-head">
        <span className="lbl">{label.toUpperCase()}</span>
      </div>
      <div className="sec-content">
        <div
          className="empty-state"
          style={{ minHeight: 120, padding: "16px 8px" }}
        >
          <div className="empty-state-msg">Coming soon</div>
        </div>
      </div>
    </div>
  );
}


// ── Session sidebar ────────────────────────────────
// MOVED to views/sessions/components/SessionSidebar.tsx
// (View-owned per the View/Page architecture)
