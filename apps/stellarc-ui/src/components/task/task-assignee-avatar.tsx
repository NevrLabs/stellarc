import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";
import { resolveAssignee } from "@/lib/resolve-assignee";
import type Task from "@/types/task";

/**
 * The assignee glyph shown on a ticket row/card.
 *
 * Card, list row and backlog row each carried a byte-identical copy of this
 * markup branching on `task.userId` alone, so a ticket assigned to a TEAM
 * rendered the "?" unassigned glyph on every board surface even though the
 * assignment had saved. `userId` and `teamId` are mutually exclusive columns —
 * the shared rule lives in lib/resolve-assignee, and this component is the
 * single place that renders it so the three surfaces cannot drift again.
 */
export function TaskAssigneeAvatar({
  task,
  size = "md",
  className,
}: {
  task: Task;
  /** sm = kanban card (h-5), md = list/backlog rows (h-6). */
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useTranslation();
  const box = size === "sm" ? "h-5 w-5" : "h-6 w-6";

  const { label, hasAssignee, teamName } = resolveAssignee({
    task,
    unassignedLabel: t("tasks:assignee.unassigned"),
    teamFallbackLabel: t("tasks:popover.assignee.team"),
  });

  if (teamName) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full border border-border bg-muted",
          box,
          className,
        )}
        title={label}
        data-testid="task-assignee-team"
      >
        <Users
          className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"}
          aria-hidden="true"
        />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (hasAssignee) {
    return (
      <Avatar
        className={cn(
          box,
          getAvatarTone(task.userId, task.assigneeId),
          className,
        )}
        title={label}
        data-testid="task-assignee-user"
      >
        <AvatarImage
          src={task.assigneeImage ?? ""}
          alt={task.assigneeName ?? ""}
        />
        <AvatarFallback className="bg-transparent text-xs font-medium border border-border/30">
          {getInitials(task.assigneeName)}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border border-border bg-muted",
        box,
        className,
      )}
      title={label}
      data-testid="task-assignee-unassigned"
    >
      <span className="text-[10px] font-medium text-muted-foreground">?</span>
    </div>
  );
}

export default TaskAssigneeAvatar;
