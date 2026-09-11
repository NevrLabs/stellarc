import { useNavigate } from "@tanstack/react-router";
import { ArrowRightLeft } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMoveTask } from "@/hooks/mutations/task/use-move-task";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { cn } from "@/lib/cn";
import { getStatusLabel } from "@/lib/i18n/domain";
import type Task from "@/types/task";

type TaskMovePopoverProps = {
  task: Task;
  organizationId: string;
  triggerClassName?: string;
};

export default function TaskMovePopover({
  task,
  organizationId,
  triggerClassName,
}: TaskMovePopoverProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const { data: boards = [] } = useGetBoards({ organizationId });
  const { mutateAsync: moveTask, isPending: isMovePending } = useMoveTask();
  const destinationBoardId = selectedBoardId || "";
  const {
    data: destinationBoard,
    isLoading: isBoardLoading,
    isError: isBoardError,
  } = useGetTasks(destinationBoardId);

  const destinationBoards = useMemo(
    () => boards.filter((board) => board.id !== task.boardId),
    [boards, task.boardId],
  );

  const selectedBoard = useMemo(
    () => destinationBoards.find((p) => p.id === selectedBoardId),
    [destinationBoards, selectedBoardId],
  );

  const destinationColumns = destinationBoard?.columns ?? [];
  const canKeepCurrentStatus = destinationColumns.some(
    (column) => column.id === task.status,
  );
  const fallbackStatus = destinationColumns[0]?.id ?? "";
  const effectiveStatus = canKeepCurrentStatus
    ? task.status
    : selectedStatus || fallbackStatus;

  const selectedStatusLabel = useMemo(() => {
    if (!effectiveStatus || destinationColumns.length === 0) return null;
    const column = destinationColumns.find((c) => c.id === effectiveStatus);
    return column?.name || getStatusLabel(effectiveStatus) || null;
  }, [destinationColumns, effectiveStatus]);

  useEffect(() => {
    if (!open) {
      setSelectedBoardId("");
      setSelectedStatus("");
    }
  }, [open]);

  useEffect(() => {
    if (!selectedBoardId) {
      setSelectedStatus("");
      return;
    }

    if (canKeepCurrentStatus) {
      setSelectedStatus(task.status);
      return;
    }

    setSelectedStatus(fallbackStatus);
  }, [canKeepCurrentStatus, fallbackStatus, selectedBoardId, task.status]);

  const handleMove = async () => {
    if (!selectedBoardId || !effectiveStatus) return;

    try {
      const result = await moveTask({
        taskId: task.id,
        destinationBoardId: selectedBoardId,
        destinationStatus: effectiveStatus,
      });

      setOpen(false);
      startTransition(() => {
        navigate({
          to: "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
          params: {
            organizationSlug: organizationId,
            boardSlug: result.task.boardId,
            taskId: task.id,
          },
        });
      });
    } catch {
      // toast is handled by useMoveTask's onError
    }
  };

  if (destinationBoards.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("text-foreground", triggerClassName)}
          title={t("tasks:move.title")}
          aria-label={t("tasks:move.title")}
        >
          <ArrowRightLeft className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end" sideOffset={4}>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">
            {t("tasks:move.title")}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("tasks:move.boardLabel")}
            </Label>
            <Select
              value={selectedBoardId}
              onValueChange={(value) => setSelectedBoardId(String(value ?? ""))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("tasks:move.boardPlaceholder")}>
                  {selectedBoard?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {destinationBoards.map((board) => (
                  <SelectItem key={board.id} value={board.id}>
                    {board.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedBoardId && isBoardLoading && (
            <div className="flex items-center justify-center py-2">
              <span className="text-xs text-muted-foreground">
                {t("tasks:move.statusLabel")}…
              </span>
            </div>
          )}

          {selectedBoardId && isBoardError && (
            <p className="text-xs text-destructive">{t("tasks:move.error")}</p>
          )}

          {selectedBoardId &&
            !isBoardLoading &&
            !isBoardError &&
            destinationColumns.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("tasks:move.statusLabel")}
                </Label>
                <Select
                  value={effectiveStatus || undefined}
                  onValueChange={(value) =>
                    setSelectedStatus(String(value ?? ""))
                  }
                  disabled={canKeepCurrentStatus}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{selectedStatusLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {destinationColumns.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.name || getStatusLabel(column.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {canKeepCurrentStatus
                    ? t("tasks:move.statusHintKeep")
                    : t("tasks:move.statusHintAdjust")}
                </p>
              </div>
            )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleMove()}
            disabled={
              !selectedBoardId ||
              !effectiveStatus ||
              isMovePending ||
              isPending ||
              isBoardLoading ||
              isBoardError
            }
            className="w-full font-medium"
          >
            {t("tasks:move.action")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
