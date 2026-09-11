import type Task from "@/types/task";

export type TaskTreeNode = {
  task: Task;
  children: TaskTreeNode[];
};

/**
 * Builds a task tree for one exact view bucket (a board column, or a group
 * inside a column). A task is nested only when its immediate parent is present
 * in the same input set. This keeps cross-column/cross-group children
 * standalone instead of implying a false workflow relationship.
 *
 * Input order remains authoritative: roots and siblings retain their server/DnD
 * order, and every input task appears exactly once. The visited guard is only a
 * defensive fallback for malformed cyclic metadata; the API enforces board
 * depth and acyclic parent relations.
 */
export function groupSameBucketSubtasks(tasks: Task[]): TaskTreeNode[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<string, Task[]>();

  for (const task of tasks) {
    const parentId = task.parentTask?.id;
    if (!parentId || parentId === task.id || !byId.has(parentId)) continue;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(task);
    childrenByParent.set(parentId, siblings);
  }

  const nestedIds = new Set(
    [...childrenByParent.values()].flatMap((children) =>
      children.map((child) => child.id),
    ),
  );
  const rendered = new Set<string>();

  const buildNode = (
    task: Task,
    ancestors: ReadonlySet<string>,
  ): TaskTreeNode => {
    rendered.add(task.id);
    const nextAncestors = new Set(ancestors).add(task.id);
    return {
      task,
      children: (childrenByParent.get(task.id) ?? [])
        .filter((child) => !nextAncestors.has(child.id))
        .map((child) => buildNode(child, nextAncestors)),
    };
  };

  const roots = tasks
    .filter((task) => !nestedIds.has(task.id))
    .map((task) => buildNode(task, new Set()));

  // Cyclic or otherwise malformed relations have no natural root. Keep those
  // records visible as standalone roots rather than silently dropping IDs.
  for (const task of tasks) {
    if (!rendered.has(task.id)) roots.push({ task, children: [] });
  }

  return roots;
}

/** Flat visible sequence for a collapsed/expanded tree view. */
export function visibleGroupedTasks(
  groups: TaskTreeNode[],
  collapsedParentIds: ReadonlySet<string>,
): Task[] {
  const flatten = (node: TaskTreeNode): Task[] => [
    node.task,
    ...(collapsedParentIds.has(node.task.id)
      ? []
      : node.children.flatMap(flatten)),
  ];
  return groups.flatMap(flatten);
}

export function countTreeTasks(nodes: TaskTreeNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countTreeTasks(node.children),
    0,
  );
}

type CollapseToggleProps = {
  parentId: string;
  childCount: number;
  collapsed: boolean;
};

export function collapseToggleLabel({
  parentId: _parentId,
  childCount,
  collapsed,
}: CollapseToggleProps) {
  return `${collapsed ? "Expand" : "Collapse"} ${childCount} ${
    childCount === 1 ? "subtask" : "subtasks"
  }`;
}
