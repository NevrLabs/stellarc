import { usePlatform } from "@/hooks/usePlatform";
import { AppShell as DesktopAppShell } from "./AppShell";
import { MobileAppShell } from "./MobileAppShell";

/**
 * Shell router: branches between desktop and mobile layout.
 * Determined by VITE_PLATFORM (build-time) or viewport width (runtime).
 * The non-active variant is tree-shaken in native builds.
 */
export function AppShellRouter() {
  const platform = usePlatform();
  return platform === "desktop" ? <DesktopAppShell /> : <MobileAppShell />;
}
