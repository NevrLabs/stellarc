import {
  addWeeks,
  endOfWeek,
  format,
  isWithinInterval,
  startOfWeek,
} from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { BoardWithTasks } from "@/types/board";
import type Task from "@/types/task";
import { type BoardFilters, DUE_DATE_FILTER_VALUES } from "./use-task-filters";

const DEFAULT_FILTERS: BoardFilters = {
  status: null,
  priority: null,
  assignee: null,
  dueDate: null,
  labels: null,
};

const FILTER_KEYS: Array<keyof BoardFilters> = [
  "status",
  "priority",
  "assignee",
  "dueDate",
  "labels",
];

/**
 * Grouping vocabulary shared by BOTH the board and the list.
 *
 * These used to be two separate sets — the board grouped by
 * assignee/priority/label/dueDate while the list grouped by status/milestone —
 * rendered as two different "Group by" controls. Switching view silently changed
 * which options existed. They are now one list so a view switch preserves the
 * user's choice.
 *
 * APPEND-ONLY: the value is persisted per board in localStorage, so renaming or
 * re-pointing an entry silently changes what a saved preference means.
 */
export const BOARD_GROUP_BY_VALUES = [
  "none",
  "status",
  "assignee",
  "priority",
  "label",
  "dueDate",
  "milestone",
] as const;

export type BoardGroupBy = (typeof BOARD_GROUP_BY_VALUES)[number];

export type TaskGroup = {
  /** Stable identity for the group — the raw value, or "" when unset. */
  key: string;
  /**
   * Either a plain label (assignee name / priority / label name) or an i18n key
   * for the "unset" bucket. Callers translate `labelKey` when present.
   */
  label?: string;
  labelKey?: string;
  tasks: Task[];
};

function groupKeysForTask(task: Task, groupBy: BoardGroupBy): string[] {
  switch (groupBy) {
    case "status":
      return [task.status ?? ""];
    case "assignee":
      return [task.assigneeName ?? ""];
    case "priority":
      return [task.priority ?? ""];
    case "label": {
      const labels = task.labels ?? [];
      return labels.length > 0 ? labels.map((label) => label.name ?? "") : [""];
    }
    case "dueDate":
      return [task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : ""];
    case "milestone":
      return [task.milestoneName ?? ""];
    default:
      return [""];
  }
}

const UNSET_LABEL_KEYS: Record<BoardGroupBy, string> = {
  none: "tasks:groupBy.all",
  status: "tasks:groupBy.noStatus",
  assignee: "tasks:assignee.unassigned",
  priority: "tasks:groupBy.noPriority",
  label: "tasks:groupBy.noLabel",
  dueDate: "tasks:groupBy.noDueDate",
  milestone: "tasks:gantt.noMilestone",
};

/**
 * Buckets a column's tasks for the shared "group by" control. `none` returns a
 * single bucket so callers can render one code path regardless of grouping.
 * A task with several labels appears in each of its label groups.
 *
 * `displayNames` maps a raw key to what the user should see — used for status,
 * where the stored value is a slug (`to-do`) but the UI must show the column's
 * name (`To Do`). Keys with no entry fall back to the raw value.
 */
export function groupTasks(
  tasks: Task[],
  groupBy: BoardGroupBy,
  displayNames?: Record<string, string>,
): TaskGroup[] {
  if (groupBy === "none") {
    return [{ key: "", labelKey: UNSET_LABEL_KEYS.none, tasks }];
  }

  const buckets = new Map<string, Task[]>();

  for (const task of tasks) {
    for (const key of groupKeysForTask(task, groupBy)) {
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(task);
      } else {
        buckets.set(key, [task]);
      }
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => {
      // Unset always sorts last so named groups read first.
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    })
    .map(([key, groupedTasks]) => ({
      key,
      ...(key === ""
        ? { labelKey: UNSET_LABEL_KEYS[groupBy] }
        : {
            label:
              groupBy === "dueDate"
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                  }).format(new Date(`${key}T00:00:00`))
                : (displayNames?.[key] ?? key),
          }),
      tasks: groupedTasks,
    }));
}

function normalizeGroupBy(raw: unknown): BoardGroupBy {
  return BOARD_GROUP_BY_VALUES.includes(raw as BoardGroupBy)
    ? (raw as BoardGroupBy)
    : "none";
}

function normalizeFilters(raw: unknown): BoardFilters {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_FILTERS;
  }

  const candidate = raw as Partial<Record<keyof BoardFilters, unknown>>;
  const normalized = { ...DEFAULT_FILTERS };

  for (const key of FILTER_KEYS) {
    const value = candidate[key];
    if (Array.isArray(value)) {
      const values = value.filter((v): v is string => typeof v === "string");
      normalized[key] = values.length > 0 ? values : null;
    }
  }

  return normalized;
}

