import { format } from "date-fns";
import {
  type ComponentProps,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getInitials } from "@/lib/get-initials";
import type Task from "@/types/task";

/**
 * Hover-intent delay. Long enough that sweeping the pointer across a dense
 * column doesn't strobe previews open, short enough to still feel intentional.
 *
 * #110: these constants existed but never reached Base UI — the preview-card
 * wrapper dropped them, so the real open delay was the library's 600ms default.
 * The wrapper now forwards them; keep the open delay snappy (~150ms).
 */
export const TASK_PREVIEW_OPEN_DELAY = 150;
export const TASK_PREVIEW_CLOSE_DELAY = 80;

type TaskHoverPreviewProps = {
  task: Task;
  boardSlug?: string;
  assigneeName?: string;
  assigneeImage?: string;
  children: ReactElement;
  /**
   * #131: while a card is being dragged its hover preview must disappear —
   * otherwise the popover follows the pointer around the board, covering the
   * drop targets you are aiming at.
   */
  isDragging?: boolean;
} & Omit<ComponentProps<typeof HoverCardTrigger>, "asChild" | "children">;

/**
 * Wraps a task card in a hover preview. Pointer-only on purpose: a touch
 * device has no hover state, and opening a popover on tap would swallow the
 * tap that is supposed to open the task.
 */
function TaskHoverPreview({
  task,
  boardSlug,
  assigneeName,
  assigneeImage,
  children,
  isDragging = false,
  ...triggerProps
}: TaskHoverPreviewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const labels = task.labels ?? [];

  useEffect(() => {
    if (isDragging) setOpen(false);
  }, [isDragging]);

  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={TASK_PREVIEW_OPEN_DELAY}
      closeDelay={TASK_PREVIEW_CLOSE_DELAY}
    >
      <HoverCardTrigger asChild {...triggerProps}>
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        className="w-80 p-3"
        side="right"
        align="start"
        data-slot="task-hover-preview"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[10px] text-muted-foreground/90">
            {boardSlug ? `${boardSlug}-${task.number}` : `#${task.number}`}
          </div>

          <p className="text-sm font-medium leading-snug text-foreground/95">
            {task.title}
          </p>

          <dl className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("tasks:preview.assignee")}
              </dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                {assigneeName ? (
                  <>
                    <Avatar className={`h-4 w-4 ${getAvatarTone(task.userId)}`}>
                      <AvatarImage src={assigneeImage ?? ""} alt="" />
                      <AvatarFallback className="bg-transparent text-[8px]">
                        {getInitials(assigneeName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{assigneeName}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {t("tasks:assignee.unassigned")}
                  </span>
                )}
              </dd>
            </div>

            <div className="flex items-center gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("tasks:preview.priority")}
              </dt>
              <dd className="truncate capitalize">
                {task.priority || t("tasks:preview.none")}
              </dd>
            </div>

            <div className="flex items-center gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("tasks:preview.dueDate")}
              </dt>
              <dd className="truncate">
                {task.dueDate
                  ? format(new Date(task.dueDate), "PP")
                  : t("tasks:preview.noDueDate")}
              </dd>
            </div>

            <div className="flex items-start gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {t("tasks:preview.labels")}
              </dt>
              <dd className="flex min-w-0 flex-wrap gap-1">
                {labels.length > 0 ? (
                  labels.map((label) => (
                    <span
                      key={label.id}
                      className="rounded border border-border/70 bg-muted/55 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {label.name}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">
                    {t("tasks:preview.none")}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default TaskHoverPreview;
