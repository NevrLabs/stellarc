import {
  BOARD_GROUP_BY_VALUES,
  type BoardGroupBy,
  groupTasks,
} from "@/hooks/use-task-filters-with-labels-support";
import type { BoardWithTasks } from "@/types/board";
import type Task from "@/types/task";

/**
 * List grouping uses the SAME vocabulary as the board.
 *
 * It used to be a narrower set (`none | status | milestone`) with its own
 * bucketing, rendered from its own "Group by" control. Board and List therefore
 * offered different options under the same label, and switching view silently
 * changed the choice. Both now share `BOARD_GROUP_BY_VALUES` and `groupTasks`,
 * so a view switch preserves grouping.
 */
export const LIST_GROUP_BY_VALUES = BOARD_GROUP_BY_VALUES;
export type ListGroupBy = BoardGroupBy;

export type ListTaskGroup = {
  key: string;
  label: string;
  tasks: Task[];
  /** Status-column metadata, only populated for status groups. */
  column?: BoardWithTasks["columns"][number];
};

export function buildListGroups(
  board: BoardWithTasks,
  groupBy: ListGroupBy,
  /** Resolves i18n keys for the "unset" bucket (No assignee, No label, ...). */
  translate?: (key: string) => string,
): ListTaskGroup[] {
  const tasks = board.columns.flatMap((column) => column.tasks);

  if (groupBy === "none") {
    return [{ key: "all", label: "", tasks }];
  }

  /*
    Status keeps its own path rather than going through groupTasks: the list
    renders status sections from the board's column order and needs the column
    object for the section's icon and drop target. Empty columns must still
    appear so a board with an empty column can be dropped into.
  */
  if (groupBy === "status") {
    return board.columns.map((column) => ({
      key: column.id,
      label: column.name,
      tasks: column.tasks,
      column,
    }));
  }

  return groupTasks(tasks, groupBy).map((group) => ({
    key: group.key,
    label: group.labelKey
      ? (translate?.(group.labelKey) ?? group.labelKey)
      : (group.label ?? ""),
    tasks: group.tasks,
  }));
}

export function taskStatus(
  board: BoardWithTasks,
  task: Task,
): BoardWithTasks["columns"][number] | undefined {
  return board.columns.find(
    (column) => column.id === task.status || column.id === task.columnId,
  );
}

type ListGroupingPreference = Record<string, ListGroupBy>;
const STORAGE_KEY = "kaneo-list-group-by";

export function readListGroupBy(boardId: string): ListGroupBy {
  try {
    const values = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as ListGroupingPreference;
    return LIST_GROUP_BY_VALUES.includes(values[boardId])
      ? values[boardId]
      : "none";
  } catch {
    return "none";
  }
}

export function writeListGroupBy(boardId: string, value: ListGroupBy): void {
  try {
    const values = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as ListGroupingPreference;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...values, [boardId]: value }),
    );
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The
    // current React state still works; persistence is best-effort.
  }
}
