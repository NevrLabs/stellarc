import type { QueryClient } from "@tanstack/react-query";
import type { BoardWithTasks } from "@/types/board";

function boardTasks(board: BoardWithTasks) {
  return [
    ...board.columns.flatMap((column) => column.tasks),
    ...board.plannedTasks,
    ...board.archivedTasks,
  ];
}

export function reconcileTaskDetails(
  queryClient: QueryClient,
  previous: BoardWithTasks | undefined,
  current: BoardWithTasks,
) {
  if (!previous) return;
  const previousVersions = new Map(
    boardTasks(previous).map((task) => [task.id, task.detailVersion]),
  );
  for (const task of boardTasks(current)) {
    if (
      previousVersions.has(task.id) &&
      previousVersions.get(task.id) !== task.detailVersion
    ) {
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    }
  }
}
