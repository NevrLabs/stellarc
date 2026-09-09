export type MyTaskViewItem = {
  id: string;
  title: string;
  number: number;
  boardId: string;
  boardName: string;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assigneeId: string | null;
  assigneeName: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  flagged: boolean;
  labels: Array<{ id: string; name: string; color: string }>;
};

export type MyTasksSort =
  | "updated"
  | "created"
  | "dueDate"
  | "priority"
  | "title"
  | "number";
export type MyTasksGroup =
  | "board"
  | "none"
  | "status"
  | "priority"
  | "label"
  | "dueDate"
  | "assignee"
  | "milestone";

const priorityRank: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  no_priority: 4,
};

export function sortMyTasks(tasks: MyTaskViewItem[], sort: MyTasksSort) {
  return [...tasks].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "number") return a.number - b.number;
    if (sort === "priority")
      return (
        (priorityRank[a.priority ?? "no_priority"] ?? 5) -
        (priorityRank[b.priority ?? "no_priority"] ?? 5)
      );
    if (sort === "dueDate")
      return (
        (a.dueDate ? Date.parse(a.dueDate) : Number.MAX_SAFE_INTEGER) -
        (b.dueDate ? Date.parse(b.dueDate) : Number.MAX_SAFE_INTEGER)
      );
    const field = sort === "created" ? "createdAt" : "updatedAt";
    return Date.parse(b[field]) - Date.parse(a[field]);
  });
}

export function groupMyTasks(tasks: MyTaskViewItem[], group: MyTasksGroup) {
  const groups = new Map<string, MyTaskViewItem[]>();
  const add = (key: string, task: MyTaskViewItem) =>
    groups.set(key, [...(groups.get(key) ?? []), task]);
  for (const task of tasks) {
    if (group === "none") add("All tickets", task);
    else if (group === "board") add(task.boardName || task.boardId, task);
    else if (group === "status") add(task.status || "No status", task);
    else if (group === "priority") add(task.priority || "No priority", task);
    else if (group === "assignee") add(task.assigneeName || "Unassigned", task);
    else if (group === "milestone")
      add(task.milestoneName || "No milestone", task);
    else if (group === "dueDate") {
      if (!task.dueDate) add("No due date", task);
      else {
        const due = new Date(task.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        add(due < today ? "Overdue" : "Upcoming", task);
      }
    } else if (task.labels.length === 0) add("No label", task);
    else for (const label of task.labels) add(label.name, task);
  }
  return [...groups.entries()];
}
