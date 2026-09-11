import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Archive,
  EyeOff,
  Folder,
  Forward,
  MoreHorizontal,
  Plus,
  Settings,
  SquareKanban,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import EntityIcon from "@/components/common/entity-icon";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import useArchiveBoard from "@/hooks/mutations/board/use-archive-board";
import useDeleteBoard from "@/hooks/mutations/board/use-delete-board";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { useTargetBoardView } from "@/hooks/use-remembered-view";
import {
  intentPrefetchHandlers,
  prefetchBoardNavigation,
} from "@/lib/navigation-prefetch";
import { toast } from "@/lib/toast";
import { useNavigationStore } from "@/store/navigation";
import { useTeamViewStore } from "@/store/team-view";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { BoardWithTasks } from "@/types/board";
import { NavHiddenItems } from "./nav-hidden-items";
import CreateBoardModal from "./shared/modals/create-board-modal";
import {
  reconcileSidebarOrder,
  SidebarSortableItem,
  SidebarSortableList,
} from "./sidebar-sort";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

export function NavBoards() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isMobile } = useSidebar();
  const { data: organization } = useActiveOrganization();
  const teamId = useTeamViewStore((state) => state.teamId);
  const { data: boards } = useGetBoards({
    organizationId: organization?.id || "",
    teamId,
  });
  const queryClient = useQueryClient();
  const { mutateAsync: deleteBoard } = useDeleteBoard();
  const { mutateAsync: archiveBoard, isPending: isArchivePending } =
    useArchiveBoard();
  const { canCreateBoards, canDeleteBoards, canUpdateBoards } =
    useOrganizationPermission();
  const canCreate = canCreateBoards();
  const canDeleteBoard = canDeleteBoards();
  const canArchiveBoard = canUpdateBoards();
  const {
    hiddenBoardIds,
    setBoardSidebarVisibility,
    boardSidebarOrders,
    setBoardSidebarOrder,
  } = useUserPreferencesStore();
  const navigate = useNavigate();
  const {
    organizationSlug: currentOrganizationSlug,
    boardSlug: currentBoardSlug,
  } = useParams({
    strict: false,
  });

  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [isDeleteBoardModalOpen, setIsDeleteBoardModalOpen] = useState(false);
  const [boardToDeleteId, setBoardToDeleteID] = useState<string | null>(null);
  const [boardToArchive, setBoardToArchive] = useState<BoardWithTasks | null>(
    null,
  );

  // Switching boards keeps the current view; arriving from elsewhere uses the
  // last board view this user was in (persisted in localStorage).
  const currentBoardView = useTargetBoardView();

  // Optimistic selection: useParams only updates once React commits the
  // incoming route, and rendering a large board takes long enough that the
  // sidebar highlight used to stay on the old board for the whole stall — the
  // click looked ignored.
  // Shared with BoardLayout so it can blank the outgoing board's content the
  // moment a switch is clicked.
  const pendingBoardId = useNavigationStore((s) => s.pendingBoardId);
  const setPendingBoardId = useNavigationStore((s) => s.setPendingBoardId);

  useEffect(() => {
    if (pendingBoardId && currentBoardSlug === pendingBoardId) {
      setPendingBoardId(null);
    }
  }, [currentBoardSlug, pendingBoardId, setPendingBoardId]);

  // Don't strand the highlight if the navigation never lands.
  useEffect(() => {
    if (!pendingBoardId) return;
    const timer = setTimeout(() => setPendingBoardId(null), 5000);
    return () => clearTimeout(timer);
  }, [pendingBoardId, setPendingBoardId]);

  const selectedBoardId = pendingBoardId ?? currentBoardSlug;

  const isCurrentBoard = (boardId: string) => {
    return (
      selectedBoardId === boardId &&
      currentOrganizationSlug === organization?.slug
    );
  };

  const handleBoardClick = (board: BoardWithTasks) => {
    if (board.id === selectedBoardId) return;
    setPendingBoardId(board.id);
    navigate({
      to: `/dashboard/organization/$organizationSlug/board/$boardSlug/${currentBoardView}`,
      params: {
        organizationSlug: organization?.slug || "",
        boardSlug: board.slug,
      },
    });
  };

  const prefetchBoard = (boardId: string) =>
    prefetchBoardNavigation(queryClient, organization?.id || "", boardId);

  useEffect(() => {
    if (!organization?.id || !boards?.length) return;
    const boardIds = boards
      .filter(
        (board) =>
          board.id !== currentBoardSlug &&
          !hiddenBoardIds.includes(`${user?.id}:${board.id}`) &&
          !queryClient.getQueryData(["tasks", board.id]),
      )
      .slice(0, 2)
      .map((board) => board.id);
    if (boardIds.length === 0) return;

    const warm = () => {
      for (const boardId of boardIds) {
        void prefetchBoardNavigation(queryClient, organization.id, boardId);
      }
    };
    const handle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(warm, { timeout: 2000 })
        : setTimeout(warm, 500);
    return () => {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(handle);
      } else {
        clearTimeout(handle);
      }
    };
  }, [
    boards,
    currentBoardSlug,
    hiddenBoardIds,
    organization?.id,
    queryClient,
    user?.id,
  ]);

  const handleShareBoard = (board: BoardWithTasks) => {
    navigator.clipboard.writeText(
      `${window.location.origin}/dashboard/organization/${organization?.slug}/board/${board.slug}`,
    );
    toast.success(t("navigation:boardList.linkCopied"));
  };

  const handleBoardSettings = (board: BoardWithTasks) => {
    navigate({
      to: "/dashboard/settings/boards/$boardId/general",
      params: { boardSlug: board.id },
    });
  };

  const handleDeleteBoard = (board: BoardWithTasks) => {
    setBoardToDeleteID(board.id);
    setIsDeleteBoardModalOpen(true);
  };

  if (!organization) return null;

  const hiddenBoards =
    boards?.filter((board) =>
      hiddenBoardIds.includes(`${user?.id}:${board.id}`),
    ) ?? [];
  const unsortedVisibleBoards =
    boards?.filter(
      (board) => !hiddenBoardIds.includes(`${user?.id}:${board.id}`),
    ) ?? [];
  const visibleBoards = reconcileSidebarOrder(
    unsortedVisibleBoards,
    boardSidebarOrders[user?.id ?? ""] ?? [],
  );

  return (
    <>
      {/*
        #96: the collapsed rail shows the Boards *overview* entry first, then one
        entry per board using that board's own configured icon (the same
        `board.icon` the overview grid and mobile nav render). Names appear on
        hover.
      */}
      <SidebarGroup className="hidden gap-1 p-2 pt-1 group-data-[collapsible=icon]:block">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              data-testid="sidebar-boards-collapsed"
              onClick={() =>
                navigate({
                  to: "/dashboard/organization/$organizationSlug",
                  params: { organizationSlug: organization.id },
                })
              }
              tooltip={t("navigation:sidebar.boards")}
            >
              <SquareKanban aria-hidden="true" />
              <span>{t("navigation:sidebar.boards")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {visibleBoards.map((board) => {
            return (
              <SidebarMenuItem key={board.id}>
                <SidebarMenuButton
                  data-testid={`sidebar-board-collapsed-${board.id}`}
                  onClick={() =>
                    navigate({
                      to: "/dashboard/organization/$organizationSlug/board/$boardSlug",
                      params: {
                        organizationSlug: organization.id,
                        boardSlug: board.slug,
                      },
                    })
                  }
                  tooltip={board.name}
                >
                  <EntityIcon className="size-4" value={board.icon} />
                  <span>{board.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup className="group/boards group-data-[collapsible=icon]:hidden gap-1 p-2 pt-1">
        <div className="relative flex items-center">
          <SidebarGroupLabel
            className="h-7 flex-1 cursor-pointer px-0 pr-12 text-sidebar-accent-foreground hover:text-sidebar-accent-foreground/80"
            render={<button type="button" />}
            onClick={() =>
              navigate({
                to: "/dashboard/organization/$organizationSlug",
                params: { organizationSlug: organization.id },
              })
            }
          >
            <span>{t("navigation:sidebar.boards")}</span>
          </SidebarGroupLabel>
          <div className="absolute right-0 flex items-center">
            {canCreate && (
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded-md text-sidebar-foreground opacity-0 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 group-focus-within/boards:opacity-100 group-hover/boards:opacity-100"
                onClick={() => setIsCreateBoardModalOpen(true)}
              >
                <Plus className="size-4" />
                <span className="sr-only">
                  {t("navigation:boardList.addBoard")}
                </span>
              </button>
            )}
            {hiddenBoards.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label="Board sidebar options"
                      type="button"
                      className="flex size-6 items-center justify-center rounded-md text-sidebar-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                    />
                  }
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">
                    {t("navigation:sidebar.more")}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-lg">
                  {hiddenBoards.map((board) => (
                    <DropdownMenuItem
                      className="cursor-pointer text-sm"
                      key={board.id}
                      onClick={() =>
                        setBoardSidebarVisibility(
                          user?.id ?? "",
                          board.id,
                          true,
                        )
                      }
                    >
                      Show {board.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            <SidebarSortableList
              ids={visibleBoards.map((board) => board.id)}
              onReorder={(ids) => setBoardSidebarOrder(user?.id ?? "", ids)}
            >
              {visibleBoards.map((board) => {
                return (
                  <SidebarSortableItem id={board.id} key={board.id}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            isActive={isCurrentBoard(board.id)}
                            size="default"
                            className="h-8 gap-0 ps-3.5 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent data-[active=true]:bg-sidebar-accent data-[active=true]:shadow-sm/5"
                            onClick={() => handleBoardClick(board)}
                            {...intentPrefetchHandlers(() =>
                              prefetchBoard(board.id),
                            )}
                          >
                            {/* #171: the icon is shown in the expanded rail
                                too, not only when collapsed. */}
                            <EntityIcon
                              className="me-2 size-4 text-sidebar-foreground/70"
                              value={board.icon}
                            />
                            <span className="truncate">{board.name}</span>
                          </SidebarMenuButton>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  className="absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-lg p-0 text-sidebar-foreground outline-hidden ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground after:-inset-2 after:absolute md:after:hidden peer-data-[size=sm]/menu-button:top-1 peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 group-data-[collapsible=icon]:hidden group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0"
                                />
                              }
                            >
                              <MoreHorizontal />
                              <span className="sr-only">
                                {t("navigation:sidebar.more")}
                              </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              className="w-44 rounded-lg"
                              side={isMobile ? "bottom" : "right"}
                              align={isMobile ? "end" : "start"}
                            >
                              <DropdownMenuItem
                                className="h-7 items-start cursor-pointer text-sm"
                                onClick={() => handleBoardClick(board)}
                              >
                                <Folder className="text-muted-foreground" />
                                <span>
                                  {t("navigation:boardList.viewBoard")}
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="h-7 items-start cursor-pointer text-sm"
                                onClick={() => handleShareBoard(board)}
                              >
                                <Forward className="text-muted-foreground" />
                                <span>
                                  {t("navigation:boardList.shareBoard")}
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="h-7 items-start cursor-pointer text-sm"
                                onClick={() => handleBoardSettings(board)}
                              >
                                <Settings className="text-muted-foreground" />
                                <span>
                                  {t("navigation:boardList.boardSettings")}
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="h-7 items-start cursor-pointer text-sm"
                                onClick={() =>
                                  setBoardSidebarVisibility(
                                    user?.id ?? "",
                                    board.id,
                                    false,
                                  )
                                }
                              >
                                <EyeOff className="text-muted-foreground" />
                                <span>Hide from sidebar</span>
                              </DropdownMenuItem>
                              {canArchiveBoard && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="h-7 items-start cursor-pointer text-sm"
                                    onClick={() => setBoardToArchive(board)}
                                  >
                                    <Archive className="text-muted-foreground" />
                                    <span>Archive board</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              {canDeleteBoard && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="h-7 items-start text-destructive cursor-pointer text-sm"
                                    onClick={() => handleDeleteBoard(board)}
                                  >
                                    <Trash2 className="text-destructive" />
                                    <span>
                                      {t("navigation:boardList.deleteBoard")}
                                    </span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-44">
                        <ContextMenuItem
                          onClick={() => handleBoardClick(board)}
                        >
                          <Folder className="text-muted-foreground" />
                          {t("navigation:boardList.viewBoard")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleShareBoard(board)}
                        >
                          <Forward className="text-muted-foreground" />
                          {t("navigation:boardList.shareBoard")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleBoardSettings(board)}
                        >
                          <Settings className="text-muted-foreground" />
                          {t("navigation:boardList.boardSettings")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() =>
                            setBoardSidebarVisibility(
                              user?.id ?? "",
                              board.id,
                              false,
                            )
                          }
                        >
                          <EyeOff className="text-muted-foreground" />
                          Hide from sidebar
                        </ContextMenuItem>
                        {canArchiveBoard && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => setBoardToArchive(board)}
                            >
                              <Archive className="text-muted-foreground" />
                              Archive board
                            </ContextMenuItem>
                          </>
                        )}
                        {canDeleteBoard && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteBoard(board)}
                            >
                              <Trash2 className="text-destructive" />
                              {t("navigation:boardList.deleteBoard")}
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  </SidebarSortableItem>
                );
              })}
            </SidebarSortableList>
            <NavHiddenItems
              isActive={(boardId) => isCurrentBoard(boardId)}
              items={hiddenBoards.map((board) => ({
                id: board.id,
                name: board.name,
              }))}
              label={t("navigation:sidebar.moreBoards")}
              onIntent={(boardId) => prefetchBoard(boardId)}
              onSelect={(boardId) => {
                const board = hiddenBoards.find((item) => item.id === boardId);
                if (board) handleBoardClick(board);
              }}
              testIdPrefix="boards"
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <CreateBoardModal
        open={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
      />

      <ArchiveBoardDialog
        board={boardToArchive}
        isPending={isArchivePending}
        onClose={() => setBoardToArchive(null)}
        onArchive={async (board) => {
          await archiveBoard({ id: board.id });
          toast.success("Board archived");
          setBoardToArchive(null);
          if (currentBoardSlug === board.id)
            navigate({
              to: "/dashboard/organization/$organizationSlug",
              params: { organizationSlug: organization.id },
            });
        }}
      />

      <AlertDialog
        open={isDeleteBoardModalOpen}
        onOpenChange={setIsDeleteBoardModalOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("navigation:boardList.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("navigation:boardList.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline" size="sm">
                {t("common:actions.cancel")}
              </Button>
            </AlertDialogClose>
            <AlertDialogClose
              onClick={async () => {
                await deleteBoard({
                  id: boardToDeleteId || "",
                });
                toast.success(t("navigation:boardList.deletedToast"));
                queryClient.invalidateQueries({
                  queryKey: ["boards"],
                });
                navigate({
                  to: "/dashboard/organization/$organizationSlug",
                  params: {
                    organizationSlug: organization?.slug || "",
                  },
                });
              }}
            >
              <Button variant="destructive" size="sm">
                {t("navigation:boardList.deleteBoard")}
              </Button>
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ArchiveBoardDialogProps = {
  board: BoardWithTasks | null;
  isPending: boolean;
  onArchive: (board: BoardWithTasks) => Promise<void>;
  onClose: () => void;
};

export function ArchiveBoardDialog({
  board,
  isPending,
  onArchive,
  onClose,
}: ArchiveBoardDialogProps) {
  const handleArchive = async () => {
    if (!board || isPending) return;
    try {
      await onArchive(board);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to archive board",
      );
    }
  };

  return (
    <AlertDialog
      open={!!board}
      onOpenChange={(open) => !open && !isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive board?</AlertDialogTitle>
          <AlertDialogDescription>
            {board?.name} will be hidden from active board lists. Its tasks and
            settings will be preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            render={<AlertDialogClose />}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => void handleArchive()}
          >
            {isPending ? "Archiving…" : "Archive board"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
