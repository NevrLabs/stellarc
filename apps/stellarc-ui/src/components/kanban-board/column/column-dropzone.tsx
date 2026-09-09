import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Milestone,
  Tag,
} from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { groupTasks } from "@/hooks/use-task-filters-with-labels-support";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { getInitials } from "@/lib/get-initials";
import {
  collapseToggleLabel,
  countTreeTasks,
  groupSameBucketSubtasks,
  type TaskTreeNode,
} from "@/lib/group-subtasks";
import { shouldVirtualizeKanbanColumn } from "@/lib/kanban-virtualization";
import { getPriorityIcon } from "@/lib/priority";
import type { BoardWithTasks } from "@/types/board";
import { useBoardGroupBy } from "../board-view-context";
import TaskCard from "../task-card";

type ColumnDropzoneProps = {
  column: BoardWithTasks["columns"][number];
  disableDragDrop?: boolean;
  scrollElementRef?: RefObject<HTMLDivElement | null>;
};

/**
 * Groups rendered in the first pass. Roughly two screens' worth — enough that
 * the user never sees the boundary, since only ~10 cards fit on screen.
 */
const INITIAL_WINDOW = 30;

/** Groups added per follow-up chunk. */
const CHUNK = 40;

/** Approximate rendered height of one card, for the pending-space reservation. */
const CARD_HEIGHT_PX = 102;

