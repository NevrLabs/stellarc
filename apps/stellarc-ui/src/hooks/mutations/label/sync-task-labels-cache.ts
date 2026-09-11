import type { QueryClient } from "@tanstack/react-query";
import type { BoardWithTasks } from "@/types/board";
import type Task from "@/types/task";

type TaskLabel = NonNullable<Task["labels"]>[number];
type TaskLabelsUpdater = (labels: TaskLabel[]) => TaskLabel[];

function updateTaskLabels(
  task: Task,
  taskId: string,
  updater: TaskLabelsUpdater,
): Task {
  if (task.id !== taskId) {
    return task;
  }

  return {
    ...task,
    labels: updater(task.labels ?? []),
  };
}

export function updateTaskLabelsInBoard(
  board: BoardWithTasks,
  taskId: string,
  updater: TaskLabelsUpdater,
): BoardWithTasks {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      tasks: column.tasks.map((task) =>
        updateTaskLabels(task, taskId, updater),
      ),
    })),
    plannedTasks: board.plannedTasks.map((task) =>
      updateTaskLabels(task, taskId, updater),
    ),
    archivedTasks: board.archivedTasks.map((task) =>
      updateTaskLabels(task, taskId, updater),
    ),
  };
}

export function syncTaskLabelsInTasksCache(
  queryClient: QueryClient,
  taskId: string,
  updater: TaskLabelsUpdater,
) {
  queryClient.setQueriesData<BoardWithTasks | undefined>(
    {
      queryKey: ["tasks"],
    },
    (existingBoard) =>
      existingBoard
        ? updateTaskLabelsInBoard(existingBoard, taskId, updater)
        : existingBoard,
  );
}

export function addLabelToTaskInTasksCache(
  queryClient: QueryClient,
  taskId: string,
  label: TaskLabel,
) {
  syncTaskLabelsInTasksCache(queryClient, taskId, (existingLabels) => {
    const alreadyExists = existingLabels.some(
      (existingLabel) => existingLabel.id === label.id,
    );

    return alreadyExists ? existingLabels : [...existingLabels, label];
  });
}

export function removeLabelFromTaskInTasksCache(
  queryClient: QueryClient,
  taskId: string,
  labelId: string,
) {
  syncTaskLabelsInTasksCache(queryClient, taskId, (existingLabels) =>
    existingLabels.filter((label) => label.id !== labelId),
  );
}
