import { useRouterState } from "@tanstack/react-router";
import { Icon, type IconName } from "./components/Icon";
import { parseRoute, type SurfaceName } from "./router";
import { SessionsView } from "./views/SessionsView";
import { VaultWorkspaceView } from "./views/VaultWorkspaceView";
import { ProjectsView } from "./views/ProjectsView";
import FleetView from "./views/FleetView";
import { DocsView } from "./views/docs/DocsView";
import { SettingsView } from "./views/SettingsView";

import { useNavigate } from "@tanstack/react-router";

/**
 * MobileAppShell — bottom-tab navigation + single-column stack.
 *
 * Mobile uses a fundamentally different navigation model:
 * - Bottom tab bar (not left icon rail)
 * - Full-screen views (not sidebar + viewport split)
 * - Sessions: list → detail stack (not side-by-side)
 * - No Cockpit/CommandPalette (desktop-only)
 *
 * All views and data hooks are shared with desktop. Only layout differs.
 */
const TABS: { surface: SurfaceName; label: string; icon: IconName; path: string }[] = [
  { surface: "sessions", label: "Chat", icon: "message-square", path: "/" },
  { surface: "vaults", label: "Vaults", icon: "book", path: "/vaults" },
  { surface: "projects", label: "Projects", icon: "folder", path: "/projects" },
  { surface: "fleet", label: "Fleet", icon: "server", path: "/fleet" },
  { surface: "settings", label: "Settings", icon: "gear", path: "/settings" },
];

export function MobileAppShell() {
  const { location } = useRouterState();
  const { surface, sessionId, projectId, page, nodeId } = parseRoute(location.pathname);

  return (
    <div className="app app-mobile">
      <div className="mobile-content">
        {surface === "sessions" && (
          <SessionsView sessionId={sessionId} projectId={projectId} page={page} />
        )}
        {surface === "vaults" && <VaultWorkspaceView />}
        {surface === "projects" && <ProjectsView />}
        {surface === "fleet" && <FleetView nodeId={nodeId} />}
        {surface === "docs" && <DocsView />}
        {surface === "settings" && <SettingsView />}
      </div>
      <MobileTabBar activeSurface={surface} />
    </div>
  );
}

function MobileTabBar({ activeSurface }: { activeSurface: SurfaceName }) {
  const navigate = useNavigate();
  return (
    <nav className="mobile-tabbar" role="tablist">
      {TABS.map((tab) => {
        const active = activeSurface === tab.surface;
        return (
          <button
            key={tab.surface}
            role="tab"
            aria-selected={active}
            className={`mobile-tab ${active ? "mobile-tab-active" : ""}`}
            onClick={() => navigate({ to: tab.path })}
          >
            <Icon name={tab.icon} size={20} />
            <span className="mobile-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