const NESTED_INDENT = ["", "ml-4", "ml-8", "ml-12"] as const;
export function ColumnDropzone({
  column,
  disableDragDrop = false,
  scrollElementRef,
}: ColumnDropzoneProps) {
  const { t } = useTranslation();
  const groupBy = useBoardGroupBy();

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
    new Set(),
  );
  // Board-level group-by sections the user has hidden (#61 rework). Keyed by
  // group key so toggling one group never touches another's state.
  const [collapsedTaskGroups, setCollapsedTaskGroups] = useState<Set<string>>(
    new Set(),
  );
  const groups = useMemo(
    () => groupSameBucketSubtasks(column.tasks),
    [column.tasks],
  );
  const shouldVirtualize = shouldVirtualizeKanbanColumn({
    groupBy,
    itemCount: groups.length,
  });
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? groups.length : 0,
    getScrollElement: () => scrollElementRef?.current ?? null,
    estimateSize: () => CARD_HEIGHT_PX + 8,
    getItemKey: (index) => groups[index]?.task.id ?? index,
    overscan: 8,
  });

  /*
    Status is stored as a slug (`to-do`) but must display as the column's name
    (`To Do`). Every column on this board supplies the mapping.
  */
  const statusDisplayNames = useMemo(
    () => ({ [column.id]: column.name }),
    [column.id, column.name],
  );

  const taskGroups = useMemo(
    () =>
      groupBy === "none"
        ? []
        : groupTasks(column.tasks, groupBy, statusDisplayNames),
    [column.tasks, groupBy, statusDisplayNames],
  );
  const totalGroups =
    groupBy === "none"
      ? groups.length
      : taskGroups.reduce((total, group) => total + group.tasks.length, 0);

  /**
   * Progressive mount.
   *
   * Every card calls useSortable, which registers a droppable node with dnd-kit;
   * a 180-task column therefore did 180 registrations in the single synchronous
   * render that a view switch triggers (measured: one 2.2s long task on
   * Gantt -> Tasks). Only ~10 cards are ever on screen, so the first paint
   * renders a small window of groups and the rest are appended in idle chunks.
   *
   * Chunking is per group, not per task, because a parent and its subtasks are
   * one render unit — splitting mid-group would show a parent whose children
   * pop in a frame later.
   *
   * This keeps drag-and-drop working on every card, unlike true windowing which
   * would unmount off-screen cards and break dnd-kit's registry.
   *
   * ponytail: chunked mount, not virtualization. Total work is unchanged, it's
   * just spread across frames so nothing blocks the click. Swap in
   * @tanstack/react-virtual (and rework the SortableContext items) if columns
   * grow past a few thousand cards.
   */
  const [mountCount, setMountCount] = useState(() =>
    Math.min(totalGroups, INITIAL_WINDOW),
  );

  // Reset when the column identity or size changes (board switch, filter).
  // Switching boards can yield the same group count, so column.id is required
  // here even though biome sees it as redundant — without it the window stays
  // wherever the previous board's chunking left it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: column.id resets the window on board switch
  useEffect(() => {
    setMountCount(Math.min(totalGroups, INITIAL_WINDOW));
  }, [column.id, totalGroups]);

  useEffect(() => {
    if (mountCount >= totalGroups) return;
    // requestIdleCallback isn't in Safari; the timeout fallback is fine here
    // because the work is already off the critical path.
    const schedule =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 16);
    const cancel =
      typeof cancelIdleCallback === "function"
        ? cancelIdleCallback
        : clearTimeout;

    const handle = schedule(() => {
      setMountCount((current) => Math.min(totalGroups, current + CHUNK));
    });
    return () => cancel(handle as never);
  }, [mountCount, totalGroups]);

  const visibleGroups = useMemo(
    () => (shouldVirtualize ? [] : groups.slice(0, mountCount)),
    [groups, mountCount, shouldVirtualize],
  );

  // Board-level "group by": buckets this column's tasks under a heading.
  // Only used when grouping is on, so the ungrouped path keeps its
  // progressive-mount behaviour untouched.
  const visibleTaskGroups = useMemo(() => {
    let remaining = mountCount;
    return taskGroups.flatMap((group) => {
      if (remaining <= 0) return [];
      const tasks = group.tasks.slice(0, remaining);
      remaining -= tasks.length;
      return [{ ...group, tasks }];
    });
  }, [mountCount, taskGroups]);

  // Reserve height for not-yet-mounted groups so the scrollbar doesn't jump as
  // chunks land.
  const pendingCards = useMemo(
    () =>
      groups
        .slice(mountCount)
        .reduce((sum, group) => sum + countTreeTasks([group]), 0),
    [groups, mountCount],
  );

  /** Per-card Framer Motion cost ~1s on a 180-task column. Keep this plain. */
  const renderCard = (task: (typeof column.tasks)[number], depth = 0) => (
    <div
      key={task.id}
      className={cn(
        NESTED_INDENT[Math.min(depth, 3)],
        depth > 0 && "border-l-2 border-border pl-2",
      )}
    >
      <TaskCard task={task} disableDragDrop={disableDragDrop} />
    </div>
  );

  const renderTreeNode = (node: TaskTreeNode, depth = 0): React.ReactNode => {
    const collapsed = collapsedParents.has(node.task.id);
    return (
      <div
        className="flex flex-col gap-2"
        data-testid={node.children.length ? "task-group" : undefined}
        key={node.task.id}
      >
        {renderCard(node.task, depth)}
        {node.children.length > 0 && (
          <button
            aria-expanded={!collapsed}
            className={cn(
              "flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground",
              NESTED_INDENT[Math.min(depth, 3)],
            )}
            onClick={() =>
              setCollapsedParents((current) => {
                const next = new Set(current);
                if (collapsed) next.delete(node.task.id);
                else next.add(node.task.id);
                return next;
              })
            }
            type="button"
          >
            {collapsed ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            {collapseToggleLabel({
              parentId: node.task.id,
              childCount: node.children.length,
              collapsed,
            })}
          </button>
        )}
        {!collapsed &&
          node.children.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : [];

  return (
    <div
      className={cn(
        "min-h-0 flex-1 rounded-lg transition-colors duration-100",
        isOver && "bg-accent/25",
      )}
      data-column-id={column.id}
      ref={setNodeRef}
    >
      <SortableContext
        items={column.tasks}
        strategy={verticalListSortingStrategy}
      >
        {groupBy !== "none" ? (
          <div className="flex flex-col gap-3" data-slot="task-group-list">
            {visibleTaskGroups.map((group) => {
              const groupKey = group.key || "unset";
              const groupCollapsed = collapsedTaskGroups.has(groupKey);
              const groupTitle = group.labelKey
                ? t(group.labelKey)
                : group.label;
              const regionId = `${column.id}-task-group-${encodeURIComponent(groupKey)}`;
              const firstTask = group.tasks[0];
              const groupIcon =
                groupBy === "assignee" ? (
                  <Avatar
                    className={cn("size-4", getAvatarTone(firstTask?.userId))}
                  >
                    <AvatarImage alt="" src={firstTask?.assigneeImage ?? ""} />
                    <AvatarFallback className="bg-transparent text-[8px]">
                      {getInitials(groupTitle)}
                    </AvatarFallback>
                  </Avatar>
                ) : groupBy === "priority" && groupKey ? (
                  <span className="flex size-4 items-center justify-center [&>svg]:size-3.5">
                    {getPriorityIcon(groupKey)}
                  </span>
                ) : groupBy === "label" ? (
                  <Tag className="size-3.5" />
                ) : groupBy === "dueDate" ? (
                  <CalendarDays className="size-3.5" />
                ) : groupBy === "status" && groupKey ? (
                  <span className="flex size-4 items-center justify-center [&>svg]:size-3.5">
                    {getColumnIcon(groupKey)}
                  </span>
                ) : groupBy === "milestone" ? (
                  <Milestone className="size-3.5" />
                ) : null;
              return (
                <section
                  className="flex flex-col gap-2"
                  data-slot="task-group"
                  key={groupKey}
                >
                  {/* The whole heading is the show/hide affordance: the user
                      asked for each grouping to be a collapsible section, not
                      a flat separator line. */}
                  <button
                    aria-controls={regionId}
                    aria-expanded={!groupCollapsed}
                    className="flex h-7 w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 text-left font-medium text-xs text-foreground/80 uppercase tracking-wide transition-colors hover:bg-muted hover:text-foreground"
                    data-slot="task-group-toggle"
                    onClick={() =>
                      setCollapsedTaskGroups((current) => {
                        const next = new Set(current);
                        if (groupCollapsed) next.delete(groupKey);
                        else next.add(groupKey);
                        return next;
                      })
                    }
                    type="button"
                  >
                    {groupCollapsed ? (
                      <ChevronRight className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                    {groupIcon}
                    <span>{groupTitle}</span>
                    <span className="ml-1.5 text-muted-foreground/70">
                      {group.tasks.length}
                    </span>
                  </button>
                  {!groupCollapsed ? (
                    <div className="flex flex-col gap-2" id={regionId}>
                      {groupSameBucketSubtasks(group.tasks).map((node) =>
                        renderTreeNode(node),
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
            {taskGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                {t("tasks:column.empty")}
              </div>
            ) : null}
          </div>
        ) : shouldVirtualize ? (
          <div
            data-slot="virtual-task-list"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const node = groups[virtualItem.index];
              if (!node) return null;
              return (
                <div
                  data-index={virtualItem.index}
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  style={{
                    left: 0,
                    position: "absolute",
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    width: "100%",
                  }}
                >
                  {renderTreeNode(node)}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-2",
              // Container-level entry animation, replacing the old per-card
              // motion.div: one CSS transition on the wrapper reads the same but
              // costs nothing per card.
              "transition-[translate,opacity] duration-150 ease-out",
              "starting:-translate-y-1 starting:opacity-0",
              "motion-reduce:starting:translate-y-0",
            )}
          >
            {visibleGroups.map((node) => renderTreeNode(node))}
            {pendingCards > 0 ? (
              <div
                aria-hidden="true"
                style={{ height: `${pendingCards * CARD_HEIGHT_PX}px` }}
              />
            ) : null}
            {totalGroups === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                {t("tasks:column.empty")}
              </div>
            ) : null}
          </div>
        )}
      </SortableContext>
    </div>
  );
}
