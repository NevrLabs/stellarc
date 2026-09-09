import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import PageTitle from "@/components/page-title";
import RepoIssueHistory from "@/components/repo/repo-issue-history";
import RepoIssueRelations from "@/components/repo/repo-issue-relations";
import { RepoItemTitleAction } from "@/components/repo/repo-item-actions";
import {
  RepoItemDetailLayout,
  RepoItemDetailSkeleton,
  RepoItemNotFound,
} from "@/components/repo/repo-item-detail-layout";
import RepoStateBadge from "@/components/repo/repo-state-badge";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoIssue from "@/hooks/queries/repo/use-get-repo-issue";
import { formatDateMedium } from "@/lib/format";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/issues/$number",
)({ component: RouteComponent });

function RouteComponent() {
  const navigate = useNavigate();
  const { organizationSlug, repoId, number: numberParam } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const number = Number(numberParam);
  const { data: repo } = useGetRepo({ id: repoId });
  const {
    data: issue,
    isLoading,
    isError,
  } = useGetRepoIssue({ repoId, number });
  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const back = () =>
    navigate({
      to: "/dashboard/organization/$organizationSlug/repo/$repoId/issues",
      params: { organizationId, repoId },
    });

  return (
    <>
      <PageTitle
        title={
          issue ? `#${issue.number} · ${issue.title}` : `${repoTitle} · Issue`
        }
      />
      {isLoading ? (
        <RepoItemDetailSkeleton kind="issue" />
      ) : isError || !issue ? (
        <RepoItemNotFound kind="issue" onBack={back} />
      ) : (
        <RepoItemDetailLayout
          body={issue.body}
          closedAt={issue.closedAt}
          commentCount={issue.commentCount}
          details={
            <RepoIssueRelations
              github={issue.github}
              number={issue.number}
              organizationId={organizationId}
              repoId={repoId}
            />
          }
          header={
            <>
              <div className="flex min-w-0 items-start gap-2">
                <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-tight sm:text-2xl">
                  {issue.title}
                </h1>
                <RepoItemTitleAction
                  kind="issue"
                  number={issue.number}
                  repoId={repoId}
                  title={issue.title}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <RepoStateBadge state={issue.state} />
                <span>#{issue.number}</span>
                {issue.authorLogin && (
                  <span>opened by {issue.authorLogin}</span>
                )}
                {issue.externalCreatedAt && (
                  <span>{formatDateMedium(issue.externalCreatedAt)}</span>
                )}
                <a
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  href={issue.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  GitHub <ExternalLink className="size-3" />
                </a>
              </div>
            </>
          }
          history={<RepoIssueHistory github={issue.github} />}
          kind="issue"
          management={{
            assignees: issue.assigneeLogins ?? [],
            body: issue.body,
            kind: "issue",
            labels: issue.labels,
            milestoneNumber: issue.github?.milestone?.number ?? null,
            number: issue.number,
            organizationId,
            repoId,
            state: issue.state,
            taskLinks: issue.taskLinks,
            title: issue.title,
          }}
          number={issue.number}
          onBack={back}
          organizationId={organizationId}
          repoId={repoId}
          taskLinks={issue.taskLinks}
        />
      )}
    </>
  );
}
