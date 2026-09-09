import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import RepoLabelList from "@/components/repo/repo-label-list";
import RepoStateBadge, {
  type RepoStateBadgeState,
} from "@/components/repo/repo-state-badge";
import { cn } from "@/lib/cn";
import type { RepoLabel } from "@/types/repo";

type RepoListRowProps = {
  /** Kind glyph (issue dot / pull request arrows). */
  icon: ReactNode;
  title: string;
  number: number;
  state: RepoStateBadgeState;
  labels: RepoLabel[];
  /** Author, date, comment count — appended after #number on row 2. */
  meta?: ReactNode;
  /**
   * Right-aligned content on row 2, under the labels (pull request diff delta).
   * Optional so the issue list keeps its existing two-line shape.
   */
  trailing?: ReactNode;
  to: string;
  params: Record<string, string>;
  /**
   * Search params to carry across the navigation. The list's own filter lives
   * in the URL, so a row that omits it resets the filter on click: opening a
   * closed issue snapped the list back to "open".
   */
  search?: Record<string, string>;
};

/**
 * One row in the issue or pull request list.
 *
 * Both lists share this component so their formatting cannot drift apart again:
 * the PR list previously wrapped its titles, and the issue list rendered no
 * labels at all despite importing the component for them.
 *
 * Layout is exactly two lines at a fixed height:
 *   row 1 — title (truncates) + labels
 *   row 2 — state badge, #number, then meta
 *
 * The fixed height is a LIST concern only. Detail views let titles wrap freely
 * because there is no adjacent row to stay aligned with.
 */
export default function RepoListRow({
  icon,
  title,
  number,
  state,
  labels,
  meta,
  trailing,
  to,
  params,
  search,
}: RepoListRowProps) {
  return (
    <Link
      activeProps={{ className: "bg-muted" }}
      className="flex h-16 items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/60"
      data-slot="repo-list-row"
      params={params}
      search={search}
      to={to}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          {/* Truncates instead of wrapping: a wrapped title would change the row
              height and break alignment with every other row. It yields width to
              the labels rather than pushing them out of view. */}
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium"
            data-slot="repo-list-row-title"
          >
            {title}
          </span>
          {/* Capped so a heavily-labelled item cannot squeeze the title to
              nothing. Overflow clips by design — no +N counter wanted. */}
          <RepoLabelList
            className="max-w-[45%] shrink-0 overflow-hidden"
            labels={labels}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
          <RepoStateBadge state={state} />
          <span data-slot="repo-list-row-number">#{number}</span>
          {meta}
          {trailing && (
            <span className="ml-auto shrink-0 pl-2">{trailing}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Shared glyph sizing so both lists align their leading icons identically. */
export function repoListRowIconClassName(className?: string) {
  return cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground", className);
}
