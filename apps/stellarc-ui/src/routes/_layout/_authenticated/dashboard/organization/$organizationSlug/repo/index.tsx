import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CircleDot,
  Eye,
  EyeOff,
  Github,
  GitPullRequest,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { AddRepoDialog } from "@/components/repo/add-repo-dialog";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiUrl } from "@/fetchers/get-api-url";
import useDeleteRepo from "@/hooks/mutations/repo/use-delete-repo";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { formatDateMedium } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useUserPreferencesStore } from "@/store/user-preferences";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const { organizationSlug } = Route.useParams();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const navigate = useNavigate();
  const { data: repos, isLoading } = useGetRepos({ organizationId });
  const { user } = useAuth();

  const resyncRepo = useMutation({
    mutationFn: async (repoId: string) => {
      // background=true is load-bearing: a full mirror of a large repository
      // outlives an edge proxy's request window (KFL-279 was exactly that
      // 504). The server publishes repo.synced when the mirror finishes and
      // the user websocket's REPO_SYNCED handler invalidates every repo-*
      // query, so fresh rows appear without refetching stale ones here.
      const response = await fetch(
        getApiUrl(`/repo/${repoId}/sync?background=true`),
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast.success(t("organization:repos.resyncStarted"));
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not resync repo",
      ),
  });

  const deleteRepo = useDeleteRepo();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRepo.mutateAsync(deleteTarget.id);
      toast.success(`Removed ${deleteTarget.name}`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove repo",
      );
    }
  };
  const { hiddenRepoIds, setRepoSidebarVisibility } = useUserPreferencesStore();
  const headerActions = (
    <Button variant="outline" size="xs" onClick={() => setAddOpen(true)}>
      <Plus className="size-3" />
      {t("organization:repos.add.button")}
    </Button>
  );

  const handleRepoClick = (repoId: string) => {
    navigate({
      to: "/dashboard/organization/$organizationSlug/repo/$repoId/issues",
      params: { organizationId, repoId },
    });
  };

  if (isLoading) {
    return (
      <>
        <PageTitle title={t("organization:repos.pageTitle")} />
        <OrganizationLayout
          title={t("organization:repos.pageTitle")}
          headerActions={headerActions}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.name")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.provider")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.openIssues")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.openPullRequests")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("organization:repos.table.lastSynced")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </OrganizationLayout>
      </>
    );
  }

  if (!repos || repos.length === 0) {
    return (
      <>
        <PageTitle title={t("organization:repos.pageTitle")} />
        <OrganizationLayout
          title={t("organization:repos.pageTitle")}
          headerActions={headerActions}
        >
          <Empty className="min-h-[60vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Github />
              </EmptyMedia>
              <EmptyTitle>{t("organization:repos.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("organization:repos.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
          <AddRepoDialog
            onOpenChange={setAddOpen}
            open={addOpen}
            organizationId={organizationId}
          />
        </OrganizationLayout>
      </>
    );
  }

  return (
    <>
      <PageTitle title={t("organization:repos.pageTitle")} />
      <OrganizationLayout
        title={t("organization:repos.pageTitle")}
        headerActions={headerActions}
      >
        <Table>
          <TableHeader className="p-4">
            <TableRow>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.name")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.provider")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.openIssues")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.openPullRequests")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("organization:repos.table.lastSynced")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {repos.map((repo) => (
              <TableRow
                className="cursor-pointer"
                key={repo.id}
                onClick={() => handleRepoClick(repo.id)}
              >
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <Github className="w-4 h-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {repo.owner}/{repo.name}
                      </span>
                      {repo.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-md">
                          {repo.description}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <span className="text-sm text-muted-foreground capitalize">
                    {repo.provider}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CircleDot className="w-3.5 h-3.5" />
                    {repo.openIssueCount}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <GitPullRequest className="w-3.5 h-3.5" />
                    {repo.openPullRequestCount}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {repo.lastSyncedAt
                        ? formatDateMedium(repo.lastSyncedAt)
                        : t("organization:repos.neverSynced")}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        aria-label={`Resync ${repo.owner}/${repo.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          resyncRepo.mutate(repo.id);
                        }}
                        size="icon"
                        variant="ghost"
                        disabled={resyncRepo.isPending}
                      >
                        <RefreshCw
                          className={`size-4 ${resyncRepo.isPending ? "animate-spin" : ""}`}
                        />
                      </Button>
                      <Button
                        aria-label={`${hiddenRepoIds.includes(`${user?.id}:${repo.id}`) ? "Show" : "Hide"} ${repo.owner}/${repo.name} in sidebar`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!user?.id) return;
                          setRepoSidebarVisibility(
                            user.id,
                            repo.id,
                            hiddenRepoIds.includes(`${user?.id}:${repo.id}`),
                          );
                        }}
                        size="icon"
                        variant="ghost"
                      >
                        {hiddenRepoIds.includes(`${user?.id}:${repo.id}`) ? (
                          <Eye className="size-4" />
                        ) : (
                          <EyeOff className="size-4" />
                        )}
                      </Button>
                      <Button
                        aria-label={`Remove ${repo.owner}/${repo.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget({
                            id: repo.id,
                            name: `${repo.owner}/${repo.name}`,
                          });
                        }}
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <AddRepoDialog
          onOpenChange={setAddOpen}
          open={addOpen}
          organizationId={organizationId}
        />
        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove repository</AlertDialogTitle>
              <AlertDialogDescription>
                Remove {deleteTarget?.name} from this organization? This deletes
                the mirror and all synced issues and pull requests. The
                repository itself on the provider is not affected and can be
                reconnected later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose asChild>
                <Button variant="outline" size="sm">
                  Cancel
                </Button>
              </AlertDialogClose>
              <AlertDialogClose asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteRepo.isPending}
                  onClick={handleDelete}
                >
                  {deleteRepo.isPending ? "Removing…" : "Remove"}
                </Button>
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </OrganizationLayout>
    </>
  );
}
