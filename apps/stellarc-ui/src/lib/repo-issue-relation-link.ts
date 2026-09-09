import type { Repo } from "@/types/repo";

type GitHubIssueRelation = {
  html_url?: string | null;
  number?: number;
  repository_url?: string | null;
};

function repositoryPath(url?: string | null) {
  if (!url) return null;

  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const [owner, name] =
      segments[0] === "repos" ? segments.slice(1, 3) : segments.slice(0, 2);
    return owner && name ? `${owner}/${name}`.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a GitHub issue relation to its local Kaneo repository mirror.
 *
 * GitHub relation responses include `repository_url`; `html_url` is retained as
 * a fallback for older responses that omit it. A relation only receives an
 * in-app route when its repository is connected to this organization.
 */
export function getRepoIssueRelationLink(
  relation: GitHubIssueRelation,
  repos: Repo[],
) {
  if (!relation.number) return null;

  const relationRepository =
    repositoryPath(relation.repository_url) ??
    repositoryPath(relation.html_url);
  if (!relationRepository) return null;

  const repo = repos.find(
    (candidate) =>
      `${candidate.owner}/${candidate.name}`.toLowerCase() ===
      relationRepository,
  );

  return repo ? { number: relation.number, repoId: repo.id } : null;
}

export const REPO_ISSUE_ROUTE =
  "/dashboard/organization/$organizationSlug/repo/$repoId/issues/$number";

export type RepoIssueRelationTarget =
  | {
      internal: true;
      href: string;
      to: typeof REPO_ISSUE_ROUTE;
      params: { organizationSlug: string; repoId: string; number: string };
    }
  | { internal: false; href: string | null };

/**
 * Decides where a GitHub issue relation should navigate.
 *
 * When the related repository is synced into this Kaneo organization the link
 * must stay in-app (#30); otherwise it falls back to the GitHub URL. Returning
 * a concrete `href` for both branches keeps the decision testable without a
 * router.
 */
export function getRepoIssueRelationTarget(
  relation: GitHubIssueRelation,
  repos: Repo[],
  organizationId: string,
): RepoIssueRelationTarget {
  const link = getRepoIssueRelationLink(relation, repos);

  if (!link) return { internal: false, href: relation.html_url ?? null };

  const params = {
    organizationSlug: organizationId,
    repoId: link.repoId,
    number: String(link.number),
  };

  return {
    internal: true,
    href: `/dashboard/organization/${organizationId}/repo/${link.repoId}/issues/${link.number}`,
    to: REPO_ISSUE_ROUTE,
    params,
  };
}
