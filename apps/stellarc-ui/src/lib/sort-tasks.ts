import type Task from "@/types/task";

export type SortField =
  | "position"
  | "createdAt"
  | "priority"
  | "dueDate"
  | "title"
  | "number";

export type SortDirection = "asc" | "desc";

export type SortConfig = {
  field: SortField;
  direction: SortDirection;
};

export type GroupField = "none" | "status" | "priority" | "assignee";

export type DisplayField = "assignee" | "priority" | "labels" | "dates";

export type DisplayConfig = Record<DisplayField, boolean>;

const priorityOrder: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function getPriorityValue(priority: string | null): number {
  if (!priority) return 0;
  return priorityOrder[priority] ?? 0;
}

export function sortTasks(tasks: Task[], config: SortConfig): Task[] {
  if (config.field === "position") return tasks;

  const sorted = [...tasks].sort((a, b) => {
    let comparison = 0;
    switch (config.field) {
      case "priority":
        comparison =
          getPriorityValue(a.priority) - getPriorityValue(b.priority);
        break;
      case "dueDate": {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        if (!a.dueDate && !b.dueDate) comparison = 0;
        else if (!a.dueDate) comparison = 1;
        else if (!b.dueDate) comparison = -1;
        else comparison = aDate - bDate;
        break;
      }
      case "createdAt":
        comparison =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "title":
        comparison = a.title.localeCompare(b.title);
        break;
      case "number":
        comparison = (a.number ?? 0) - (b.number ?? 0);
        break;
    }
    return config.direction === "asc" ? comparison : -comparison;
  });

  return sorted;
}

export type TaskGroup = {
  key: string;
  label: string;
  tasks: Task[];
};

/** Group tasks by a field. "none" returns a single group with all tasks. */
export function groupTasks(
  tasks: Task[],
  field: GroupField,
  labelFn?: (status: string) => string,
): TaskGroup[] {
  if (field === "none") {
    return [{ key: "all", label: "All", tasks }];
  }

  const groups = new Map<string, TaskGroup>();

  for (const task of tasks) {
    let key: string;
    let label: string;
    switch (field) {
      case "status":
        key = task.status;
        label = labelFn ? labelFn(task.status) : task.status;
        break;
      case "priority":
        key = task.priority ?? "none";
        label = task.priority ?? "None";
        break;
      case "assignee":
        key = task.assigneeName ?? "unassigned";
        label = task.assigneeName ?? "Unassigned";
        break;
    }
    if (!groups.has(key)) {
      groups.set(key, { key, label, tasks: [] });
    }
    groups.get(key)?.tasks.push(task);
  }

  // Sort groups: priority by rank, others alphabetically.
  const result = [...groups.values()];
  if (field === "priority") {
    result.sort((a, b) => getPriorityValue(a.key) - getPriorityValue(b.key));
  }
  return result;
}
