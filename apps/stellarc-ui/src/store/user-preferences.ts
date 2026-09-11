import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BoardView, RepoView } from "@/lib/board-view";

export const WEEK_START_DAYS = [0, 1, 6] as const;
export type WeekStartDay = (typeof WEEK_START_DAYS)[number];

export function isWeekStartDay(value: number): value is WeekStartDay {
  return WEEK_START_DAYS.some((day) => day === value);
}

type UserPreferencesStore = {
  theme: "light" | "dark" | "system";
  setTheme: (
    theme: "light" | "dark" | "system",
    coordinates?: { x: number; y: number },
  ) => void;

  viewMode: "board" | "list";
  setViewMode: (mode: "board" | "list") => void;

  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;

  /**
   * #125: drops the backdrop blur behind modals, sheets and command dialogs.
   * The blur is expensive to composite on large viewports and several users
   * find it visually noisy, so it is opt-out rather than removed outright.
   */
  reduceOverlayBlur: boolean;
  setReduceOverlayBlur: (reduce: boolean) => void;

  showTaskNumbers: boolean;
  setShowTaskNumbers: (show: boolean) => void;
  toggleTaskNumbers: () => void;
  showAssignees: boolean;
  setShowAssignees: (show: boolean) => void;
  toggleAssignees: () => void;
  showDueDates: boolean;
  setShowDueDates: (show: boolean) => void;
  toggleDueDates: () => void;
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
  toggleLabels: () => void;
  showPriority: boolean;
  setShowPriority: (show: boolean) => void;
  togglePriority: () => void;
  resetDisplayPreferences: () => void;

  sidebarDefaultOpen: boolean;
  setSidebarDefaultOpen: (open: boolean) => void;

  /** Resizable sidebar width in px; null = use the CSS default. */
  sidebarWidth: number | null;
  setSidebarWidth: (width: number | null) => void;

  hiddenBoardIds: string[];
  setBoardSidebarVisibility: (
    userId: string,
    boardId: string,
    visible: boolean,
  ) => void;
  hiddenRepoIds: string[];
  setRepoSidebarVisibility: (
    userId: string,
    repoId: string,
    visible: boolean,
  ) => void;
  boardSidebarOrders: Record<string, string[]>;
  setBoardSidebarOrder: (userId: string, ids: string[]) => void;
  repoSidebarOrders: Record<string, string[]>;
  setRepoSidebarOrder: (userId: string, ids: string[]) => void;

  weekStartsOn: WeekStartDay;
  setWeekStartsOn: (weekStartsOn: WeekStartDay) => void;

  /** Last view visited per resource type, so returning lands where you left. */
  lastBoardView: BoardView;
  setLastBoardView: (view: BoardView) => void;
  lastRepoView: RepoView;
  setLastRepoView: (view: RepoView) => void;
};

export const useUserPreferencesStore = create<UserPreferencesStore>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (
        theme: "light" | "dark" | "system",
        coordinates?: { x: number; y: number },
      ) => {
        if (coordinates) {
          document.documentElement.style.setProperty(
            "--x",
            `${coordinates.x}%`,
          );
          document.documentElement.style.setProperty(
            "--y",
            `${coordinates.y}%`,
          );
        } else {
          document.documentElement.style.removeProperty("--x");
          document.documentElement.style.removeProperty("--y");
        }

        if ("startViewTransition" in document) {
          document.startViewTransition(() => {
            set({ theme });
          });
        } else {
          set({ theme });
        }
      },

      viewMode: "board",
      setViewMode: (mode) => set({ viewMode: mode }),

      compactMode: false,
      setCompactMode: (compact) => set({ compactMode: compact }),

      reduceOverlayBlur: false,
      setReduceOverlayBlur: (reduce) => set({ reduceOverlayBlur: reduce }),

      showTaskNumbers: true,
      setShowTaskNumbers: (show) => set({ showTaskNumbers: show }),
      toggleTaskNumbers: () =>
        set((state) => ({ showTaskNumbers: !state.showTaskNumbers })),
      showAssignees: true,
      setShowAssignees: (show) => set({ showAssignees: show }),
      toggleAssignees: () =>
        set((state) => ({ showAssignees: !state.showAssignees })),
      showDueDates: true,
      setShowDueDates: (show) => set({ showDueDates: show }),
      toggleDueDates: () =>
        set((state) => ({ showDueDates: !state.showDueDates })),
      showLabels: true,
      setShowLabels: (show) => set({ showLabels: show }),
      toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
      showPriority: true,
      setShowPriority: (show) => set({ showPriority: show }),
      togglePriority: () =>
        set((state) => ({ showPriority: !state.showPriority })),
      resetDisplayPreferences: () =>
        set({
          showAssignees: true,
          showDueDates: true,
          showLabels: true,
          showTaskNumbers: true,
          showPriority: true,
        }),

      sidebarDefaultOpen: true,
      setSidebarDefaultOpen: (open) => set({ sidebarDefaultOpen: open }),

      /*
        Resizable sidebar width in px. null = never resized, use the CSS
        default; consumers must clamp against the current viewport on read
        (lib/sidebar-width) because a width saved on an ultrawide is not valid
        on a laptop.
      */
      sidebarWidth: null,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),

      hiddenBoardIds: [],
      setBoardSidebarVisibility: (userId, boardId, visible) =>
        set((state) => {
          const key = `${userId}:${boardId}`;
          return {
            hiddenBoardIds: visible
              ? state.hiddenBoardIds.filter((id) => id !== key)
              : Array.from(new Set([...state.hiddenBoardIds, key])),
          };
        }),
      hiddenRepoIds: [],
      setRepoSidebarVisibility: (userId, repoId, visible) =>
        set((state) => {
          const key = `${userId}:${repoId}`;
          return {
            hiddenRepoIds: visible
              ? state.hiddenRepoIds.filter((id) => id !== key)
              : Array.from(new Set([...state.hiddenRepoIds, key])),
          };
        }),
      boardSidebarOrders: {},
      setBoardSidebarOrder: (userId, ids) =>
        set((state) => ({
          boardSidebarOrders: { ...state.boardSidebarOrders, [userId]: ids },
        })),
      repoSidebarOrders: {},
      setRepoSidebarOrder: (userId, ids) =>
        set((state) => ({
          repoSidebarOrders: { ...state.repoSidebarOrders, [userId]: ids },
        })),

      weekStartsOn: 0,
      setWeekStartsOn: (weekStartsOn) => set({ weekStartsOn }),

      lastBoardView: "board",
      setLastBoardView: (lastBoardView) => set({ lastBoardView }),
      lastRepoView: "issues",
      setLastRepoView: (lastRepoView) => set({ lastRepoView }),
    }),
    {
      name: "user-preferences",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state && !isWeekStartDay(state.weekStartsOn)) {
          state.setWeekStartsOn(0);
        }
      },
    },
  ),
);
