import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  type BoardView,
  boardViewFromPathname,
  type RepoView,
  repoViewFromPathname,
} from "@/lib/board-view";
import { useUserPreferencesStore } from "@/store/user-preferences";

/**
 * Records the board/repo view the user is currently in so that returning to a
 * board or repo lands on the last view they used, instead of always the
 * default. Persisted via the user-preferences store (localStorage).
 */
export function useRememberCurrentView() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setLastBoardView = useUserPreferencesStore((s) => s.setLastBoardView);
  const setLastRepoView = useUserPreferencesStore((s) => s.setLastRepoView);

  useEffect(() => {
    const boardView = boardViewFromPathname(pathname);
    if (boardView) {
      setLastBoardView(boardView);
      return;
    }
    const repoView = repoViewFromPathname(pathname);
    if (repoView) setLastRepoView(repoView);
  }, [pathname, setLastBoardView, setLastRepoView]);
}

/** The view a board link should point at: current view, else last remembered. */
export function useTargetBoardView(): BoardView {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastBoardView = useUserPreferencesStore((s) => s.lastBoardView);
  return boardViewFromPathname(pathname) ?? lastBoardView;
}

/** The view a repo link should point at: current view, else last remembered. */
export function useTargetRepoView(): RepoView {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastRepoView = useUserPreferencesStore((s) => s.lastRepoView);
  return repoViewFromPathname(pathname) ?? lastRepoView;
}
