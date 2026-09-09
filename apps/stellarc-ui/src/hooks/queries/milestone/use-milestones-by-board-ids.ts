import { useQueries } from "@tanstack/react-query";
import type { TimelineMilestone } from "@/components/board/boards-timeline";
import getMilestonesByBoard from "@/fetchers/milestone/get-milestones-by-board";

/**
 * Milestones for many boards at once, keyed by board id.
 *
 * Milestones are only exposed by a board-scoped endpoint, so the boards overview
 * needs one request per board. `useQueries` keeps that legal (a single hook call
 * regardless of board count) instead of calling a hook inside a loop, and each
 * entry still gets its own cache key so the board Gantt shares the cache.
 *
 * No `useMemo`: `useQueries` returns a fresh array every render, so any memo
 * keyed on it would never hold, and faking stability with a joined-string key
 * only hides that. The mapping below is a cheap O(boards × milestones) pass and
 * `BoardsTimeline` reads the result during render rather than in an effect, so a
 * new object identity costs nothing.
 */
export function useMilestonesByBoardIds(boardIds: string[]) {
  const results = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: ["milestones", boardId],
      queryFn: () => getMilestonesByBoard({ boardId }),
      // The overview is a read-only glance; refetching on every window focus
      // would fire one request per board for data that rarely changes.
      staleTime: 60_000,
    })),
  });

  const byBoardId: Record<string, TimelineMilestone[]> = {};
  boardIds.forEach((boardId, index) => {
    const rows = results[index]?.data;
    if (!rows) return;
    byBoardId[boardId] = rows.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      status: milestone.status,
      dueDate: milestone.dueDate,
    }));
  });
  return byBoardId;
}

export default useMilestonesByBoardIds;
