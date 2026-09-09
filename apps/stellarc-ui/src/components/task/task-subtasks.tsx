import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Link2, Plus, Search } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import CircularProgress from "@/components/ui/circular-progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from "@/components/ui/command";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import { useUpdateTaskStatus } from "@/hooks/mutations/task/use-update-task-status";
import useCreateTaskRelation from "@/hooks/mutations/task-relation/use-create-task-relation";
import useDeleteTaskRelation from "@/hooks/mutations/task-relation/use-delete-task-relation";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getColumnIcon } from "@/lib/column";
import { filterThenCapGroups, PICKER_GROUP_CAP } from "@/lib/picker-group-cap";
import { toast } from "@/lib/toast";
import { useSectionOpenState } from "@/lib/use-section-open-state";
import queryClient from "@/query-client";
import type Task from "@/types/task";
import SubtaskRow from "./subtask-row";

type TaskSubtasksProps = {
  taskId: string;
  boardId: string;
  organizationId: string;
};

export default function TaskSubtasks({
  taskId,
  boardId,
  organizationId,
}: TaskSubtasksProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // KFL-126: subtask creation uses the shared Create Task modal, seeded with
  // this ticket as the parent, instead of a bespoke inline title input.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  // Board side rail filter — parity with the other linking pickers (KFL-333).
  const [railBoardId, setRailBoardId] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: relations = [], isSuccess: relationsLoaded } =
    useGetTaskRelations(taskId);
  const { data: organization } = useActiveOrganization();
  const { data: organizationMembers } = useGetActiveOrganizationMembers(
    organization?.id ?? "",
  );
  const createRelation = useCreateTaskRelation();
  const { mutateAsync: deleteTaskRelation } = useDeleteTaskRelation(taskId);
  const { mutateAsync: deleteTask } = useDeleteTask();
  const { mutateAsync: updateTaskStatus } = useUpdateTaskStatus();
  const { data: columns = [] } = useGetColumns(boardId);
  // Subtask relations are organization-scoped server-side, so existing tasks
  // from any board in the organization can be linked as subtasks.
  const { data: organizationBoards } = useGetBoards({ organizationId });
  const { canManageTasks } = useOrganizationPermission();
  const canEdit = canManageTasks();

  // Map the completion checkbox to the board's actual column slugs (the API
  // validates status against columns). A subtask counts as completed when its
  // status is a final column.
  const doneSlug = columns.find((c) => c.isFinal)?.slug ?? "done";
  const todoSlug = columns.find((c) => !c.isFinal)?.slug ?? "to-do";
  const isCompleted = (status: string) =>
    columns.length > 0
      ? (columns.find((c) => c.slug === status)?.isFinal ?? false)
      : status === "done";

  const subtasks = relations
    .filter(
      (rel) => rel.relationType === "subtask" && rel.sourceTaskId === taskId,
    )
    .map((rel) => ({ relation: rel, task: rel.targetTask }))
    .filter(
      (item): item is typeof item & { task: NonNullable<typeof item.task> } =>
        item.task !== null,
    );

  const completedCount = subtasks.filter((s) =>
    isCompleted(s.task.status),
  ).length;
  const totalCount = subtasks.length;
  const hasSelection = selectedIds.size > 0;

  // Empty sections default to collapsed so a fresh task is not padded out by
  // two empty accordions (#73). Latched off the first loaded payload.
  const [isOpen, setIsOpen] = useSectionOpenState(
    totalCount > 0,
    relationsLoaded,
  );

  useEffect(() => {
    if (!linkOpen) {
      setLinkQuery("");
    }
  }, [linkOpen]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setFocusedIndex(-1);
  }, []);

  const buildTaskObject = (subtask: (typeof subtasks)[number]): Task => ({
    id: subtask.task.id,
    title: subtask.task.title,
    number: subtask.task.number,
    description: null,
    status: subtask.task.status,
    priority: subtask.task.priority,
    startDate: null,
    dueDate: null,
    position: null,
    createdAt: "",
    userId: subtask.task.userId,
    assigneeId: subtask.task.userId,
    assigneeName: subtask.task.assigneeName,
    boardId: subtask.task.boardId,
  });

  const getTargetTasks = (currentTask: Task): Task[] => {
    if (hasSelection && selectedIds.has(currentTask.id)) {
      return subtasks
        .filter((s) => selectedIds.has(s.task.id))
        .map(buildTaskObject);
    }
    return [currentTask];
  };

  const handleToggleComplete = async (taskObj: Task) => {
    try {
      await updateTaskStatus({
        ...taskObj,
        status: isCompleted(taskObj.status) ? todoSlug : doneSlug,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:popover.status.updateError"),
      );
    }
  };

  const getAssignee = (userId: string | null) => {
    if (!userId || !organizationMembers?.members) return null;
    return (
      organizationMembers.members.find((member) => member.userId === userId) ??
      null
    );
  };

  const getSelectionRadius = (index: number, isSelected: boolean) => {
    if (!isSelected) return "rounded-md";

    const prevSelected =
      index > 0 && selectedIds.has(subtasks[index - 1].task.id);
    const nextSelected =
      index < subtasks.length - 1 &&
      selectedIds.has(subtasks[index + 1].task.id);

    if (prevSelected && nextSelected) return "rounded-none";
    if (prevSelected) return "rounded-t-none rounded-b-md";
    if (nextSelected) return "rounded-t-md rounded-b-none";
    return "rounded-md";
  };

  // Keyboard navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container || totalCount === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, [contenteditable='true'], .ProseMirror",
        )
      )
        return;

      if (!container.contains(document.activeElement) && focusedIndex === -1)
        return;

      switch (e.key) {
        case "ArrowDown":
        case "j": {
          e.preventDefault();
          setFocusedIndex((prev) => (prev < totalCount - 1 ? prev + 1 : prev));
          break;
        }
        case "ArrowUp":
        case "k": {
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        }
        case " ": {
          if (focusedIndex >= 0 && focusedIndex < totalCount) {
            e.preventDefault();
            toggleSelection(subtasks[focusedIndex].task.id);
          }
          break;
        }
        case "Enter": {
          if (focusedIndex >= 0 && focusedIndex < totalCount) {
            e.preventDefault();
            navigate({
              to: "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
              params: {
                organizationSlug: organizationId,
                // Subtasks may live on another board; use the subtask's own board.
                boardSlug: subtasks[focusedIndex].task.boardId || boardId,
                taskId: subtasks[focusedIndex].task.id,
              },
            });
          }
          break;
        }
        case "Escape": {
          if (hasSelection) {
            e.preventDefault();
            clearSelection();
          } else if (focusedIndex >= 0) {
            e.preventDefault();
            setFocusedIndex(-1);
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    focusedIndex,
    totalCount,
    subtasks,
    hasSelection,
    clearSelection,
    navigate,
    organizationId,
    boardId,
    toggleSelection,
  ]);

  // Tasks eligible to become a subtask: every task in the organization except
  // this task, its existing subtasks, and tasks already related to it.
  const linkCandidates = useMemo(() => {
    const taken = new Set<string>([taskId]);
    for (const rel of relations) {
      taken.add(rel.sourceTaskId);
      taken.add(rel.targetTaskId);
    }

    const groups: Array<{
      value: string;
      label: string;
      items: Array<{
        id: string;
        title: string;
        number: number | null;
        status: string;
        boardId: string;
        boardSlug: string;
        boardName: string;
      }>;
    }> = [];

    for (const b of organizationBoards ?? []) {
      if (railBoardId !== "all" && b.id !== railBoardId) continue;
      const items: (typeof groups)[number]["items"] = [];
      for (const bucket of [
        (b as { tasks?: unknown }).tasks,
        (b as { plannedTasks?: unknown }).plannedTasks,
      ]) {
        if (!Array.isArray(bucket)) continue;
        for (const raw of bucket) {
          const tk = raw as {
            id: string;
            title: string;
            number: number | null;
            status: string;
          };
          if (!tk?.id || taken.has(tk.id)) continue;
          items.push({
            id: tk.id,
            title: tk.title,
            number: tk.number,
            status: tk.status,
            boardId: b.id,
            boardSlug: b.slug,
            boardName: b.name,
          });
        }
      }
      if (items.length) {
        groups.push({ value: b.id, label: b.name, items });
      }
    }

    // Current board first so the common case stays at the top.
    groups.sort((a, x) =>
      a.value === boardId ? -1 : x.value === boardId ? 1 : 0,
    );
    // Filter by the query FIRST, then cap rows per group: the palette mounts
    // every item as a DOM node, so uncapped orgs (1400+ tickets) lagged.
    return filterThenCapGroups(
      groups,
      linkQuery,
      (item) =>
        `${item.boardSlug}-${item.number} ${item.title} ${item.boardName}`,
      PICKER_GROUP_CAP,
    );
  }, [organizationBoards, relations, taskId, boardId, railBoardId, linkQuery]);

  const handleLinkExistingSubtask = async (targetTaskId: string) => {
    try {
      await createRelation.mutateAsync({
        sourceTaskId: taskId,
        targetTaskId,
        relationType: "subtask",
      });
      setLinkOpen(false);
      setLinkQuery("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:subtasks.createError"),
      );
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTaskId) return;
    try {
      await deleteTask(deleteTaskId);
      queryClient.invalidateQueries({ queryKey: ["tasks", boardId] });
      queryClient.invalidateQueries({ queryKey: ["task-relations", taskId] });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTaskId);
        return next;
      });
      toast.success(t("tasks:subtasks.deleteSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:subtasks.deleteError"),
      );
    } finally {
      setDeleteTaskId(null);
    }
  };

  /**
   * Removes the parent/subtask link only. The subtask itself is untouched and
   * stays on its board — this is deliberately not a delete.
   */
  const handleUnlink = async (relationId: string) => {
    try {
      await deleteTaskRelation(relationId);
      queryClient.invalidateQueries({ queryKey: ["task-relations", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", boardId] });
      toast.success(t("tasks:subtasks.unlinkSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:subtasks.unlinkError"),
      );
    }
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                <span>{t("tasks:subtasks.title")}</span>
              </button>
            </CollapsibleTrigger>
            {totalCount > 0 && (
              <span className="flex items-center gap-1.5 ml-0.5">
                <CircularProgress
                  completed={completedCount}
                  total={totalCount}
                />
                <span className="text-xs text-muted-foreground">
                  {completedCount}/{totalCount}
                </span>
              </span>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                title={t("tasks:subtasks.linkExisting")}
                onClick={() => setLinkOpen(true)}
              >
                <Link2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                data-testid="subtask-create-trigger"
                title={t("tasks:subtasks.addAction")}
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        <CollapsibleContent>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard nav managed via document listener */}
          <div
            ref={containerRef}
            className="flex flex-col mt-1"
            onMouseDown={() => {
              if (focusedIndex === -1 && !hasSelection) {
                setFocusedIndex(0);
              }
            }}
          >
            <AnimatePresence initial={false}>
              {subtasks.map((subtask, index) => {
                const taskObj = buildTaskObject(subtask);
                const isSelected = selectedIds.has(subtask.task.id);

                return (
                  <SubtaskRow
                    key={subtask.task.id}
                    task={taskObj}
                    tasks={getTargetTasks(taskObj)}
                    boardId={subtask.task.boardId || boardId}
                    organizationId={organization?.id ?? organizationId}
                    isSelected={isSelected}
                    isFocused={focusedIndex === index}
                    isCompleted={isCompleted(subtask.task.status)}
                    canEdit={canEdit}
                    selectionRadius={getSelectionRadius(index, isSelected)}
                    assignee={getAssignee(subtask.task.userId)}
                    onToggleComplete={() => handleToggleComplete(taskObj)}
                    onNavigate={() =>
                      navigate({
                        to: "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
                        params: {
                          organizationSlug: organizationId,
                          boardSlug: subtask.task.boardId || boardId,
                          taskId: subtask.task.id,
                        },
                      })
                    }
                    onDeleteClick={() => setDeleteTaskId(subtask.task.id)}
                    onUnlink={() => handleUnlink(subtask.relation.id)}
                  />
                );
              })}
            </AnimatePresence>
          </div>

          {totalCount === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">
              {t("tasks:subtasks.empty")}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/*
        KFL-126: the same Create Task modal used from the board/list views,
        with this ticket seeded as the parent. The modal itself creates the
        `subtask` relation on submit, so the child really lands under this
        ticket.
      */}
      <CreateTaskModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        boardId={boardId}
        initialParentTaskId={taskId}
      />

      <AlertDialog
        open={!!deleteTaskId}
        onOpenChange={(open) => !open && setDeleteTaskId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tasks:subtasks.deleteDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks:subtasks.deleteDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteTask}
                />
              }
            >
              {t("tasks:subtasks.deleteAction")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CommandDialog open={linkOpen} onOpenChange={setLinkOpen}>
        <CommandDialogPopup className="h-105 max-w-3xl">
          {/* Two-pane board rail + palette layout, parity with the other
              linking pickers (KFL-333). */}
          <div className="grid min-h-0 flex-1 overflow-hidden sm:grid-cols-[12rem_1fr]">
            <nav
              aria-label="Boards"
              className="flex min-h-0 gap-1 overflow-x-auto border-b p-2 sm:block sm:overflow-y-auto sm:overflow-x-visible sm:border-r sm:border-b-0"
            >
              {[
                { id: "all", name: t("tasks:relations.allBoards") },
                ...(organizationBoards ?? []),
              ].map((board) => (
                <button
                  aria-pressed={railBoardId === board.id}
                  className={`flex h-9 shrink-0 items-center rounded-md px-3 text-left text-sm sm:w-full ${
                    railBoardId === board.id
                      ? "bg-accent font-medium"
                      : "hover:bg-accent/60"
                  }`}
                  data-testid={`subtask-picker-rail-${board.id}`}
                  key={board.id}
                  onClick={() => setRailBoardId(board.id)}
                  type="button"
                >
                  <span className="truncate">{board.name}</span>
                </button>
              ))}
            </nav>
            <div className="flex min-h-0 min-w-0 flex-col">
              <Command items={linkCandidates}>
                <CommandInput
                  placeholder={t("tasks:subtasks.searchPlaceholder")}
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                />
                <CommandPanel className="flex-1 overflow-y-auto">
                  <CommandEmpty>
                    <div className="text-center py-6">
                      <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {t("tasks:relations.noTasksFound")}
                      </p>
                    </div>
                  </CommandEmpty>
                  <CommandList>
                    {(
                      group: (typeof linkCandidates)[number],
                      groupIndex: number,
                    ) => (
                      <Fragment key={group.value}>
                        <CommandGroup items={group.items}>
                          <CommandGroupLabel>{group.label}</CommandGroupLabel>
                          <CommandCollection>
                            {(item: (typeof group.items)[number]) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.boardSlug}-${item.number} ${item.title} ${item.boardName}`}
                                onClick={() =>
                                  handleLinkExistingSubtask(item.id)
                                }
                                className="flex items-center gap-3 py-2"
                              >
                                <span
                                  className="shrink-0"
                                  data-testid={`subtask-status-icon-${item.id}`}
                                  title={item.status}
                                >
                                  {getColumnIcon(item.status, false, null)}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0 font-mono">
                                  {item.boardSlug}-{item.number}
                                </span>
                                <span className="text-sm truncate flex-1">
                                  {item.title}
                                </span>
                              </CommandItem>
                            )}
                          </CommandCollection>
                        </CommandGroup>
                        {groupIndex < linkCandidates.length - 1 && (
                          <CommandSeparator />
                        )}
                      </Fragment>
                    )}
                  </CommandList>
                </CommandPanel>
                <CommandFooter>
                  <span className="text-muted-foreground/60">
                    {t("tasks:subtasks.linkExistingHint")}
                  </span>
                </CommandFooter>
              </Command>
            </div>
          </div>
        </CommandDialogPopup>
      </CommandDialog>
    </>
  );
}
