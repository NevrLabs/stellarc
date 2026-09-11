import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import useCreateTaskRelation from "@/hooks/mutations/task-relation/use-create-task-relation";
import useDeleteTaskRelation from "@/hooks/mutations/task-relation/use-delete-task-relation";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getColumnIcon } from "@/lib/column";
import { getInitials } from "@/lib/get-initials";
import { filterThenCapGroups, PICKER_GROUP_CAP } from "@/lib/picker-group-cap";
import { toast } from "@/lib/toast";
import { useSectionOpenState } from "@/lib/use-section-open-state";
import type Task from "@/types/task";
import {
  type RelationIntent,
  relationDisplayType,
  relationPayload,
} from "./relation-direction";
import SubtaskAssigneePopover from "./subtask-assignee-popover";
import SubtaskStatusPopover from "./subtask-status-popover";

type TaskRelationsProps = {
  taskId: string;
  boardId: string;
  organizationId: string;
};

type TaskItem = {
  id: string;
  title: string;
  number: number | null;
  status: string;
  boardId: string;
  boardName: string;
  boardSlug: string;
};

type TaskGroup = {
  value: string;
  label: string;
  items: TaskItem[];
};

export default function TaskRelations({
  taskId,
  boardId,
  organizationId,
}: TaskRelationsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Board side rail filter, mirroring the other linking pickers (KFL-333).
  const [railBoardId, setRailBoardId] = useState("all");
  const [selectedRelationType, setSelectedRelationType] =
    useState<RelationIntent>("related");

  const { data: relations = [], isSuccess: relationsLoaded } =
    useGetTaskRelations(taskId);
  const { data: boardData } = useGetTasks(boardId);
  // Relations are organization-scoped server-side, so the picker offers tasks
  // from every board in the organization, not just the current one.
  const { data: organizationBoards } = useGetBoards({ organizationId });
  const { data: organization } = useActiveOrganization();
  const { data: organizationMembers } = useGetActiveOrganizationMembers(
    organization?.id ?? "",
  );
  const createRelation = useCreateTaskRelation();
  const deleteRelation = useDeleteTaskRelation(taskId);
  const { canManageTasks } = useOrganizationPermission();
  const canEdit = canManageTasks();

  useEffect(() => {
    if (!commandOpen) {
      setSearchQuery("");
    }
  }, [commandOpen]);

  const nonSubtaskRelations = relations.filter(
    (rel) => rel.relationType !== "subtask",
  );

  const groupedRelations = useMemo(() => {
    const groups: Record<
      string,
      Array<{
        id: string;
        relationType: string;
        task: NonNullable<(typeof nonSubtaskRelations)[number]["sourceTask"]>;
      }>
    > = {};

    for (const rel of nonSubtaskRelations) {
      const isSource = rel.sourceTaskId === taskId;
      const linkedTask = isSource ? rel.targetTask : rel.sourceTask;
      if (!linkedTask) continue;

      // "blocks" is directional: when the current task is the target it is the
      // one being blocked, so group it under a distinct "blocked_by" key.
      const type = relationDisplayType({
        currentTaskId: taskId,
        sourceTaskId: rel.sourceTaskId,
        relationType: rel.relationType,
      });
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push({
        id: rel.id,
        relationType: rel.relationType,
        task: linkedTask,
      });
    }

    return groups;
  }, [nonSubtaskRelations, taskId]);

  const existingRelatedTaskIds = new Set(
    nonSubtaskRelations.flatMap((rel) => [rel.sourceTaskId, rel.targetTaskId]),
  );
  existingRelatedTaskIds.add(taskId);

  const allTasks = useMemo(() => {
    const tasks: TaskItem[] = [];
    if (!organizationBoards) return tasks;

    for (const b of organizationBoards) {
      // Board payloads carry `tasks` (active), plus archived/planned buckets.
      const buckets = [
        (b as { tasks?: unknown }).tasks,
        (b as { plannedTasks?: unknown }).plannedTasks,
      ];
      for (const bucket of buckets) {
        if (!Array.isArray(bucket)) continue;
        for (const raw of bucket) {
          const tk = raw as {
            id: string;
            title: string;
            number: number | null;
            status: string;
          };
          if (!tk?.id) continue;
          tasks.push({
            id: tk.id,
            title: tk.title,
            number: tk.number,
            status: tk.status,
            boardId: b.id,
            boardName: b.name,
            boardSlug: b.slug,
          });
        }
      }
    }

    return tasks;
  }, [organizationBoards]);

  const boardNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of organizationBoards ?? []) {
      map.set(b.id, b.name);
    }
    return map;
  }, [organizationBoards]);

  const finalStatusSlugs = useMemo(() => {
    if (!boardData) return new Set<string>();
    if ("columns" in boardData && Array.isArray(boardData.columns)) {
      return new Set(
        (boardData.columns as Array<{ id: string; isFinal?: boolean }>)
          .filter((col) => col.isFinal)
          .map((col) => col.id),
      );
    }
    return new Set<string>();
  }, [boardData]);

  const columnIconBySlug = useMemo(() => {
    const icons = new Map<string, string | null | undefined>();
    if (!boardData) return icons;
    if ("columns" in boardData && Array.isArray(boardData.columns)) {
      for (const col of boardData.columns as Array<{
        id: string;
        icon?: string | null;
      }>) {
        icons.set(col.id, col.icon);
      }
    }
    return icons;
  }, [boardData]);

  const filteredTasks = allTasks.filter(
    (t) =>
      !existingRelatedTaskIds.has(t.id) &&
      (railBoardId === "all" || t.boardId === railBoardId),
  );

  const commandGroups = useMemo<TaskGroup[]>(() => {
    // Group by board so cross-board links are explicit; current board first.
    const byBoard = new Map<string, TaskItem[]>();
    for (const item of filteredTasks) {
      const list = byBoard.get(item.boardId);
      if (list) {
        list.push(item);
      } else {
        byBoard.set(item.boardId, [item]);
      }
    }

    const groups: TaskGroup[] = [];
    const current = byBoard.get(boardId);
    if (current?.length) {
      groups.push({
        value: boardId,
        label: t("tasks:relations.tasksInBoard"),
        items: current,
      });
    }

    for (const [bId, items] of byBoard) {
      if (bId === boardId || !items.length) continue;
      groups.push({
        value: bId,
        label: items[0]?.boardName ?? bId,
        items,
      });
    }

    // Filter by query first, then cap per group — the palette mounts every
    // row as DOM, which lagged with 1400+ org tickets (KFL-333 perf).
    return filterThenCapGroups(
      groups,
      searchQuery,
      (item) =>
        `${item.boardSlug}-${item.number} ${item.title} ${item.boardName}`,
      PICKER_GROUP_CAP,
    );
  }, [filteredTasks, boardId, t, searchQuery]);

  const handleLinkTask = async (selectedTaskId: string) => {
    try {
      /*
        Persist one canonical directional edge: source BLOCKS target.
        "Blocked by" is UI intent, not another database relation type, so it
        reverses the endpoints. Both task relation queries are invalidated by
        the mutation hook; each drawer then derives its reciprocal label from
        whether the current ticket is source or target.
      */
      await createRelation.mutateAsync(
        relationPayload({
          currentTaskId: taskId,
          selectedTaskId,
          intent: selectedRelationType,
        }),
      );
      setCommandOpen(false);
      setSearchQuery("");
    } catch {
      toast.error(t("tasks:relations.linkError"));
    }
  };

  const handleRemoveRelation = (relationId: string) => {
    deleteRelation.mutate(relationId);
  };

  const handleNavigateToTask = (
    linkedTaskId: string,
    linkedBoardId?: string,
  ) => {
    // Linked tasks can live on another board, so navigate using the task's own
    // boardId. Falling back to the current board would produce a broken URL.
    navigate({
      to: "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
      params: {
        organizationSlug: organizationId,
        boardSlug: linkedBoardId || boardId,
        taskId: linkedTaskId,
      },
    });
  };

  const getAssignee = (userId: string | null) => {
    if (!userId || !organizationMembers?.members) return null;
    return organizationMembers.members.find(
      (member) => member.userId === userId,
    );
  };

  const buildTaskObject = (item: {
    task: NonNullable<(typeof nonSubtaskRelations)[number]["sourceTask"]>;
  }): Task => ({
    id: item.task.id,
    title: item.task.title,
    number: item.task.number,
    description: null,
    status: item.task.status,
    priority: item.task.priority,
    startDate: null,
    dueDate: null,
    position: null,
    createdAt: "",
    updatedAt: "",
    userId: item.task.userId,
    assigneeId: item.task.userId,
    assigneeName: item.task.assigneeName,
    assigneeImage: "",
    boardId: item.task.boardId,
  });

  const totalCount = nonSubtaskRelations.length;

  // Empty sections default to collapsed (#73), latched off the first payload.
  const [isOpen, setIsOpen] = useSectionOpenState(
    totalCount > 0,
    relationsLoaded,
  );

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
                <span>{t("tasks:relations.title")}</span>
              </button>
            </CollapsibleTrigger>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {totalCount}
              </span>
            )}
          </div>
          {canEdit && (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => setCommandOpen(true)}
            >
              <Plus className="size-3.5" />
            </Button>
          )}
        </div>

        <CollapsibleContent>
          {Object.entries(groupedRelations).map(([type, items]) => (
            <div key={type} className="mt-1.5">
              <span className="text-[11px] text-muted-foreground/70 px-2">
                {t(`tasks:relations.types.${type}`, {
                  defaultValue: type.replace(/_/g, " "),
                })}
              </span>
              <div className="flex flex-col mt-0.5">
                {items.map((item) => {
                  const assignee = getAssignee(item.task.userId);
                  const taskObj = buildTaskObject(item);

                  return (
                    <ContextMenu key={item.id}>
                      <ContextMenuTrigger asChild>
                        <div className="group flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/50 transition-colors cursor-default">
                          <SubtaskStatusPopover
                            tasks={[taskObj]}
                            boardId={boardId}
                          >
                            <button
                              type="button"
                              className="shrink-0 flex items-center justify-center rounded p-0.5 transition-colors outline-none [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground"
                            >
                              {getColumnIcon(
                                item.task.status,
                                finalStatusSlugs.has(item.task.status),
                                columnIconBySlug.get(item.task.status),
                              )}
                            </button>
                          </SubtaskStatusPopover>

                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left outline-none"
                            onClick={() =>
                              handleNavigateToTask(
                                item.task.id,
                                item.task.boardId,
                              )
                            }
                          >
                            <span
                              className={`text-sm truncate block ${finalStatusSlugs.has(item.task.status) ? "line-through text-muted-foreground" : "text-foreground/90"}`}
                            >
                              {item.task.title}
                            </span>
                            {item.task.boardId !== boardId && (
                              <span className="text-[10px] font-mono text-muted-foreground/70">
                                {boardNameById.get(item.task.boardId) ??
                                  t("tasks:relations.otherBoard")}
                              </span>
                            )}
                          </button>

                          <SubtaskAssigneePopover
                            tasks={[taskObj]}
                            organizationId={organizationId}
                          >
                            <button
                              type="button"
                              className="shrink-0 flex items-center justify-center rounded p-0.5 transition-colors outline-none"
                            >
                              {item.task.userId && assignee ? (
                                <Avatar
                                  className={`h-5 w-5 ${getAvatarTone(item.task.userId, assignee?.user?.email)}`}
                                >
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

                      <ContextMenuContent className="w-40">
                        <ContextMenuItem
                          onClick={() =>
                            handleNavigateToTask(
                              item.task.id,
                              item.task.boardId,
                            )
                          }
                        >
                          <span>{t("tasks:relations.openTask")}</span>
                        </ContextMenuItem>
                        {canEdit && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              className="text-destructive"
                              onClick={() => handleRemoveRelation(item.id)}
                            >
                              <span>{t("tasks:relations.removeRelation")}</span>
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            </div>
          ))}

          {totalCount === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">
              {t("tasks:relations.empty")}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandDialogPopup className="h-105 max-w-3xl">
          {/* Board rail + palette, the same two-pane layout as the repo and
              issue/PR pickers (KFL-333). Command renders no DOM node, so it
              needs a real flex cell to keep the panel in the right column. */}
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
                  data-testid={`relation-picker-rail-${board.id}`}
                  key={board.id}
                  onClick={() => setRailBoardId(board.id)}
                  type="button"
                >
                  <span className="truncate">{board.name}</span>
                </button>
              ))}
            </nav>
            <div className="flex min-h-0 min-w-0 flex-col">
              <Command items={commandGroups}>
                <CommandInput
                  placeholder={t("tasks:relations.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
                    {(group: TaskGroup, groupIndex: number) => (
                      <Fragment key={group.value}>
                        <CommandGroup items={group.items}>
                          <CommandGroupLabel>{group.label}</CommandGroupLabel>
                          <CommandCollection>
                            {(item: TaskItem) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.boardSlug}-${item.number} ${item.title} ${item.boardName}`}
                                onClick={() => handleLinkTask(item.id)}
                                className="flex items-center gap-3 py-2"
                              >
                                {getColumnIcon(
                                  item.status,
                                  false,
                                  columnIconBySlug.get(item.status),
                                )}
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
                        {groupIndex < commandGroups.length - 1 && (
                          <CommandSeparator />
                        )}
                      </Fragment>
                    )}
                  </CommandList>
                </CommandPanel>
                <CommandFooter>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${selectedRelationType === "related" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setSelectedRelationType("related")}
                    >
                      <Link2 className="size-3" />
                      {t("tasks:relations.related")}
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${selectedRelationType === "blocks" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setSelectedRelationType("blocks")}
                    >
                      <X className="size-3" />
                      {t("tasks:relations.blocks")}
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${selectedRelationType === "blocked_by" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setSelectedRelationType("blocked_by")}
                    >
                      <X className="size-3" />
                      {t("tasks:relations.blockedBy")}
                    </button>
                  </div>
                  <span className="text-muted-foreground/60">
                    {t("tasks:relations.selectTask")}
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
