import { produce } from "immer";
import { Archive, Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";

import { useBulkOperations } from "@/hooks/mutations/task/use-bulk-operations";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getColumnIcon } from "@/lib/column";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";
import type { BoardWithTasks } from "@/types/board";
import { ArchiveTasksModal } from "../../shared/modals/archive-tasks-modal";

const CreateTaskModal = lazy(
  () => import("@/components/shared/modals/create-task-modal"),
);

type ColumnHeaderProps = {
  column: BoardWithTasks["columns"][number];
};

export function ColumnHeader({ column }: ColumnHeaderProps) {
  const { t } = useTranslation();
  const { board, setBoard } = useBoardStore();
  const { bulkArchive } = useBulkOperations();
  const { canManageTasks, canCreateTasks } = useOrganizationPermission();
  const canTask = canManageTasks();
  const canCreate = canCreateTasks();

  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const handleConfirmArchive = () => {
    if (!column.isFinal || !board) return;

    const taskIds = column.tasks.map((task) => task.id);

    /*
      #226: archival writes `task.archived_at` and leaves `status` alone, so a
      Done ticket stays Done while archived. This used to loop `updateTask` with
      `status: "archived"`, which now fails validation because "archived" is not
      a status — the whole action 400'd.
    */
    const updatedBoard = produce(board, (draft) => {
      const archivedColumn = draft?.columns?.find(
        (col) => col.id === column.id,
      );
      if (!archivedColumn) return;
      archivedColumn.tasks = [];
    });

    if (taskIds.length === 0) {
      setIsArchiveModalOpen(false);
      return;
    }

    setBoard(updatedBoard);

    bulkArchive(taskIds)
      .then(() => {
        toast.success(t("tasks:archive.success", { count: taskIds.length }));
      })
      .catch(() => {
        // put the column back: the server rejected the archive
        setBoard(board);
        toast.error(t("tasks:archive.error"));
      });

    setIsArchiveModalOpen(false);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground">
          {getColumnIcon(column.id, column.isFinal, column.icon)}
        </span>
        <span className="truncate text-sm font-medium text-foreground/95">
          {column.name}
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {column.tasks.length}
        </span>
      </div>

      <div className="flex items-center">
        {canTask && column.isFinal && column.tasks.length > 0 && (
          <button
            type="button"
            onClick={() => setIsArchiveModalOpen(true)}
            className="flex items-center rounded-md px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-accent/50"
            title={t("tasks:listView.archiveAllTooltip")}
          >
            <Archive className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        {canCreate && (
          <button
            type="button"
            onClick={() => setIsTaskModalOpen(true)}
            className="flex items-center rounded-md px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-accent/50"
            title={t("tasks:kanban.addTask")}
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {isTaskModalOpen && (
        <Suspense fallback={<span className="sr-only">Loading editor</span>}>
          <CreateTaskModal
            open
            onClose={() => setIsTaskModalOpen(false)}
            boardId={board?.id}
            status={column.id}
          />
        </Suspense>
      )}

      <ArchiveTasksModal
        open={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        onConfirm={handleConfirmArchive}
        taskCount={column.tasks.length}
      />
    </div>
  );
}