export function useTaskFiltersWithLabelsSupport(
  board: BoardWithTasks | null | undefined,
  boardId?: string,
  textQuery?: string,
) {
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const storageKey = boardId ? `kaneo:board-filters:${boardId}` : null;
  const groupByStorageKey = boardId ? `kaneo:board-group-by:${boardId}` : null;
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_FILTERS);
  const [groupBy, setGroupBy] = useState<BoardGroupBy>("none");

  // Same per-board localStorage convention as the filters above.
  useEffect(() => {
    if (!groupByStorageKey || typeof window === "undefined") return;
    setGroupBy(
      normalizeGroupBy(window.localStorage.getItem(groupByStorageKey)),
    );
  }, [groupByStorageKey]);

  useEffect(() => {
    if (!groupByStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(groupByStorageKey, groupBy);
  }, [groupBy, groupByStorageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setFilters(DEFAULT_FILTERS);
        return;
      }

      const parsed = JSON.parse(stored) as unknown;
      setFilters(normalizeFilters(parsed));
    } catch {
      setFilters(DEFAULT_FILTERS);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  }, [filters, storageKey]);

  const filterTasks = useCallback(
    (tasks: Task[]): Task[] => {
      const normalizedTextQuery = textQuery?.trim().toLowerCase();

      return tasks.filter((task) => {
        if (normalizedTextQuery) {
          const title = task.title?.toLowerCase() ?? "";
          const description = task.description?.toLowerCase() ?? "";
          // Match the global search's task-number semantics: a bare number or
          // a hash-prefixed number resolves to that task number.
          const searchedNumber = /^#?(\d+)$/.exec(normalizedTextQuery)?.[1];
          const matchesText =
            title.includes(normalizedTextQuery) ||
            description.includes(normalizedTextQuery) ||
            (searchedNumber !== undefined &&
              task.number === Number(searchedNumber));

          if (!matchesText) {
            return false;
          }
        }

        if (
          filters.status &&
          filters.status.length > 0 &&
          !filters.status.includes(task.status)
        ) {
          return false;
        }

        if (
          filters.priority &&
          filters.priority.length > 0 &&
          !filters.priority.includes(task.priority ?? "")
        ) {
          return false;
        }

        if (
          filters.assignee &&
          filters.assignee.length > 0 &&
          !filters.assignee.includes(task.userId ?? "")
        ) {
          return false;
        }

        if (filters.dueDate && filters.dueDate.length > 0) {
          const today = new Date();
          const taskDate = task.dueDate ? new Date(task.dueDate) : null;

          const matchesAnyDueDate = filters.dueDate.some((dueDateFilter) => {
            if (dueDateFilter === DUE_DATE_FILTER_VALUES.noDueDate) {
              return !task.dueDate;
            }

            if (!taskDate) {
              return false;
            }

            switch (dueDateFilter) {
              case DUE_DATE_FILTER_VALUES.dueThisWeek: {
                const weekStart = startOfWeek(today, { weekStartsOn });
                const weekEnd = endOfWeek(today, { weekStartsOn });
                return isWithinInterval(taskDate, {
                  start: weekStart,
                  end: weekEnd,
                });
              }
              case DUE_DATE_FILTER_VALUES.dueNextWeek: {
                const nextWeekStart = startOfWeek(addWeeks(today, 1), {
                  weekStartsOn,
                });
                const nextWeekEnd = endOfWeek(addWeeks(today, 1), {
                  weekStartsOn,
                });
                return isWithinInterval(taskDate, {
                  start: nextWeekStart,
                  end: nextWeekEnd,
                });
              }
              default:
                return false;
            }
          });

          if (!matchesAnyDueDate) {
            return false;
          }
        }

        // Label filtering
        if (filters.labels && filters.labels.length > 0) {
          const taskLabelIds = (task.labels ?? []).map((label) => label.id);

          // Check if task has at least one of the selected labels
          const hasMatchingLabel = filters.labels.some((labelId) =>
            taskLabelIds.includes(labelId),
          );

          if (!hasMatchingLabel) {
            return false;
          }
        }

        return true;
      });
    },
    [filters, textQuery, weekStartsOn],
  );

  const filteredBoard = useMemo(() => {
    if (!board) return null;

    return {
      ...board,
      plannedTasks: filterTasks(board.plannedTasks ?? []),
      archivedTasks: filterTasks(board.archivedTasks ?? []),
      columns:
        board.columns?.map((column) => ({
          ...column,
          tasks: filterTasks(column.tasks),
        })) ?? [],
    };
  }, [board, filterTasks]);

  const hasActiveFilters = Object.values(filters).some((filter) =>
    Array.isArray(filter) ? filter.length > 0 : filter !== null,
  );

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const updateFilter = (
    key: keyof BoardFilters,
    value: BoardFilters[keyof BoardFilters],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateLabelFilter = (labelId: string) => {
    setFilters((prev) => {
      const currentLabels = prev.labels || [];
      const isSelected = currentLabels.includes(labelId);

      let newLabels: string[] | null;
      if (isSelected) {
        newLabels = currentLabels.filter((id) => id !== labelId);
        if (newLabels.length === 0) newLabels = null;
      } else {
        newLabels = [...currentLabels, labelId];
      }

      return { ...prev, labels: newLabels };
    });
  };

  return {
    filters,
    setFilters,
    updateFilter,
    updateLabelFilter,
    filteredBoard,
    hasActiveFilters,
    clearFilters,
    groupBy,
    setGroupBy,
  };
}
