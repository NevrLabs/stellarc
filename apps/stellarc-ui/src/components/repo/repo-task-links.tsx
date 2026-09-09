import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getApiUrl } from "@/fetchers/get-api-url";
import getTasks from "@/fetchers/task/get-tasks";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { cn } from "@/lib/cn";
import {
  groupTicketCandidatesByBoard,
  type TicketCandidate,
} from "@/lib/link-ticket-candidates";
import { capGroupItems, PICKER_GROUP_CAP } from "@/lib/picker-group-cap";
import { toast } from "@/lib/toast";
import type { RepoTaskLink } from "@/types/repo";
import LinkTicketCandidateRow from "./link-ticket-candidate-row";

type Props = {
  organizationId: string;
  repoId: string;
  number: number;
  itemType: "issues" | "pull-requests";
  taskLinks?: RepoTaskLink[];
  compact?: boolean;
};

async function request(path: string, init: RequestInit) {
  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Request failed");
}

export default function RepoTaskLinks({
  organizationId,
  repoId,
  number,
  itemType,
  taskLinks = [],
  compact = false,
}: Props) {
  const queryClient = useQueryClient();
  const { canUpdateBoards } = useOrganizationPermission();
  const canManageSyncedTasks = canUpdateBoards();
  const [linkOpen, setLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [linkBoardId, setLinkBoardId] = useState("all");
  const { data: boards, isLoading: boardsLoading } = useGetBoards({
    organizationId,
  });
  const taskQueries = useQueries({
    queries: (boards ?? []).map((board) => ({
      queryKey: ["tasks", board.id],
      queryFn: () => getTasks(board.id),
      enabled: linkOpen,
    })),
  });
  const isLoading =
    boardsLoading || taskQueries.some((query) => query.isLoading);
  const [syncOpen, setSyncOpen] = useState(false);
  const [boardId, setBoardId] = useState("");
  const [unsyncLink, setUnsyncLink] = useState<RepoTaskLink | null>(null);
  const queryKey = [
    itemType === "issues" ? "repo-issue" : "repo-pull-request",
    repoId,
    number,
  ];
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const existingTaskIds = new Set(taskLinks.map((link) => link.taskId));
  const candidates = useMemo<TicketCandidate[]>(() => {
    const result: TicketCandidate[] = [];
    for (const [index, board] of (boards ?? []).entries()) {
      const payload = taskQueries[index]?.data as
        | {
            columns?: Array<{
              name?: string;
              slug?: string;
              icon?: string | null;
              isFinal?: boolean;
              tasks?: unknown;
            }>;
            archivedTasks?: unknown;
            plannedTasks?: unknown;
          }
        | undefined;
      const buckets: Array<{
        tasks: unknown;
        status: string;
        statusName: string;
        statusIcon: string | null;
        statusIsFinal: boolean;
      }> = [
        ...(payload?.columns ?? []).map((column) => ({
          tasks: column?.tasks,
          status: column?.slug ?? "",
          statusName: column?.name ?? column?.slug ?? "",
          statusIcon: column?.icon ?? null,
          statusIsFinal: column?.isFinal ?? false,
        })),
        {
          tasks: payload?.archivedTasks,
          status: "archived",
          statusName: "Archived",
          statusIcon: null,
          statusIsFinal: false,
        },
        {
          tasks: payload?.plannedTasks,
          status: "planned",
          statusName: "Planned",
          statusIcon: null,
          statusIsFinal: false,
        },
      ];
      for (const bucket of buckets) {
        if (!Array.isArray(bucket.tasks)) continue;
        for (const task of bucket.tasks as Array<{
          id?: string;
          title?: string;
          number?: number | null;
        }>) {
          if (!task?.id || !task.title || existingTaskIds.has(task.id))
            continue;
          result.push({
            id: task.id,
            title: task.title,
            number: task.number ?? null,
            boardId: board.id,
            boardName: board.name,
            boardSlug: board.slug,
            status: bucket.status,
            statusName: bucket.statusName,
            statusIcon: bucket.statusIcon,
            statusIsFinal: bucket.statusIsFinal,
          });
        }
      }
    }
    return result;
  }, [boards, existingTaskIds, taskQueries]);

  const add = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/${itemType}/${number}/task-links`, {
        method: "POST",
        body: JSON.stringify({ taskId }),
      }),
    onSuccess: async () => {
      await invalidate();
      setLinkOpen(false);
      setSearch("");
      toast.success("Ticket linked.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not link task.",
      ),
  });
  const remove = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/${itemType}/${number}/task-links/${taskId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Ticket link removed.");
    },
  });
  const addSynced = useMutation({
    mutationFn: () =>
      request(`/repo/${repoId}/issues/${number}/synced-tasks`, {
        method: "POST",
        body: JSON.stringify({ boardId }),
      }),
    onSuccess: async () => {
      await invalidate();
      setSyncOpen(false);
      setBoardId("");
      toast.success("Synced ticket created.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create synced task.",
      ),
  });
  const retry = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/issues/${number}/synced-tasks/${taskId}/retry`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Ticket synced from GitHub.");
    },
  });
  const unsync = useMutation({
    mutationFn: (taskId: string) =>
      request(`/repo/${repoId}/issues/${number}/synced-tasks/${taskId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await invalidate();
      setUnsyncLink(null);
      toast.success("Ticket unsynced. The ordinary link remains.");
    },
  });

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = candidates.filter(
    (task) =>
      (linkBoardId === "all" || task.boardId === linkBoardId) &&
      `${task.boardSlug}-${task.number ?? ""} ${task.title} ${task.boardName} ${task.statusName}`
        .toLocaleLowerCase()
        .includes(normalizedSearch),
  );
  // Cap rendered rows per board — all rows are real DOM nodes and orgs with
  // 1400+ tickets lagged the dialog (KFL-333 perf). Search runs pre-cap.
  const candidateGroups = capGroupItems(
    groupTicketCandidatesByBoard(filtered).map((group) => ({
      value: group.boardId,
      label: group.boardName,
      items: group.items,
    })),
    PICKER_GROUP_CAP,
  );
  const linked = taskLinks.filter((link) => !link.syncEnabled);
  const synced = taskLinks.filter((link) => link.syncEnabled);
  const row = (link: RepoTaskLink, isSynced: boolean) => (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
      key={link.id}
    >
      <a
        className="min-w-0 flex-1 truncate text-sm hover:underline"
        href={`/dashboard/organization/${organizationId}/board/${link.task.boardId}/task/${link.task.id}`}
      >
        {link.task.number !== null && (
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">
            #{link.task.number}
          </span>
        )}
        {link.task.title}
        <ExternalLink className="ml-1.5 inline size-3 text-muted-foreground" />
      </a>
      {link.syncBrokenAt && (
        <span
          className="flex items-center gap-1 text-xs text-destructive"
          title={link.syncBrokenReason ?? undefined}
        >
          <AlertTriangle className="size-3.5" /> Broken
        </span>
      )}
      {isSynced ? (
        <>
          <Button
            aria-label={`Retry sync for ${link.task.title}`}
            disabled={!link.syncBrokenAt || retry.isPending}
            onClick={() => retry.mutate(link.taskId)}
            size="icon-xs"
            variant="ghost"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            aria-label={`Unsync ${link.task.title}`}
            onClick={() => setUnsyncLink(link)}
            size="icon-xs"
            variant="ghost"
          >
            <Unplug className="size-3.5" />
          </Button>
        </>
      ) : (
        <Button
          aria-label={`Remove link to ${link.task.title}`}
          disabled={remove.isPending}
          onClick={() => remove.mutate(link.taskId)}
          size="icon-xs"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <section
      className={compact ? "space-y-3" : "border-b border-border/80 px-6 py-5"}
    >
      <div
        className="flex items-center justify-between gap-3"
        data-testid="repo-linked-tasks"
      >
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="size-4" /> Linked Tickets{" "}
          {linked.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {linked.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
            <DialogTrigger
              render={<Button size={compact ? "xs" : "sm"} variant="outline" />}
            >
              <Link2 className="size-3.5" /> Link ticket
            </DialogTrigger>
            <DialogPopup className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Link an existing ticket</DialogTitle>
                <DialogDescription>
                  This creates a local Kaneo relation; the GitHub issue or pull
                  request remains authoritative.
                </DialogDescription>
              </DialogHeader>
              {/* Same two-pane layout as the parent selector: a board rail on
                  the left (jump/filter), search + sectioned results right. */}
              <DialogPanel className="p-0">
                <div className="grid min-h-80 sm:grid-cols-[12rem_1fr]">
                  <nav
                    aria-label="Boards"
                    className="flex gap-1 overflow-x-auto border-b p-2 sm:block sm:overflow-x-visible sm:border-r sm:border-b-0"
                  >
                    {[{ id: "all", name: "All" }, ...(boards ?? [])].map(
                      (board) => (
                        <button
                          aria-pressed={linkBoardId === board.id}
                          className={cn(
                            "flex h-9 shrink-0 items-center rounded-md px-3 text-left text-sm sm:w-full",
                            linkBoardId === board.id
                              ? "bg-accent font-medium"
                              : "hover:bg-accent/60",
                          )}
                          data-testid={`link-ticket-rail-${board.id}`}
                          key={board.id}
                          onClick={() => setLinkBoardId(board.id)}
                          type="button"
                        >
                          <span className="truncate">{board.name}</span>
                        </button>
                      ),
                    )}
                  </nav>
                  <div className="min-w-0">
                    <div className="border-b p-3">
                      <Input
                        aria-label="Search tickets"
                        autoFocus
                        className="h-8"
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search tickets across this organization…"
                        value={search}
                      />
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {isLoading ? (
                        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                          <LoaderCircle className="size-4 animate-spin" />{" "}
                          Loading tickets…
                        </p>
                      ) : candidateGroups.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">
                          No unlinked tickets found.
                        </p>
                      ) : (
                        candidateGroups.map((group) => (
                          <div key={group.value}>
                            <div
                              className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur"
                              data-testid={`link-ticket-board-${group.value}`}
                            >
                              {group.label}
                            </div>
                            {group.items.map((task) => (
                              <button
                                className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent disabled:opacity-60"
                                disabled={add.isPending}
                                key={task.id}
                                onClick={() => add.mutate(task.id)}
                                type="button"
                              >
                                <LinkTicketCandidateRow task={task} />
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </DialogPanel>
              <DialogFooter>
                <Button onClick={() => setLinkOpen(false)} variant="outline">
                  Cancel
                </Button>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        </div>
      </div>
      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked tickets yet.</p>
      ) : (
        <div className="space-y-1">
          {linked.map((link) => row(link, false))}
        </div>
      )}
      {itemType === "issues" && (
        <div className="border-t pt-3" data-testid="repo-synced-tasks">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium">
              <RefreshCw className="size-4 shrink-0" /> Synced Tickets{" "}
              {synced.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {synced.length}
                </span>
              )}
            </div>
            {canManageSyncedTasks && (
              <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
                <DialogTrigger
                  render={
                    <Button
                      aria-label="Add Synced Ticket"
                      size={compact ? "xs" : "sm"}
                      variant="outline"
                    />
                  }
                >
                  <RefreshCw className="size-3.5" />
                  <span className={compact ? "sr-only" : undefined}>
                    Add Synced Ticket
                  </span>
                </DialogTrigger>
                <DialogPopup>
                  <DialogHeader>
                    <DialogTitle>Add Synced Ticket</DialogTitle>
                    <DialogDescription>
                      Create a new ticket that follows this GitHub issue. GitHub
                      updates overwrite its title and description.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogPanel>
                    <label className="space-y-2 text-sm">
                      <span>Board</span>
                      <Combobox
                        autoHighlight
                        itemToStringLabel={(board: { name: string }) =>
                          board.name
                        }
                        items={boards ?? []}
                        onValueChange={(board) => setBoardId(board?.id ?? "")}
                        value={
                          (boards ?? []).find(
                            (board) => board.id === boardId,
                          ) ?? null
                        }
                      >
                        <ComboboxInput
                          aria-label="Board for synced ticket"
                          placeholder="Search boards…"
                        />
                        <ComboboxPopup>
                          <ComboboxEmpty>No boards found.</ComboboxEmpty>
                          <ComboboxList>
                            <ComboboxCollection>
                              {(board: { id: string; name: string }) => (
                                <ComboboxItem key={board.id} value={board}>
                                  {board.name}
                                </ComboboxItem>
                              )}
                            </ComboboxCollection>
                          </ComboboxList>
                        </ComboboxPopup>
                      </Combobox>
                    </label>
                  </DialogPanel>
                  <DialogFooter>
                    <Button
                      onClick={() => setSyncOpen(false)}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!boardId || addSynced.isPending}
                      onClick={() => addSynced.mutate()}
                    >
                      {addSynced.isPending
                        ? "Creating…"
                        : "Create synced ticket"}
                    </Button>
                  </DialogFooter>
                </DialogPopup>
              </Dialog>
            )}
          </div>
          {synced.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tickets follow this issue.
            </p>
          ) : (
            <div className="space-y-1">
              {synced.map((link) => row(link, true))}
            </div>
          )}
        </div>
      )}
      <Dialog
        open={Boolean(unsyncLink)}
        onOpenChange={(open) => !open && setUnsyncLink(null)}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Unsync ticket?</DialogTitle>
            <DialogDescription>
              The ticket stops following GitHub updates. The ticket and ordinary
              link remain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setUnsyncLink(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={unsync.isPending}
              onClick={() => unsyncLink && unsync.mutate(unsyncLink.taskId)}
              variant="destructive"
            >
              Unsync ticket
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
