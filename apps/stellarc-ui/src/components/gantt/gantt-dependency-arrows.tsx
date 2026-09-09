import { differenceInCalendarDays } from "date-fns";
import type { GanttTimeline } from "./gantt-timeline";

export type GanttRelation = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

type Row = { id: string; scheduleStart: Date; scheduleEnd: Date };

/**
 * Dependency arrows for blocks/related edges only. Subtask is structural
 * (parent→child nesting), not a scheduling constraint — it's rendered as
 * indentation, not an arrow.
 */
export function GanttDependencyArrows({
  relations,
  rows,
  timeline,
  rowHeightPx,
  pixelsPerDay,
}: {
  relations: GanttRelation[];
  rows: Row[];
  timeline: GanttTimeline;
  rowHeightPx: number;
  pixelsPerDay: number;
}) {
  const rowIndex = new Map(rows.map((row, index) => [row.id, index]));
  const dayToX = (date: Date) =>
    differenceInCalendarDays(date, timeline.rangeStart) * pixelsPerDay;

  const edges = relations.filter(
    (relation) =>
      (relation.relationType === "blocks" ||
        relation.relationType === "related") &&
      rowIndex.has(relation.sourceTaskId) &&
      rowIndex.has(relation.targetTaskId),
  );

  if (edges.length === 0) return null;

  const height = rows.length * rowHeightPx;
  const width = timeline.days.length * pixelsPerDay;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] overflow-visible"
      width={width}
      height={height}
      aria-hidden="true"
    >
      <title>Task dependencies</title>
      <defs>
        <marker
          id="gantt-arrowhead"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" className="fill-muted-foreground/80" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const fromIdx = rowIndex.get(edge.sourceTaskId);
        const toIdx = rowIndex.get(edge.targetTaskId);
        if (fromIdx == null || toIdx == null) return null;

        const from = rows[fromIdx];
        const to = rows[toIdx];

        const x1 = dayToX(from.scheduleEnd) + pixelsPerDay - 4;
        const y1 = fromIdx * rowHeightPx + rowHeightPx / 2;
        const x2 = dayToX(to.scheduleStart) + 2;
        const y2 = toIdx * rowHeightPx + rowHeightPx / 2;

        const stub = 10;
        const forward = x2 >= x1 + stub * 2;
        const path = forward
          ? `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`
          : `M ${x1} ${y1} H ${x1 + stub} V ${Math.min(y1, y2) - stub} H ${x2 - stub} V ${y2} H ${x2}`;

        return (
          <path
            key={edge.id}
            d={path}
            fill="none"
            className={
              edge.relationType === "blocks"
                ? "stroke-muted-foreground/60"
                : "stroke-muted-foreground/40"
            }
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeDasharray={
              edge.relationType === "related" ? "4 3" : undefined
            }
            markerEnd="url(#gantt-arrowhead)"
          />
        );
      })}
    </svg>
  );
}
