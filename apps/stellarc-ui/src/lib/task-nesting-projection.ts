/**
 * Drag-to-nest projection for the task list.
 *
 * Ported from dnd-kit's official Sortable Tree example so the interaction
 * matches what users expect from Linear / Asana / Notion: drag a row and push it
 * to the RIGHT to nest it under the row above.
 * https://github.com/clauderic/dnd-kit/blob/master/stories/3%20-%20Examples/Tree/utilities.ts
 *
 * Kaneo stores nesting as a `subtask` task RELATION rather than a parentId
 * column, so the UI's job is to resolve "which task should be the parent (or
 * none)" and let the caller diff that against the existing relation.
 */

/** One row of the visually flattened list, in render order. */
export type FlatRow = {
  id: string;
  /** 0 = top level. */
  depth: number;
  parentId: string | null;
};

export type Projection = {
  depth: number;
  maxDepth: number;
  minDepth: number;
  parentId: string | null;
  /**
   * Level the intent box settled on, BEFORE min/max clamping. Feed this back in
   * as `previousDragDepth` on the next move so hysteresis is stable even where
   * clamping overrides the visible depth.
   */
  dragDepth: number;
};

/**
 * Horizontal travel needed per nesting level. Matches the row's own indent so
 * the drag distance and the resulting indent agree visually.
 */
export const INDENTATION_WIDTH_PX = 24;

/**
 * Deepest row depth allowed by default.
 *
 * The API's `subtaskDepthLimit` counts TASK LEVELS in a chain (parent + child =
 * 2) and defaults to 4, while `depth` here is a 0-indexed row indent. So a board
 * limit of N permits a maximum depth of N - 1. See
 * apps/api/src/task-relation/controllers/subtask-depth.ts.
 */
export const MAX_NEST_DEPTH = 3;

/** Convert the API's board setting (task levels, 1..4) to a max row depth. */
export function maxDepthForBoardLimit(
  subtaskDepthLimit: number | null | undefined,
): number {
  if (
    typeof subtaskDepthLimit !== "number" ||
    Number.isNaN(subtaskDepthLimit)
  ) {
    return MAX_NEST_DEPTH;
  }
  return Math.max(0, Math.min(4, Math.trunc(subtaskDepthLimit)) - 1);
}

/**
 * The "intent box": a dead zone around the current nesting level that the
 * pointer must leave before the level changes.
 *
 * Naive `Math.round(offset / indent)` flips at exactly half a step, so a 1px
 * hand wobble at the boundary oscillates the row between depths every
 * mousemove — that's the jank. Requiring 60% of a step to cross OUT of the
 * current level, and 60% back to return, gives a ±14.4px dead band with
 * hysteresis: the row holds its level until you clearly mean to change it, and
 * dragging out of the box to the right is what nests the task.
 */
export const NEST_INTENT_THRESHOLD = 0.6;

/**
 * How far the level can change in one event. Guards against a huge synthetic
 * jump (or a dropped frame) walking the loop hundreds of times.
 */
const MAX_LEVEL_STEP = 16;

/**
 * Resolve the drag depth with intent-box hysteresis.
 *
 * @param offsetPx          horizontal travel since drag start
 * @param indentationWidth  px per nesting level
 * @param previousDragDepth level settled on by the previous move event
 */
export function getDragDepth(
  offsetPx: number,
  indentationWidth: number,
  previousDragDepth = 0,
): number {
  if (indentationWidth <= 0) return previousDragDepth;
  const raw = offsetPx / indentationWidth;
  let depth = previousDragDepth;
  // Walk one level at a time, only while the pointer is clearly OUTSIDE the
  // intent box. Inside the box the previous level is kept verbatim.
  for (let step = 0; step < MAX_LEVEL_STEP; step++) {
    if (raw >= depth + NEST_INTENT_THRESHOLD) depth += 1;
    else if (raw <= depth - NEST_INTENT_THRESHOLD) depth -= 1;
    else break;
  }
  return depth;
}

/**
 * Collect a task and everything beneath it, so a parent can't be dropped into
 * its own subtree (which would orphan the branch).
 */
export function getSubtreeIds(rows: FlatRow[], rootId: string): string[] {
  const rootIndex = rows.findIndex((row) => row.id === rootId);
  if (rootIndex === -1) return [];
  const root = rows[rootIndex];
  const ids = [rootId];
  for (let i = rootIndex + 1; i < rows.length; i++) {
    // Descendants are the contiguous run of deeper rows directly below.
    if (rows[i].depth <= root.depth) break;
    ids.push(rows[i].id);
  }
  return ids;
}

/**
 * Where would the dragged row land, and under whom?
 *
 * @param rows            flattened list in render order, WITHOUT the dragged
 *                        row's descendants (collapse them before calling)
 * @param activeId        row being dragged
 * @param overId          row currently hovered
 * @param dragOffsetPx    horizontal travel since drag start (positive = right)
 * @param indentationWidth px per nesting level
 * @param maxNestDepth    deepest allowed depth
 * @param previousDragDepth `dragDepth` from the previous move (intent box state)
 */
export function getProjection(
  rows: FlatRow[],
  activeId: string,
  overId: string,
  dragOffsetPx: number,
  indentationWidth: number = INDENTATION_WIDTH_PX,
  maxNestDepth: number = MAX_NEST_DEPTH,
  previousDragDepth = 0,
): Projection | null {
  const overItemIndex = rows.findIndex((row) => row.id === overId);
  const activeItemIndex = rows.findIndex((row) => row.id === activeId);
  if (overItemIndex === -1 || activeItemIndex === -1) return null;

  const activeItem = rows[activeItemIndex];
  // Same move dnd-kit's sortable performs, so the neighbours we inspect are the
  // ones the row will actually sit between.
  const nextRows = rows.slice();
  nextRows.splice(overItemIndex, 0, nextRows.splice(activeItemIndex, 1)[0]);

  const previousItem = nextRows[overItemIndex - 1];
  const nextItem = nextRows[overItemIndex + 1];

  const dragDepth = getDragDepth(
    dragOffsetPx,
    indentationWidth,
    previousDragDepth,
  );
  const projectedDepth = activeItem.depth + dragDepth;

  // A row can be at most one level deeper than the row above it — anything more
  // would skip a level and have no parent to attach to.
  const maxDepth = Math.min(
    previousItem ? previousItem.depth + 1 : 0,
    maxNestDepth,
  );
  // It also cannot be shallower than the row below, or that row would be
  // re-parented out from under it.
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = projectedDepth;
  if (projectedDepth >= maxDepth) {
    depth = maxDepth;
  } else if (projectedDepth < minDepth) {
    depth = minDepth;
  }

  return { depth, maxDepth, minDepth, dragDepth, parentId: resolveParentId() };

  function resolveParentId(): string | null {
    if (depth === 0 || !previousItem) return null;
    // Same depth as the row above: they're siblings, so share its parent.
    if (depth === previousItem.depth) return previousItem.parentId;
    // Deeper than the row above: that row IS the parent.
    if (depth > previousItem.depth) return previousItem.id;
    // Shallower: walk back for the nearest row at this depth and copy its parent.
    return (
      nextRows
        .slice(0, overItemIndex)
        .reverse()
        .find((row) => row.depth === depth)?.parentId ?? null
    );
  }
}

/**
 * Would nesting `activeId` under `parentId` create a cycle?
 * True when the prospective parent is the row itself or one of its descendants.
 */
export function wouldCreateCycle(
  rows: FlatRow[],
  activeId: string,
  parentId: string | null,
): boolean {
  if (!parentId) return false;
  return getSubtreeIds(rows, activeId).includes(parentId);
}
