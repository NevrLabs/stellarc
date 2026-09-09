import TaskFlagSection from "@/components/flag/task-flag-section";
import TaskSyncedIssueProperty from "./task-synced-issue-property";
import TaskTopbarMilestone from "./task-topbar-milestone";

type TaskTopbarControlsProps = {
  taskId: string;
  boardId: string;
  organizationId: string;
};

export default function TaskTopbarControls({
  taskId,
  boardId,
  organizationId,
}: TaskTopbarControlsProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-testid="task-topbar-controls"
    >
      <TaskTopbarMilestone taskId={taskId} boardId={boardId} />
      <TaskFlagSection
        taskId={taskId}
        boardId={boardId}
        organizationId={organizationId}
      />
      <TaskSyncedIssueProperty
        compact
        organizationId={organizationId}
        taskId={taskId}
      />
    </div>
  );
}
