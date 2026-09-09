import { Link } from "@tanstack/react-router";
import { CornerDownRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type Task from "@/types/task";

/**
 * "Subtask of KAN-12" marker for a child task.
 *
 * The task ID is the clickable part, matching how task references behave
 * elsewhere: the label is prose, the identifier is the link. Rendered by both
 * the board card and the list row so the two views cannot drift apart.
 */
export default function SubtaskOfBadge({
  boardId,
  boardSlug,
  className,
  organizationId,
  parent,
}: {
  boardId: string;
  boardSlug: string | undefined;
  className?: string;
  organizationId: string;
  parent: NonNullable<Task["parentTask"]>;
}) {
  const label = boardSlug
    ? `${boardSlug}-${parent.number}`
    : `#${parent.number}`;

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground",
        className,
      )}
      data-testid="subtask-of-badge"
    >
      <CornerDownRight className="size-3 shrink-0" />
      Subtask of{" "}
      <Link
        className="shrink-0 font-medium hover:text-primary hover:underline"
        onClick={(event) => event.stopPropagation()}
        params={{
          organizationSlug: organizationId,
          boardSlug: boardId,
          taskId: parent.id,
        }}
        title={parent.title}
        to="/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId"
      >
        {label}
      </Link>
    </span>
  );
}
