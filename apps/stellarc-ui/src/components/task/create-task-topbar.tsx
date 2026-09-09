import { useQuery } from "@tanstack/react-query";
import { Check, Milestone, Search, Workflow, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getApiUrl } from "@/fetchers/get-api-url";
import type { Milestone as MilestoneRow } from "@/fetchers/milestone/get-milestones-by-board";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useGetMilestonesByBoard from "@/hooks/queries/milestone/use-get-milestones-by-board";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGlobalSearch from "@/hooks/queries/search/use-global-search";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { cn } from "@/lib/cn";
import {
  buildParentOptions,
  formatParentLabel,
  type ParentOption,
} from "./parent-task-options";

export type CreateTaskTopbarProps = {
  boardId: string;
  milestoneId: string | null;
  onMilestoneChange: (milestoneId: string | null) => void;
  parentTaskId: string | null;
  onParentTaskChange: (taskId: string | null) => void;
  disabled?: boolean;
};

type PickableTask = {
  id: string;
  title: string;
  number: number | null;
};

function tasksFromBoard(data: unknown): PickableTask[] {
  const source = data as
    | {
        columns?: Array<{ tasks?: PickableTask[] }>;
        plannedTasks?: PickableTask[];
      }
    | undefined;
  return [
    ...(source?.columns ?? []).flatMap((column) => column.tasks ?? []),
    ...(source?.plannedTasks ?? []),
  ];
}

/**
 * Topbar row for the create-task modal: pick the milestone and the parent task
 * before the task exists. Both are applied after creation (milestone via the
 * board-scoped milestone assign endpoint, parent via a `subtask` task relation).
 */
