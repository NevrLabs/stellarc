export const BOARD_VIEWS = [
  "board",
  "gantt",
  "calendar",
  "milestones",
  "backlog",
] as const;

export type BoardView = (typeof BOARD_VIEWS)[number];

export const REPO_VIEWS = [
  "issues",
  "pulls",
  "code",
  "releases",
  "packages",
] as const;

export type RepoView = (typeof REPO_VIEWS)[number];

/**
 * The board view segment of a dashboard URL, or null when the path isn't a
 * board view. Used so switching boards keeps the current view.
 */
export function boardViewFromPathname(pathname: string): BoardView | null {
  const match = pathname.match(
    /\/board\/[^/]+\/(board|gantt|calendar|milestones|backlog)(?:\/|$)/,
  );
  return (match?.[1] as BoardView) ?? null;
}

/** The repo view segment of a dashboard URL, or null when not a repo view. */
export function repoViewFromPathname(pathname: string): RepoView | null {
  const match = pathname.match(
    /\/repo\/[^/]+\/(issues|pulls|code|releases|packages)(?:\/|$)/,
  );
  return (match?.[1] as RepoView) ?? null;
}
