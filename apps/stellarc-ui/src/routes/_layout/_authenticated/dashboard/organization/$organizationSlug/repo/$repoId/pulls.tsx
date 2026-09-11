import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { GitPullRequest, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import RepoLayout from "@/components/common/repo-layout";
import PageTitle from "@/components/page-title";
import RepoDiffDelta from "@/components/repo/repo-diff-delta";
import RepoListRow, {
  repoListRowIconClassName,
} from "@/components/repo/repo-list-row";
import RepoMasterDetail from "@/components/repo/repo-master-detail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoPullRequests from "@/hooks/queries/repo/use-get-repo-pull-requests";
import { getAvatarTone } from "@/lib/avatar-tone";
import { formatDateMedium } from "@/lib/format";
import type { RepoPullRequestStateFilter } from "@/types/repo";

const STATE_FILTERS: RepoPullRequestStateFilter[] = [
  "open",
  "closed",
  "merged",
  "all",
];

type PullsSearchParams = { state: RepoPullRequestStateFilter };

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/pulls",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): PullsSearchParams => ({
    state: STATE_FILTERS.includes(search.state as RepoPullRequestStateFilter)
      ? (search.state as RepoPullRequestStateFilter)
      : "open",
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const location = useLocation();
  const { organizationSlug, repoId } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const { state } = Route.useSearch();
  const navigate = useNavigate();
  const { data: repo } = useGetRepo({ id: repoId });
  const { data, isLoading } = useGetRepoPullRequests({ repoId, state });
  const isDetailRoute = /\/pulls\/[^/]+$/.test(location.pathname);

  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;

  return (
    <>
      <PageTitle
        title={`${repoTitle} · ${t("organization:repos.pullRequests.pageTitle")}`}
      />
      <RepoLayout organizationId={organizationId} repoId={repoId}>
        <RepoMasterDetail
          hasDetail={isDetailRoute}
          id="pulls"
          detail={<Outlet />}
          list={
            <div className="min-h-0">
              <div className="px-3 py-2">
                <Tabs value={state}>
                  <TabsList className="bg-sidebar gap-2">
                    {STATE_FILTERS.map((filter) => (
                      <TabsTrigger
                        className="[&[data-state=active]]:rounded-md [&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:bg-card"
                        key={filter}
                        onClick={() =>
                          navigate({
                            to: ".",
                            search: { state: filter },
                            replace: true,
                          })
                        }
                        value={filter}
                      >
                        {t(`organization:repos.stateFilter.${filter}`)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {isLoading && <RepoListSkeleton />}
              {!isLoading && (!data || data.data.length === 0) && (
                <Empty className="min-h-[50vh]">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <GitPullRequest />
                    </EmptyMedia>
                    <EmptyTitle>
                      {t("organization:repos.pullRequests.emptyTitle")}
                    </EmptyTitle>
                    <EmptyDescription>
                      {t("organization:repos.pullRequests.emptyDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {!isLoading && data && data.data.length > 0 && (
                <div className="flex flex-col divide-y">
                  {data.data.map((pullRequest) => (
                    <RepoListRow
                      icon={
                        <GitPullRequest
                          className={repoListRowIconClassName()}
                        />
                      }
                      key={pullRequest.id}
                      labels={pullRequest.labels ?? []}
                      meta={
                        <>
                          {pullRequest.authorLogin && (
                            <span className="flex items-center gap-1.5">
                              <Avatar
                                className={`size-4 ${getAvatarTone(pullRequest.authorLogin)}`}
                              >
                                {pullRequest.authorAvatarUrl && (
                                  <AvatarImage
                                    src={pullRequest.authorAvatarUrl}
                                  />
                                )}
                                <AvatarFallback className="bg-transparent text-[8px]">
                                  {pullRequest.authorLogin
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {pullRequest.authorLogin}
                            </span>
                          )}
                          {pullRequest.headBranch && pullRequest.baseBranch && (
                            <span className="font-mono text-[10px]">
                              {pullRequest.headBranch} →{" "}
                              {pullRequest.baseBranch}
                            </span>
                          )}
                          {pullRequest.externalCreatedAt && (
                            <span>
                              {formatDateMedium(pullRequest.externalCreatedAt)}
                            </span>
                          )}
                          {pullRequest.commentCount > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {pullRequest.commentCount}
                            </span>
                          )}
                        </>
                      }
                      number={pullRequest.number}
                      params={{
                        organizationId,
                        repoId,
                        number: String(pullRequest.number),
                      }}
                      state={
                        pullRequest.isDraft && pullRequest.state === "open"
                          ? "draft"
                          : pullRequest.state
                      }
                      title={pullRequest.title}
                      to="/dashboard/organization/$organizationSlug/repo/$repoId/pulls/$number"
                      // Same defect as #94 in the issue list: without `search`
                      // the detail route's validateSearch falls back to "open"
                      // and the list silently resets the user's filter.
                      search={{ state }}
                      trailing={
                        <RepoDiffDelta
                          additions={pullRequest.additions}
                          deletions={pullRequest.deletions}
                        />
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          }
        />
      </RepoLayout>
    </>
  );
}

function RepoListSkeleton() {
  return (
    <div className="flex flex-col divide-y">
      {[1, 2, 3, 4, 5].map((i) => (
        <div className="flex items-start gap-3 px-3 py-3" key={i}>
          <Skeleton className="mt-0.5 h-4 w-4" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
