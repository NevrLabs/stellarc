import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLink, GitBranch } from "lucide-react";
import { useState } from "react";
import PageTitle from "@/components/page-title";
import PullRequestLiveDetails from "@/components/repo/pull-request-live-details";
import RepoDiffDelta from "@/components/repo/repo-diff-delta";
import { RepoItemTitleAction } from "@/components/repo/repo-item-actions";
import {
  RepoItemAuthor,
  RepoItemDetailLayout,
  RepoItemDetailSkeleton,
  RepoItemNotFound,
} from "@/components/repo/repo-item-detail-layout";
import RepoLabelList from "@/components/repo/repo-label-list";
import RepoStateBadge from "@/components/repo/repo-state-badge";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoPullRequest from "@/hooks/queries/repo/use-get-repo-pull-request";
import { formatDateMedium } from "@/lib/format";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/pulls/$number",
)({ component: RouteComponent });

function RouteComponent() {
  const navigate = useNavigate();
  const { organizationSlug, repoId, number: numberParam } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const number = Number(numberParam);
  const { data: repo } = useGetRepo({ id: repoId });
  // Tracked here because the tabs live in PullRequestLiveDetails but the
  // metadata sidebar is rendered by the layout above it.
  const [activeTab, setActiveTab] = useState("discussion");
  const {
    data: pullRequest,
    isLoading,
    isError,
  } = useGetRepoPullRequest({ repoId, number });
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const back = () =>
    navigate({
      to: "/dashboard/organization/$organizationSlug/repo/$repoId/pulls",
      params: { organizationId, repoId },
    });

  return (
    <>
      <PageTitle
        title={
          pullRequest
            ? `#${pullRequest.number} · ${pullRequest.title}`
            : `${repoTitle} · Pull request`
        }
      />
      {isLoading ? (
        <RepoItemDetailSkeleton kind="pull-request" />
      ) : isError || !pullRequest ? (
        <RepoItemNotFound kind="pull-request" onBack={back} />
      ) : (
        <RepoItemDetailLayout
          body={pullRequest.body}
          closedAt={pullRequest.closedAt}
          commentCount={pullRequest.commentCount}
          header={
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start gap-2">
                    <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-tight sm:text-2xl">
                      {pullRequest.title}
                    </h1>
                    <RepoItemTitleAction
                      kind="pull-request"
                      number={pullRequest.number}
                      repoId={repoId}
                      title={pullRequest.title}
                    />
                  </div>
                  {/* Same order as the issue header: state, #number, author. */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <RepoStateBadge
                      state={
                        pullRequest.isDraft && pullRequest.state === "open"
                          ? "draft"
                          : pullRequest.state
                      }
                    />
                    <span>#{pullRequest.number}</span>
                    <RepoItemAuthor
                      avatarUrl={pullRequest.authorAvatarUrl}
                      login={pullRequest.authorLogin}
                    />
                    {pullRequest.externalCreatedAt && (
                      <span>
                        opened {formatDateMedium(pullRequest.externalCreatedAt)}
                      </span>
                    )}
                  </div>
                </div>
                {/* GitHub places the diff delta at the bottom right of the
                    title area, beneath the external link. */}
                <div className="flex flex-col items-end gap-2">
                  <a
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                    href={pullRequest.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open externally
                    <ExternalLink className="size-3.5" />
                  </a>
                  <RepoDiffDelta
                    additions={pullRequest.additions}
                    changedFiles={pullRequest.changedFiles}
                    deletions={pullRequest.deletions}
                    showChangedFiles
                    testId="pull-request-diff-delta"
                  />
                </div>
              </div>
              {pullRequest.labels.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <RepoLabelList labels={pullRequest.labels} />
                </div>
              )}
              {pullRequest.headBranch && pullRequest.baseBranch && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  {pullRequest.headBranch}
                  <span className="text-muted-foreground">→</span>
                  {pullRequest.baseBranch}
                </div>
              )}
            </>
          }
          details={(discussion) => (
            <PullRequestLiveDetails
              discussion={discussion}
              number={number}
              onTabChange={setActiveTab}
              repoId={repoId}
            />
          )}
          hideSidebar={activeTab === "diffs"}
          kind="pull-request"
          management={{
            body: pullRequest.body,
            kind: "pull-request",
            labels: pullRequest.labels,
            number: pullRequest.number,
            organizationId,
            repoId,
            state: pullRequest.state,
            taskLinks: pullRequest.taskLinks,
            title: pullRequest.title,
          }}
          mergedAt={pullRequest.mergedAt}
          number={pullRequest.number}
          onBack={back}
          organizationId={organizationId}
          repoId={repoId}
          taskLinks={pullRequest.taskLinks}
        />
      )}
    </>
  );
}
