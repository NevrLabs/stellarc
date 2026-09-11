export const KANBAN_VIRTUALIZATION_THRESHOLD = 80;

type KanbanVirtualizationInput = {
  groupBy: string;
  itemCount: number;
};

export function shouldVirtualizeKanbanColumn({
  groupBy,
  itemCount,
}: KanbanVirtualizationInput) {
  return groupBy === "none" && itemCount > KANBAN_VIRTUALIZATION_THRESHOLD;
}
