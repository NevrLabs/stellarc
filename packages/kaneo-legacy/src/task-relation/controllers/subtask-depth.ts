export const MIN_SUBTASK_DEPTH_LIMIT = 1;
export const MAX_SUBTASK_DEPTH_LIMIT = 4;
export const DEFAULT_SUBTASK_DEPTH_LIMIT = 4;

export type SubtaskEdge = {
  sourceTaskId: string;
  targetTaskId: string;
};

/**
 * Clamp an incoming depth limit into the range the DB CHECK constraint allows.
 * Kept pure so both the valibot schema and controllers agree on the bounds.
 */
export function clampSubtaskDepthLimit(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_SUBTASK_DEPTH_LIMIT;
  }
  const rounded = Math.trunc(value);
  if (rounded < MIN_SUBTASK_DEPTH_LIMIT) return MIN_SUBTASK_DEPTH_LIMIT;
  if (rounded > MAX_SUBTASK_DEPTH_LIMIT) return MAX_SUBTASK_DEPTH_LIMIT;
  return rounded;
}

/**
 * Number of ancestors above `taskId` (a task with no parent returns 0).
 * Cycles are guarded with a visited set so a corrupt graph can't hang us.
 */
export function countAncestors(edges: SubtaskEdge[], taskId: string): number {
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    // `sourceTaskId` is the parent, `targetTaskId` is the subtask.
    if (!parentOf.has(edge.targetTaskId)) {
      parentOf.set(edge.targetTaskId, edge.sourceTaskId);
    }
  }

  const seen = new Set<string>([taskId]);
  let current = taskId;
  let depth = 0;

  while (parentOf.has(current)) {
    const parent = parentOf.get(current) as string;
    if (seen.has(parent)) break;
    seen.add(parent);
    current = parent;
    depth += 1;
  }

  return depth;
}

/** Depth of the deepest subtree below `taskId` (a leaf returns 0). */
export function countDescendantDepth(
  edges: SubtaskEdge[],
  taskId: string,
): number {
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    childrenOf.set(edge.sourceTaskId, [
      ...(childrenOf.get(edge.sourceTaskId) ?? []),
      edge.targetTaskId,
    ]);
  }

  const walk = (node: string, seen: Set<string>): number => {
    const children = childrenOf.get(node) ?? [];
    let deepest = 0;
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      deepest = Math.max(deepest, 1 + walk(child, seen));
    }
    return deepest;
  };

  return walk(taskId, new Set([taskId]));
}

/**
 * Length (in task levels, root included) of the longest chain that would exist
 * after linking `targetTaskId` as a subtask of `sourceTaskId`.
 */
export function resultingChainDepth({
  edges,
  sourceTaskId,
  targetTaskId,
}: {
  edges: SubtaskEdge[];
  sourceTaskId: string;
  targetTaskId: string;
}): number {
  const above = countAncestors(edges, sourceTaskId);
  const below = countDescendantDepth(edges, targetTaskId);
  // above -> source -> target -> below
  return above + 2 + below;
}

export function exceedsSubtaskDepthLimit({
  edges,
  sourceTaskId,
  targetTaskId,
  depthLimit,
}: {
  edges: SubtaskEdge[];
  sourceTaskId: string;
  targetTaskId: string;
  depthLimit: number;
}): boolean {
  return (
    resultingChainDepth({ edges, sourceTaskId, targetTaskId }) >
    clampSubtaskDepthLimit(depthLimit)
  );
}

export function subtaskDepthLimitMessage(depthLimit: number) {
  const limit = clampSubtaskDepthLimit(depthLimit);
  return `Subtask nesting limit reached: this board allows at most ${limit} level${
    limit === 1 ? "" : "s"
  } of nested subtasks.`;
}
