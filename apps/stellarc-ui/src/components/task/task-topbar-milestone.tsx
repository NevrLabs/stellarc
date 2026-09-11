import useGetTask from "@/hooks/queries/task/use-get-task";
import TaskMilestonePicker from "./task-milestone-picker";

type TaskTopbarMilestoneProps = {
  taskId: string;
  boardId: string;
};

/**
 * Milestone control for the task-detail topbar. It used to live in the
 * right-hand properties sidebar; the topbar keeps it visible while the sidebar
 * is collapsed.
 */
export default function TaskTopbarMilestone({
  taskId,
  boardId,
}: TaskTopbarMilestoneProps) {
  const { data: task } = useGetTask(taskId);
  const resolvedBoardId = task?.boardId ?? boardId;
  const milestoneId =
    (task as { milestoneId?: string | null } | undefined)?.milestoneId ?? null;

  if (!taskId) return null;

  return (
    <div
      data-testid="task-topbar-milestone"
      data-slot="task-topbar-milestone"
      className="flex min-w-0 items-center gap-1.5"
    >
      {/*
        #258 follow-up: this used to render a read-only MilestoneBadge next to
        the picker, but the picker trigger *already* shows the milestone name,
        so the header printed the same milestone twice. The picker is the single
        source of truth — it shows the name and can also change it.
      */}
      <TaskMilestonePicker
        taskId={taskId}
        boardId={resolvedBoardId}
        milestoneId={milestoneId}
      />
    </div>
  );
}
