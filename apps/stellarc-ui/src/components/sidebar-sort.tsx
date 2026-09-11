import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

/**
 * KFL-190: archival outranks the persisted drag order. The server already
 * returns boards archived-last; honouring a stale saved position here would
 * float an archived board back above the active ones, so the archived flag is
 * compared first and the saved order only breaks ties within each group.
 * Entries without an `archivedAt` field (repos) are all "active" and behave
 * exactly as before.
 */
export function reconcileSidebarOrder<
  T extends { id: string; archivedAt?: string | Date | null },
>(items: T[], savedIds: string[]): T[] {
  const positions = new Map(savedIds.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aArchived = a.archivedAt != null ? 1 : 0;
    const bArchived = b.archivedAt != null ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;
    const aPosition = positions.get(a.id);
    const bPosition = positions.get(b.id);
    if (aPosition === undefined && bPosition === undefined) return 0;
    if (aPosition === undefined) return 1;
    if (bPosition === undefined) return -1;
    return aPosition - bPosition;
  });
}

export function SidebarSortableList({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex >= 0 && newIndex >= 0) {
      onReorder(arrayMove(ids, oldIndex, newIndex));
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SidebarSortableItem({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
