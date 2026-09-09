import { Link } from "@tanstack/react-router";
import { Github } from "lucide-react";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import useGetTaskRepoLinks from "@/hooks/queries/task/use-get-task-repo-links";
import { getRepoIssueRelationTarget } from "@/lib/repo-issue-relation-link";
import type { ExternalLink } from "@/types/external-link";

function repositoryLabel(url: string) {
  try {
    const [owner, repo] = new URL(url).pathname.split("/").filter(Boolean);
    return owner && repo ? `${owner}/${repo}` : null;
  } catch {
    return null;
  }
}

/**
 * The task's canonical **synced** GitHub issue, shown in the detail drawer's
 * status bar (#75).
 *
 * Synced is not the same relationship as Linked:
 *   - **Synced** — this ticket's content flows to and from that issue.
 *   - **Linked** — "this ticket mentions that issue".
 *
 * A synced issue can arrive by either of two routes, and both must be honoured:
 *   1. the board↔GitHub integration, which writes an `externalLink` row of
 *      `resourceType: "issue"`; and
 *   2. "Create synced issue in repo", which writes a `task_repo_item_link`
 *      with `syncEnabled: true` and NO externalLink at all.
 *
 * Reading only (1) is why a freshly created synced issue showed nothing here
 * and appeared as a plain link in Resources.
 */
export default function TaskSyncedIssueProperty({
  taskId,
  organizationId,
  compact = false,
  showLabel = false,
}: {
  taskId: string;
  organizationId?: string;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const { data: externalLinks = [] } = useExternalLinks(taskId);
  const { data: repoLinks = [] } = useGetTaskRepoLinks(taskId);
  const { data: repos = [] } = useGetRepos({
    organizationId: organizationId ?? "",
    enabled: Boolean(organizationId),
  });

  const integrationIssue = (externalLinks as ExternalLink[]).find(
    (link) => link.resourceType === "issue",
  );
  const syncedRepoLink = repoLinks.find(
    (link) => link.itemType === "issues" && link.syncEnabled,
  );

  const issue = integrationIssue
    ? {
        url: integrationIssue.url,
        number: integrationIssue.externalId,
        title: integrationIssue.title,
      }
    : syncedRepoLink
      ? {
          url: syncedRepoLink.url,
          number: String(syncedRepoLink.number),
          title: syncedRepoLink.title,
        }
      : null;

  if (!issue) return null;

  const repo = repositoryLabel(issue.url);
  const label = `${repo ? `${repo} ` : ""}#${issue.number}`;
  const linkClassName = `flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-semibold hover:bg-accent ${
    compact ? "max-w-48" : "w-full"
  }`;
  const ariaLabel = `${label}${issue.title ? ` ${issue.title}` : ""}`;
  const body = (
    <>
      <Github className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </>
  );

  // #30: when the synced issue lives in a repository connected to this
  // organization, keep navigation inside Kaneo. Only genuinely external
  // issues should escape to GitHub in a new tab.
  const target = getRepoIssueRelationTarget(
    { number: Number(issue.number), html_url: issue.url },
    repos,
    organizationId ?? "",
  );

  const link =
    organizationId && target.internal ? (
      <Link
        aria-label={ariaLabel}
        className={linkClassName}
        data-testid="task-synced-issue"
        params={target.params}
        title={issue.title ?? label}
        to={target.to}
      >
        {body}
      </Link>
    ) : (
      <a
        aria-label={ariaLabel}
        className={linkClassName}
        data-testid="task-synced-issue"
        href={issue.url}
        rel="noreferrer"
        target="_blank"
        title={issue.title ?? label}
      >
        {body}
      </a>
    );

  if (!showLabel) return link;

  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-xs font-medium text-foreground/70">
        Synced issue
      </span>
      {link}
    </div>
  );
}
