// AppShell — the Olympus application frame.
//
// Layout (matches docs/design/concept/olympus-app-concept.html):
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

import { useEffect } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { Icon, type IconName } from "./components/Icon";
import { nextSidebarMode, useSidebarMode, useUIStore, type SidebarMode } from "./store";
import { useCockpit } from "./cockpit/store";
import { Cockpit } from "./cockpit/Cockpit";
import { SearchPill, CommandPalette } from "./CommandPalette";
import { parseRoute, type SurfaceName } from "./router";
import { useTheme } from "./theme";
import { useHallAuth } from "./auth";
import { isDevelopmentEnvironment } from "./environment";
import { SessionsView } from "./views/SessionsView";
import { VaultWorkspaceView } from "./views/VaultWorkspaceView";
import { ProjectsView } from "./views/ProjectsView";
import FleetView from "./views/FleetView";
import { SettingsView } from "./views/SettingsView";

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
];

// ── Helpers ────────────────────────────────────────

// (timeAgo moved to views/sessions/helpers.ts)

// ── Main shell ─────────────────────────────────────

export function AppShell() {
  const { location } = useRouterState();
  const { surface, sessionId, projectId, page, nodeId } = parseRoute(location.pathname);
  const sidebarMode = useSidebarMode();
  const { sidebarWidth, phoneViewport, setPhoneViewport, closeSidebarOnPhone } = useUIStore();
  const mobileSidebarOpen = phoneViewport && sidebarMode === "full";

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 820px)");
    const syncViewport = (event: MediaQueryListEvent | MediaQueryList) => {
      setPhoneViewport(event.matches);
    };
    syncViewport(phone);
    phone.addEventListener("change", syncViewport);
    return () => phone.removeEventListener("change", syncViewport);
  }, [setPhoneViewport]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const app = document.querySelector<HTMLElement>(".app");
    const body = document.querySelector<HTMLElement>(".body");
    const sidebar = document.querySelector<HTMLElement>("#primary-sidebar");
    if (!app || !body || !sidebar) return;

    const inerted: HTMLElement[] = [];
    const makeInert = (element: Element) => {
      if (!(element instanceof HTMLElement) || element.hasAttribute("inert")) return;
      element.setAttribute("inert", "");
      inerted.push(element);
    };
    for (const child of app.children) {
      if (child !== body) makeInert(child);
    }
    for (const child of body.children) {
      if (child !== sidebar && !child.classList.contains("sidebar-scrim")) makeInert(child);
    }
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");

    const focusable = () => Array.from(sidebar.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )).filter((element) => element.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => {
      focusable()[0]?.focus();
    });
    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSidebarOnPhone();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", containFocus);
      for (const element of inerted) element.removeAttribute("inert");
      sidebar.removeAttribute("role");
      sidebar.removeAttribute("aria-modal");
      document.querySelector<HTMLElement>("[data-sidebar-cycle]")?.focus();
    };
  }, [closeSidebarOnPhone, location.pathname, mobileSidebarOpen]);

  useEffect(() => {
    if (phoneViewport) closeSidebarOnPhone();
  }, [closeSidebarOnPhone, location.pathname, phoneViewport]);

  return (
    <div className="app">
      <TopBar activeSurface={surface} />
      <div className="body" data-sidebar-mode={sidebarMode}>
        {mobileSidebarOpen && (
          <div
            className="sidebar-scrim"
            aria-hidden="true"
            onClick={closeSidebarOnPhone}
          />
        )}
        {/* Sessions View owns its own sidebar + viewport layout */}
        {surface === "sessions" && (
          <SessionsView sessionId={sessionId} projectId={projectId} page={page} />
        )}

        {/* Vaults View owns its own sidebar + viewport layout */}
        {surface === "vaults" && (
          <VaultWorkspaceView />
        )}

        {surface === "projects" && <ProjectsView />}

        {surface === "fleet" && <FleetView nodeId={nodeId} />}

        {/* Other surfaces keep the shell-level sidebar + viewport split */}
        {sidebarMode !== "hidden" && surface === "settings" && (
          <SecondarySidebar width={sidebarWidth} mode={sidebarMode}>
            <PlaceholderSidebar surface={surface} />
          </SecondarySidebar>
        )}

        {/* Viewport for shell-managed surfaces (projects, settings) */}
        {surface === "settings" ? (
          <div className="viewport">
            <SettingsView />
          </div>
        ) : null}
      </div>
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
  const sidebarMode = useSidebarMode();
  const { phoneViewport, cycleSidebarMode } = useUIStore();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useHallAuth();
  const nextMode = nextSidebarMode(sidebarMode, phoneViewport);
  const developmentEnvironment = isDevelopmentEnvironment(import.meta.env.VITE_OLYMPUS_ENV);

  return (
    <div className="topbar">
      <div className="tb-left">
        <button
          type="button"
          className="icobtn"
          data-sidebar-cycle
          onClick={cycleSidebarMode}
          aria-controls="primary-sidebar"
          title={`Sidebar is ${sidebarMode}; switch to ${nextMode}`}
          aria-label={`Sidebar is ${sidebarMode}; switch to ${nextMode}`}
        >
          <Icon name="mountain" size={14} />
        </button>
        {developmentEnvironment && (
          <span className="env-pill" title="Development environment · dev branch">
            dev
          </span>
        )}
        <span className="divider" />
        {/* View selector — icon chips for each surface (concept: topbar .layouts) */}
        <div className="layouts" role="tablist" aria-label="Surfaces">
          {SURFACES.map((s) => (
            <button
              type="button"
              key={s.surface}
              className={`chip ${activeSurface === s.surface ? "on" : ""}`}
              onClick={() => void navigate({ to: s.path })}
              title={s.label}
              aria-label={s.label}
              aria-current={activeSurface === s.surface ? "page" : undefined}
            >
              <Icon name={s.icon} size={13} />
            </button>
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
        <button
          type="button"
          className="icobtn"
          onClick={toggleTheme}
          title={theme === "obsidian" ? "Switch to light" : "Switch to dark"}
          aria-label="Toggle theme"
        >
          <Icon name={theme === "obsidian" ? "sun" : "moon"} size={14} />
        </button>
        <OrgChip />
        <button className="profile" title={`Sign out ${user.username}`} onClick={() => void logout()}>
          {user.username.slice(0, 2).toLowerCase()}
        </button>
      </div>
    </div>
  );
}

function CockpitToggle() {
  const { open, toggle } = useCockpit();
  return (
    <button
      type="button"
      className={`icobtn ${open ? "on" : ""}`}
      onClick={toggle}
      title="Operator cockpit (terminal)"
      aria-label="Toggle operator cockpit"
      aria-pressed={open}
    >
      <Icon name="terminal" size={14} />
    </button>
  );
}

function OrgChip() {
  const { organization, organizations, selectOrganization } = useHallAuth();
  return (
    <label className="org" title="Organization">
      <span className="mk" />
      <select
        aria-label="Organization"
        value={organization.id}
        onChange={(event) => selectOrganization(event.target.value)}
        style={{ background: "transparent", border: 0, color: "inherit", maxWidth: 180 }}
      >
        {organizations.map((org) => <option key={org.id} value={org.id}>{org.displayName}</option>)}
      </select>
    </label>
  );
}

// ── Secondary sidebar wrappers ─────────────────────

function SecondarySidebar({
  width,
  mode,
  children,
}: {
  width: number;
  mode: SidebarMode;
  children: React.ReactNode;
}) {
  return (
    <>
      <aside
        id="primary-sidebar"
        className={`sidebar${mode === "compact" ? " compact" : ""}`}
        style={{ width: mode === "compact" ? "var(--sidebar-compact-w)" : width }}
        aria-label="Settings sidebar"
      >
        {children}
      </aside>
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
        <span className="sidebar-compact-placeholder" title={label}>
          <Icon name="gear" size={14} />
        </span>
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
