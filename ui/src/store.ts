import { create } from "zustand";

export type ViewName =
  | "sessions"
  | "vaults"
  | "projects"
  | "fleet"
  | "settings";

export type SidebarMode = "full" | "compact" | "hidden";

const SIDEBAR_MODE_KEY = "olympus-ui:sidebar-mode:v1";

interface UIState {
  /** Active layout view (which pane is shown in the viewport). */
  view: ViewName;
  /** Active session id (for the chat view). */
  activeSessionId: string | null;
  /** Persisted desktop preference. Mobile drawer state is intentionally separate. */
  desktopSidebarMode: SidebarMode;
  phoneViewport: boolean;
  mobileSidebarOpen: boolean;
  /** Bottom panel collapsed. */
  bottomCollapsed: boolean;
  /** Right sidebar collapsed. */
  rightSidebarCollapsed: boolean;
  /** Bottom panel active tab. */
  bottomTab: "events" | "logs" | "raw";
  /** Right sidebar active tab. */
  rightTab: "info" | "artifacts";
  /** Command palette open. */
  paletteOpen: boolean;
  /** Sidebar width (px). */
  sidebarWidth: number;

  setView: (v: ViewName) => void;
  setActiveSession: (id: string | null) => void;
  setDesktopSidebarMode: (mode: SidebarMode) => void;
  setPhoneViewport: (phone: boolean) => void;
  cycleSidebarMode: () => void;
  closeSidebarOnPhone: () => void;
  toggleBottom: () => void;
  toggleRightSidebar: () => void;
  setBottomTab: (t: "events" | "logs" | "raw") => void;
  setRightTab: (t: "info" | "artifacts") => void;
  setPaletteOpen: (open: boolean) => void;
  setSidebarWidth: (w: number) => void;
}

/** True on phone-width screens where the sidebar renders as a fixed drawer. */
function isPhoneViewport(): boolean {
  try {
    return window.matchMedia("(max-width: 820px)").matches;
  } catch {
    return false; // jsdom / SSR
  }
}

function storedSidebarMode(): SidebarMode {
  try {
    return parseSidebarMode(localStorage.getItem(SIDEBAR_MODE_KEY));
  } catch {
    return "full";
  }
}

export function parseSidebarMode(value: string | null): SidebarMode {
  return value === "full" || value === "compact" || value === "hidden"
    ? value
    : "full";
}

function persistDesktopSidebarMode(mode: SidebarMode) {
  if (isPhoneViewport()) return;
  try {
    localStorage.setItem(SIDEBAR_MODE_KEY, mode);
  } catch {
    // Browser storage is a convenience, never a render prerequisite.
  }
}

export function nextSidebarMode(mode: SidebarMode, phone = isPhoneViewport()): SidebarMode {
  if (phone) return mode === "hidden" ? "full" : "hidden";
  if (mode === "full") return "compact";
  if (mode === "compact") return "hidden";
  return "full";
}

export const useUIStore = create<UIState>((set) => ({
  view: "sessions",
  activeSessionId: null,
  desktopSidebarMode: storedSidebarMode(),
  phoneViewport: isPhoneViewport(),
  mobileSidebarOpen: false,
  bottomCollapsed: true,
  rightSidebarCollapsed: false,
  bottomTab: "events",
  rightTab: "info",
  paletteOpen: false,
  sidebarWidth: 220,

  setView: (view) => set({ view }),
  setActiveSession: (activeSessionId) => set({ activeSessionId }),
  setDesktopSidebarMode: (desktopSidebarMode) => {
    persistDesktopSidebarMode(desktopSidebarMode);
    set({ desktopSidebarMode });
  },
  setPhoneViewport: (phoneViewport) => set({
    phoneViewport,
    ...(phoneViewport ? { mobileSidebarOpen: false } : {}),
  }),
  cycleSidebarMode: () => set((state) => {
    if (state.phoneViewport) {
      return { mobileSidebarOpen: !state.mobileSidebarOpen };
    }
    const desktopSidebarMode = nextSidebarMode(state.desktopSidebarMode, false);
    persistDesktopSidebarMode(desktopSidebarMode);
    return { desktopSidebarMode };
  }),
  closeSidebarOnPhone: () => {
    set((state) => state.phoneViewport ? { mobileSidebarOpen: false } : {});
  },
  toggleBottom: () => set((s) => ({ bottomCollapsed: !s.bottomCollapsed })),
  toggleRightSidebar: () =>
    set((s) => ({ rightSidebarCollapsed: !s.rightSidebarCollapsed })),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setRightTab: (rightTab) => set({ rightTab }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSidebarWidth: (sidebarWidth) =>
    set({ sidebarWidth: Math.max(160, Math.min(380, sidebarWidth)) }),
}));

export function useSidebarMode(): SidebarMode {
  return useUIStore((state) => state.phoneViewport
    ? (state.mobileSidebarOpen ? "full" : "hidden")
    : state.desktopSidebarMode);
}
