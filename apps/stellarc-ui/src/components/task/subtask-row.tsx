import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import TaskCardContextMenuContent from "@/components/kanban-board/task-card-context-menu/task-card-context-menu-content";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getColumnIcon } from "@/lib/column";
import { getInitials } from "@/lib/get-initials";
import { getPriorityIcon } from "@/lib/priority";
import type Task from "@/types/task";
import SubtaskAssigneePopover from "./subtask-assignee-popover";
import SubtaskPriorityPopover from "./subtask-priority-popover";
import SubtaskStatusPopover from "./subtask-status-popover";

type SubtaskRowProps = {
  task: Task;
  tasks: Task[];
  boardId: string;
  organizationId: string;
  isSelected: boolean;
  isFocused: boolean;
  isCompleted: boolean;
  canEdit: boolean;
  selectionRadius: string;
  assignee: {
    user?: { image?: string | null; name?: string | null } | null;
  } | null;
  onToggleComplete: () => void;
  onNavigate: () => void;
  onDeleteClick: () => void;
  /** Removes the parent/subtask link without deleting the subtask itself. */
  onUnlink: () => void;
};

export default function SubtaskRow({
  task,
  tasks,
  boardId,
  organizationId,
  isSelected,
  isFocused,
  isCompleted,
  canEdit,
  selectionRadius,
  assignee,
  onToggleComplete,
  onNavigate,
  onDeleteClick,
  onUnlink,
}: SubtaskRowProps) {
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();

  return (
    <motion.div
      layout
      initial={
        reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, scale: 0.98 }
      }
      animate={
        reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto", scale: 1 }
      }
      exit={
        reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, scale: 0.98 }
      }
      transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`group flex items-center gap-2 py-1 px-2 ${selectionRadius} transition-colors cursor-default ${isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/50"} ${isFocused ? "ring-1 ring-inset ring-ring/50" : ""}`}
          >
            {/* Completion — toggles the subtask done/undone and persists it. */}
            <Checkbox
              checked={isCompleted}
              onCheckedChange={onToggleComplete}
              disabled={!canEdit}
              aria-label={t("tasks:subtasks.completeAria", {
                defaultValue: "Mark subtask complete",
              })}
            />

            <SubtaskStatusPopover tasks={tasks} boardId={boardId}>
              <button
                type="button"
                className="shrink-0 flex items-center justify-center rounded p-0.5 transition-colors outline-none [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground"
              >
                {getColumnIcon(task.status, false)}
              </button>
            </SubtaskStatusPopover>

            <button
              type="button"
              className="flex-1 min-w-0 text-left outline-none"
              onClick={onNavigate}
            >
              <span className="flex min-w-0 items-center gap-2">
                {/* Task number, so a subtask can be referenced without opening
                    it. Fixed width keeps titles aligned down the list. */}
                {task.number != null && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    #{task.number}
                  </span>
                )}
                <span
                  className={`min-w-0 flex-1 text-sm truncate ${isCompleted ? "line-through text-muted-foreground" : "text-foreground/90"}`}
                >
                  {task.title}
                </span>
              </span>
            </button>

            {/* Priority sits beside status so both are editable from the list
                without opening the subtask. */}
            <SubtaskPriorityPopover tasks={tasks}>
              <button
                type="button"
                aria-label={t("tasks:priority.label")}
                className="shrink-0 flex items-center justify-center rounded p-0.5 transition-colors outline-none [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground"
              >
                {getPriorityIcon(task.priority ?? "no-priority")}
              </button>
            </SubtaskPriorityPopover>

            <SubtaskAssigneePopover
              tasks={tasks}
              organizationId={organizationId}
            >
              <button
                type="button"
                className="shrink-0 flex items-center justify-center rounded p-0.5 transition-colors outline-none"
              >
                {task.userId && assignee ? (
                  <Avatar className={`h-5 w-5 ${getAvatarTone(task.userId)}`}>
                    <AvatarImage
                      src={assignee?.user?.image ?? ""}
                      alt={assignee?.user?.name || ""}
                    />
                    <AvatarFallback className="bg-transparent text-[9px] font-medium border border-border/30">
                      {getInitials(assignee?.user?.name)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border/70"
                    title={t("tasks:popover.assignee.unassigned")}
                  >
                    <span className="text-[9px] font-medium text-muted-foreground">
                      ?
                    </span>
                  </div>
                )}
              </button>
            </SubtaskAssigneePopover>
          </div>
        </ContextMenuTrigger>

        <TaskCardContextMenuContent
          task={task}
          taskCardContext={{
            boardId,
            worskpaceId: organizationId,
          }}
          onDeleteClick={onDeleteClick}
          onUnlink={onUnlink}
          unlinkLabel={t("tasks:actions.unlinkSubtask")}
        />
      </ContextMenu>
    </motion.div>
  );
}
