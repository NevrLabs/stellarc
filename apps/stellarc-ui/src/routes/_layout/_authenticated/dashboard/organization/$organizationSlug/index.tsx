import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarRange,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BoardViewTabs } from "@/components/board/board-view-tabs";
import BoardsTimeline from "@/components/board/boards-timeline";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import CreateBoardModal from "@/components/shared/modals/create-board-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import icons from "@/constants/board-icons";
import { shortcuts } from "@/constants/shortcuts";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useMilestonesByBoardIds from "@/hooks/queries/milestone/use-milestones-by-board-ids";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { formatDateMedium } from "@/lib/format";
import { useUserPreferencesStore } from "@/store/user-preferences";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);
  const { organizationSlug } = Route.useParams();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const navigate = useNavigate();
  const { data: boards, isLoading } = useGetBoards({
    organizationId,
  });
  const { canCreateBoards } = useOrganizationPermission();
  const canCreate = canCreateBoards();
  const { user } = useAuth();
  const { hiddenBoardIds, setBoardSidebarVisibility } =
    useUserPreferencesStore();
  // Table stays the default; the timeline is the opt-in planning view.
  const [view, setView] = useState<"table" | "timeline">("table");
  /**
   * Milestone diamonds for the timeline. Only fetched while the timeline is the
   * active view — the table doesn't show milestones, and this costs one request
   * per board.
   */
  const timelineBoardIds = useMemo(
    () => (view === "timeline" ? (boards ?? []).map((board) => board.id) : []),
    [view, boards],
  );
  const milestonesByBoardId = useMilestonesByBoardIds(timelineBoardIds);

  const handleCreateBoard = () => {
    if (!canCreate) return;
    setIsCreateBoardOpen(true);
  };

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.board.prefix]: {
        [shortcuts.board.create]: handleCreateBoard,
      },
    },
  });

  const handleBoardClick = (boardId: string) => {
    navigate({
      to: "/dashboard/organization/$organizationSlug/board/$boardSlug/board",
      params: {
        organizationSlug: organization?.slug ?? "",
        boardSlug: boards?.find((b) => b.id === boardId)?.slug ?? boardId,
      },
    });
  };

  if (isLoading) {
    return (
      <>
        <PageTitle title={t("organization:boards.pageTitle")} />
        <OrganizationLayout
          title={t("organization:boards.pageTitle")}
          headerActions={
            canCreate ? (
              <Button
                variant="outline"
                size="xs"
                onClick={handleCreateBoard}
                className="gap-1"
              >
                <Plus className="w-3 h-3" />
                {t("organization:boards.createBoard")}
              </Button>
            ) : null
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-foreground font-medium">
                  {t("organization:boards.title")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:boards.progress")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:boards.targetDate")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:boards.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-2 w-20" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </OrganizationLayout>
      </>
    );
  }

  if (!boards || boards.length === 0) {
    return (
      <>
        <PageTitle title={t("organization:boards.pageTitle")} />
        <OrganizationLayout
          title={t("organization:boards.pageTitle")}
          headerActions={
            canCreate ? (
              <Button
                variant="outline"
                size="xs"
                onClick={handleCreateBoard}
                className="gap-1"
              >
                <Plus className="w-3 h-3" />
                {t("organization:boards.createBoard")}
              </Button>
            ) : null
          }
        >
          <Empty className="min-h-[60vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGrid />
              </EmptyMedia>
              <EmptyTitle>{t("organization:boards.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {canCreate
                  ? t("organization:boards.emptyDescription")
                  : t("organization:boards.emptyDescriptionReadOnly")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {canCreate && (
                <Button onClick={handleCreateBoard}>
                  <Plus />
                  {t("organization:boards.createBoard")}
                </Button>
              )}
            </EmptyContent>
          </Empty>
        </OrganizationLayout>

        <CreateBoardModal
          open={isCreateBoardOpen}
          onClose={() => setIsCreateBoardOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle title={t("organization:boards.pageTitle")} />
      <OrganizationLayout
        title={t("organization:boards.pageTitle")}
        headerNavigation={
          <BoardViewTabs
            aria-label={t("organization:boards.pageTitle")}
            value={view}
            onValueChange={(value) => setView(value as "table" | "timeline")}
            views={[
              {
                value: "table",
                label: t("organization:boards.view.table", {
                  defaultValue: "Table",
                }),
                icon: <List className="size-3.5" />,
              },
              {
                value: "timeline",
                label: t("organization:boards.view.timeline", {
                  defaultValue: "Timeline",
                }),
                icon: <CalendarRange className="size-3.5" />,
              },
            ]}
          />
        }
        headerActions={
          canCreate ? (
            <Button
              variant="outline"
              size="xs"
              onClick={handleCreateBoard}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              {t("organization:boards.createBoard")}
            </Button>
          ) : null
        }
      >
        {view === "timeline" ? (
          <BoardsTimeline
            boards={(boards ?? []).map((board) => ({
              ...board,
              tasks: (board.tasks ?? []).map((task) => ({
                id: task.id,
                title: task.title,
                milestoneId: task.milestoneId,
                startDate: task.startDate,
                dueDate: task.dueDate,
              })),
            }))}
            milestonesByBoardId={milestonesByBoardId}
            onBoardClick={handleBoardClick}
            zoom="week"
          />
        ) : (
          <Table>
            <TableHeader className="p-4">
              <TableRow>
                <TableHead className="text-foreground font-medium">
                  {t("organization:boards.title")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:boards.progress")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:boards.dueDate")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:boards.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boards?.map((board) => {
                if (!board?.id || !board.statistics) return null;

                const IconComponent =
                  icons[board.icon as keyof typeof icons] || icons.Layout;

                const getStatusText = () => {
                  if (board.statistics.totalTasks === 0)
                    return t("organization:boards.boardStatus.notStarted");
                  if (board.statistics.completionPercentage === 100)
                    return t("organization:boards.boardStatus.complete");
                  return t("organization:boards.boardStatus.inProgress");
                };

                const getStatusVariant = () => {
                  if (board.statistics.totalTasks === 0) return "secondary";
                  if (board.statistics.completionPercentage === 100)
                    return "default";
                  return "outline";
                };

                return (
                  <TableRow
                    key={board.id}
                    className="cursor-pointer"
                    onClick={() => handleBoardClick(board.id)}
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <IconComponent className="w-5 h-5 text-muted-foreground" />
                        <span className="font-medium">{board.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={board.statistics.completionPercentage}
                          className="w-16 h-2"
                        />
                        <span className="text-sm text-muted-foreground">
                          {board.statistics.completionPercentage}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-sm text-muted-foreground">
                        {board.statistics.dueDate
                          ? formatDateMedium(board.statistics.dueDate)
                          : t("organization:boards.noDueDate")}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={getStatusVariant()}>
                          {getStatusText()}
                        </Badge>
                        <Button
                          aria-label={`${hiddenBoardIds.includes(`${user?.id}:${board.id}`) ? "Show" : "Hide"} ${board.name} in sidebar`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!user?.id) return;
                            setBoardSidebarVisibility(
                              user.id,
                              board.id,
                              hiddenBoardIds.includes(`${user.id}:${board.id}`),
                            );
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          {hiddenBoardIds.includes(
                            `${user?.id}:${board.id}`,
                          ) ? (
                            <Eye className="size-4" />
                          ) : (
                            <EyeOff className="size-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </OrganizationLayout>

      <CreateBoardModal
        open={isCreateBoardOpen}
        onClose={() => setIsCreateBoardOpen(false)}
      />
    </>
  );
}
