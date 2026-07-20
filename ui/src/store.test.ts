import { describe, it, expect, beforeEach } from "vitest";
import { nextSidebarMode, parseSidebarMode, useUIStore } from "./store";

describe("useUIStore", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset to defaults before each test
    useUIStore.setState({
      view: "sessions",
      activeSessionId: null,
      desktopSidebarMode: "full",
      phoneViewport: false,
      mobileSidebarOpen: false,
      bottomCollapsed: true,
      rightSidebarCollapsed: false,
      bottomTab: "events",
      rightTab: "info",
      paletteOpen: false,
      sidebarWidth: 220,
    });
  });

  it("starts with default values", () => {
    const state = useUIStore.getState();
    expect(state.view).toBe("sessions");
    expect(state.activeSessionId).toBeNull();
    expect(state.desktopSidebarMode).toBe("full");
    expect(state.bottomCollapsed).toBe(true);
  });

  it("cycles the desktop sidebar through full, compact, hidden, and full", () => {
    expect(nextSidebarMode("full", false)).toBe("compact");
    expect(nextSidebarMode("compact", false)).toBe("hidden");
    expect(nextSidebarMode("hidden", false)).toBe("full");

    useUIStore.getState().setSidebarWidth(275);
    useUIStore.getState().cycleSidebarMode();
    expect(useUIStore.getState().desktopSidebarMode).toBe("compact");
    expect(localStorage.getItem("olympus-ui:sidebar-mode:v1")).toBe("compact");
    useUIStore.getState().cycleSidebarMode();
    expect(useUIStore.getState().desktopSidebarMode).toBe("hidden");
    useUIStore.getState().cycleSidebarMode();
    expect(useUIStore.getState().desktopSidebarMode).toBe("full");
    expect(useUIStore.getState().sidebarWidth).toBe(275);
  });

  it("keeps phone sidebars binary instead of entering compact mode", () => {
    expect(nextSidebarMode("hidden", true)).toBe("full");
    expect(nextSidebarMode("full", true)).toBe("hidden");
    expect(nextSidebarMode("compact", true)).toBe("hidden");
  });

  it("fails closed to full for unknown persisted modes", () => {
    expect(parseSidebarMode("compact")).toBe("compact");
    expect(parseSidebarMode("minimized-v1")).toBe("full");
    expect(parseSidebarMode(null)).toBe("full");
  });

  it("keeps phone drawer state ephemeral and restores the desktop preference", () => {
    localStorage.setItem("olympus-ui:sidebar-mode:v1", "compact");
    useUIStore.setState({ desktopSidebarMode: "compact" });
    useUIStore.getState().setPhoneViewport(true);
    useUIStore.getState().cycleSidebarMode();

    expect(useUIStore.getState().mobileSidebarOpen).toBe(true);
    expect(useUIStore.getState().desktopSidebarMode).toBe("compact");

    useUIStore.getState().closeSidebarOnPhone();

    expect(useUIStore.getState().mobileSidebarOpen).toBe(false);
    expect(useUIStore.getState().desktopSidebarMode).toBe("compact");
    expect(localStorage.getItem("olympus-ui:sidebar-mode:v1")).toBe("compact");
    useUIStore.getState().setPhoneViewport(false);
    expect(useUIStore.getState().desktopSidebarMode).toBe("compact");
  });

  it("toggles bottom panel", () => {
    expect(useUIStore.getState().bottomCollapsed).toBe(true);
    useUIStore.getState().toggleBottom();
    expect(useUIStore.getState().bottomCollapsed).toBe(false);
  });

  it("sets active session", () => {
    useUIStore.getState().setActiveSession("sess-123");
    expect(useUIStore.getState().activeSessionId).toBe("sess-123");
  });

  it("clamps sidebar width to [160, 380]", () => {
    useUIStore.getState().setSidebarWidth(100);
    expect(useUIStore.getState().sidebarWidth).toBe(160);
    useUIStore.getState().setSidebarWidth(500);
    expect(useUIStore.getState().sidebarWidth).toBe(380);
    useUIStore.getState().setSidebarWidth(250);
    expect(useUIStore.getState().sidebarWidth).toBe(250);
  });

  it("sets bottom tab", () => {
    useUIStore.getState().setBottomTab("logs");
    expect(useUIStore.getState().bottomTab).toBe("logs");
  });

  it("sets right sidebar tab", () => {
    useUIStore.getState().setRightTab("artifacts");
    expect(useUIStore.getState().rightTab).toBe("artifacts");
  });

  it("opens and closes command palette", () => {
    useUIStore.getState().setPaletteOpen(true);
    expect(useUIStore.getState().paletteOpen).toBe(true);
    useUIStore.getState().setPaletteOpen(false);
    expect(useUIStore.getState().paletteOpen).toBe(false);
  });
});
