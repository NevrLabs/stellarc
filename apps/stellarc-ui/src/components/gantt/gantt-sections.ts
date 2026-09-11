import type { GanttMilestone } from "./gantt-milestones";

/**
 * Grouping of Gantt rows into milestone sections.
 *
 * The board timeline presents a milestone as a SECTION HEADER with its member
 * tasks directly beneath it, and the header collapses the whole section. That
 * means row order is owned here rather than by the task sort alone: a task's
 * milestone decides which section it lands in, and the sort only orders tasks
 * *within* a section.
 *
 * Kept pure (no React, no dates beyond comparison) so the ordering rules are
 * testable without mounting the route.
 */

/** Minimum a row needs for grouping; the real row type carries much more. */
export type GroupableRow = {
  id: string;
  milestoneId?: string | null;
  /** 0 = top level. Subtask rows follow their parent contiguously. */
  depth: number;
  parentId: string | null;
};

export type MilestoneSection<TRow> = {
  kind: "milestone";
  milestone: GanttMilestone;
  /** Member tasks in sort order, subtrees kept contiguous. */
  rows: TRow[];
  collapsed: boolean;
};

export type UngroupedSection<TRow> = {
  kind: "ungrouped";
  rows: TRow[];
  /** Render a labelled section header when this board has milestones. */
  labelled: boolean;
};

export type GanttSection<TRow> =
  | MilestoneSection<TRow>
  | UngroupedSection<TRow>;

/**
 * Effective milestone of a row.
 *
 * Milestone membership propagates DOWN the subtask tree, so a child with no
 * milestone of its own inherits its parent's. Without this a subtask would be
 * torn out of its parent's section and rendered under "No milestone", which
 * breaks the "all tasks included in the milestone sit right below it" rule.
 * The API performs the same propagation on assignment; this keeps the view
 * correct for rows written before that, and for optimistic updates.
 */
export function resolveRowMilestoneId<TRow extends GroupableRow>(
  rows: readonly TRow[],
): Map<string, string | null> {
  const byId = new Map<string, TRow>();
  for (const row of rows) byId.set(row.id, row);

  const resolved = new Map<string, string | null>();

  const walk = (row: TRow, seen: Set<string>): string | null => {
    const cached = resolved.get(row.id);
    if (cached !== undefined) return cached;
    if (row.milestoneId) {
      resolved.set(row.id, row.milestoneId);
      return row.milestoneId;
    }
    // Cycle guard: a corrupt parent chain must not recurse forever.
    if (row.parentId && !seen.has(row.parentId)) {
      const parent = byId.get(row.parentId);
      if (parent) {
        seen.add(row.parentId);
        const inherited = walk(parent, seen);
        resolved.set(row.id, inherited);
        return inherited;
      }
    }
    resolved.set(row.id, null);
    return null;
  };

  for (const row of rows) walk(row, new Set([row.id]));
  return resolved;
}

/** Milestones sorted by target date, undated last, then by name for stability. */
export function sortMilestonesForSections(
  milestones: readonly GanttMilestone[],
): GanttMilestone[] {
  return milestones.slice().sort((a, b) => {
    const aTime = a.targetDate ? a.targetDate.getTime() : null;
    const bTime = b.targetDate ? b.targetDate.getTime() : null;
    if (aTime !== null && bTime !== null && aTime !== bTime)
      return aTime - bTime;
    if (aTime === null && bTime !== null) return 1;
    if (aTime !== null && bTime === null) return -1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Split rows into milestone sections plus a trailing ungrouped section.
 *
 * @param rows                 visible rows in sort order (already nested/flattened)
 * @param milestones           milestones to render as section headers
 * @param collapsedMilestoneIds sections whose tasks are hidden
 */
export function buildGanttSections<TRow extends GroupableRow>({
  rows,
  milestones,
  collapsedMilestoneIds,
}: {
  rows: readonly TRow[];
  milestones: readonly GanttMilestone[];
  collapsedMilestoneIds?: ReadonlySet<string>;
}): GanttSection<TRow>[] {
  const effective = resolveRowMilestoneId(rows);
  const known = new Set(milestones.map((milestone) => milestone.id));

  const byMilestone = new Map<string, TRow[]>();
  const ungrouped: TRow[] = [];
  for (const row of rows) {
    const milestoneId = effective.get(row.id) ?? null;
    // A row pointing at a milestone that isn't being rendered (filtered out,
    // deleted, or on another board) must still appear somewhere.
    if (milestoneId && known.has(milestoneId)) {
      const bucket = byMilestone.get(milestoneId);
      if (bucket) bucket.push(row);
      else byMilestone.set(milestoneId, [row]);
    } else {
      ungrouped.push(row);
    }
  }

  const sections: GanttSection<TRow>[] = [];
  for (const milestone of sortMilestonesForSections(milestones)) {
    const collapsed = collapsedMilestoneIds?.has(milestone.id) ?? false;
    sections.push({
      kind: "milestone",
      milestone,
      rows: byMilestone.get(milestone.id) ?? [],
      collapsed,
    });
  }
  // Unassigned work goes last so milestone sections read as the plan and the
  // remainder as the backlog.
  if (ungrouped.length > 0)
    sections.push({
      kind: "ungrouped",
      rows: ungrouped,
      labelled: milestones.length > 0,
    });
  return sections;
}

/**
 * Rows that are actually rendered, honouring collapsed sections. Drag and drop
 * needs this (not the raw list) so a collapsed section's hidden tasks can't be
 * chosen as drop targets.
 */
export function visibleSectionRows<TRow extends GroupableRow>(
  sections: readonly GanttSection<TRow>[],
): TRow[] {
  return sections.flatMap((section) =>
    section.kind === "milestone" && section.collapsed ? [] : section.rows,
  );
}