export default function CreateTaskTopbar({
  boardId,
  milestoneId,
  onMilestoneChange,
  parentTaskId,
  onParentTaskChange,
  disabled = false,
}: CreateTaskTopbarProps) {
  const { t } = useTranslation();
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const [parentBoardId, setParentBoardId] = useState("all");

  const { data: milestones = [] } = useGetMilestonesByBoard(boardId);
  const { data: boardData } = useGetTasks(boardId);

  const selectedMilestone = milestones.find(
    (milestone: MilestoneRow) => milestone.id === milestoneId,
  );

  const selectableMilestones = milestones.filter(
    (milestone: MilestoneRow) =>
      milestone.status !== "archived" || milestone.id === milestoneId,
  );

  const boardTasks = useMemo(() => tasksFromBoard(boardData), [boardData]);

  /*
   * #154: parents may live on other boards, so once the user types we also
   * query the organization-wide search. Skipped while the query is empty —
   * the board's own tickets are the sensible default.
   */
  const { data: activeOrganization } = useActiveOrganization();
  const { data: boards = [] } = useGetBoards({
    organizationId: activeOrganization?.id ?? "",
  });
  const candidates = useQuery<
    Array<
      PickableTask & { boardId: string; boardName: string; boardSlug: string }
    >
  >({
    queryKey: ["parent-candidates", activeOrganization?.id],
    enabled: parentOpen && Boolean(activeOrganization?.id),
    queryFn: async () => {
      const response = await fetch(
        getApiUrl(`task/parent-candidates/${activeOrganization?.id}`),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load parent candidates");
      return response.json();
    },
    staleTime: 5 * 60_000,
  });
  const allBoardOptions = (candidates.data ?? []).map((task) => ({
    ...task,
    crossBoard: task.boardId !== boardId,
  }));
  const { data: searchData } = useGlobalSearch({
    q: parentSearch.trim().length > 1 ? parentSearch.trim() : "",
    type: "tasks",
    // The API requires an organization scope; without it the request 400s and
    // no cross-board results ever arrive.
    organizationId: activeOrganization?.id,
    limit: 20,
  });

  const [pinnedParent, setPinnedParent] = useState<ParentOption | null>(null);

  const parentOptions = useMemo(
    () =>
      buildParentOptions({
        boardTasks,
        searchResults: [
          ...allBoardOptions.map((option) => ({
            id: option.id,
            title: option.title,
            taskNumber: option.number,
            boardId: option.crossBoard ? "other" : boardId,
            boardSlug: option.boardSlug,
          })),
          ...(searchData?.results ?? []),
        ],
        selectedId: parentTaskId,
        selectedOption: pinnedParent,
        query: parentSearch,
        currentBoardId: boardId,
      }),
    [
      boardTasks,
      allBoardOptions,
      searchData,
      parentTaskId,
      pinnedParent,
      parentSearch,
      boardId,
    ],
  );

  const visibleParentOptions = parentOptions.filter((option) => {
    const term = parentSearch.trim().toLowerCase();
    if (
      term &&
      !option.title.toLowerCase().includes(term) &&
      !String(option.number ?? "").includes(term)
    )
      return false;
    if (parentBoardId === "all") return true;
    if (parentBoardId === boardId) return !option.crossBoard;
    return (
      option.boardSlug ===
      boards.find((board) => board.id === parentBoardId)?.slug
    );
  });

  const selectedParent =
    parentOptions.find((option) => option.id === parentTaskId) ?? null;

  return (
    <div
      data-testid="create-task-topbar"
      data-slot="create-task-topbar"
      className="flex flex-wrap items-center gap-1.5"
    >
      <Popover open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              data-testid="create-task-milestone-trigger"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={t("tasks:milestone.title")}
              className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            >
              <Milestone className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-32 truncate text-xs font-medium">
                {selectedMilestone
                  ? selectedMilestone.name
                  : t("tasks:milestone.none")}
              </span>
            </Button>
          }
        />
        <PopoverContent className="w-64 p-0" align="start">
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              data-testid="create-task-milestone-clear"
              onClick={() => {
                onMilestoneChange(null);
                setMilestoneOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <X className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{t("tasks:milestone.clear")}</span>
            </button>
            {selectableMilestones.length === 0 && (
              <p
                data-testid="create-task-milestone-empty"
                className="px-2 py-1.5 text-xs text-muted-foreground"
              >
                {t("tasks:milestone.empty")}
              </p>
            )}
            {selectableMilestones.map((milestone: MilestoneRow) => (
              <button
                key={milestone.id}
                type="button"
                data-testid={`create-task-milestone-option-${milestone.id}`}
                onClick={() => {
                  onMilestoneChange(
                    milestone.id === milestoneId ? null : milestone.id,
                  );
                  setMilestoneOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    milestone.id === milestoneId ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{milestone.name}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={parentOpen} onOpenChange={setParentOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              data-testid="create-task-parent-trigger"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={t("tasks:parentTask.title")}
              className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            >
              <Workflow className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-40 truncate text-xs font-medium">
                {selectedParent
                  ? formatParentLabel(selectedParent)
                  : t("tasks:parentTask.none")}
              </span>
            </Button>
          }
        />
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{t("tasks:parentTask.title")}</DialogTitle>
            <DialogDescription>
              {t("tasks:parentTask.searchPlaceholder")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-96 sm:grid-cols-[12rem_1fr]">
            <nav
              aria-label="Boards"
              className="flex gap-1 overflow-x-auto border-b p-2 sm:block sm:overflow-x-visible sm:border-r sm:border-b-0"
            >
              {[{ id: "all", name: "All" }, ...boards].map((board) => (
                <button
                  aria-pressed={parentBoardId === board.id}
                  className={cn(
                    "flex h-9 shrink-0 items-center rounded-md px-3 text-left text-sm sm:w-full",
                    parentBoardId === board.id
                      ? "bg-accent font-medium"
                      : "hover:bg-accent/60",
                  )}
                  key={board.id}
                  onClick={() => setParentBoardId(board.id)}
                  type="button"
                >
                  <span className="truncate">{board.name}</span>
                </button>
              ))}
            </nav>
            <div className="min-w-0">
              <div className="flex items-center gap-2 border-b p-3">
                <Search
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={parentSearch}
                  onChange={(event) => setParentSearch(event.target.value)}
                  placeholder={t("tasks:parentTask.searchPlaceholder")}
                  aria-label={t("tasks:parentTask.searchPlaceholder")}
                  className="h-8"
                />
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {selectedParent ? (
                  <button
                    className="mb-1 flex w-full items-center gap-2 rounded-md bg-primary px-2 py-2 text-primary-foreground text-left text-sm"
                    onClick={() => {
                      setPinnedParent(null);
                      onParentTaskChange(null);
                    }}
                    type="button"
                  >
                    <Check className="size-4 shrink-0" />
                    <span className="truncate">
                      {formatParentLabel(selectedParent)}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid="create-task-parent-clear"
                  onClick={() => onParentTaskChange(null)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <X className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {t("tasks:parentTask.clear")}
                  </span>
                </button>
                {visibleParentOptions
                  .filter((option) => option.id !== parentTaskId)
                  .map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      data-testid={`create-task-parent-option-${option.id}`}
                      data-cross-board={option.crossBoard ? "true" : "false"}
                      onClick={() => {
                        setPinnedParent(option);
                        onParentTaskChange(option.id);
                        setParentOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="truncate">
                        {formatParentLabel(option)}
                      </span>
                      {option.boardSlug ? (
                        <span className="ms-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {option.boardSlug}
                        </span>
                      ) : null}
                    </button>
                  ))}
                {candidates.isPending ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    Loading tickets…
                  </p>
                ) : candidates.isError ? (
                  <p className="px-2 py-6 text-center text-sm text-destructive">
                    Failed to load tickets.
                  </p>
                ) : visibleParentOptions.length === 0 ? (
                  <p
                    data-testid="create-task-parent-empty"
                    className="px-2 py-6 text-center text-sm text-muted-foreground"
                  >
                    {t("tasks:parentTask.empty")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
