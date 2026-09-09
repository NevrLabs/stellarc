import type { QueryClient } from "@tanstack/react-query";

/**
 * Drop every cached repo-domain query after a mirror sync.
 *
 * The repo domain has no per-field push messages — a sync can change issues,
 * pull requests, metadata, contents and the repo row itself in one pass, so
 * the only correct reaction is to refetch all of it. Keys are invalidated by
 * prefix: list queries carry extra segments (state, page, limit) and detail
 * queries carry the item number.
 */
export function invalidateRepoQueries(
  queryClient: QueryClient,
  repoId?: string,
): void {
  // Org-scoped repo list ("repos", organizationId, teamScope).
  queryClient.invalidateQueries({ queryKey: ["repos"] });

  const scoped = (prefix: string) =>
    queryClient.invalidateQueries({
      queryKey: repoId ? [prefix, repoId] : [prefix],
    });

  scoped("repo");
  scoped("repo-issues");
  scoped("repo-pull-requests");
  scoped("repo-issue");
  scoped("repo-pull-request");
  scoped("repo-contents");
  scoped("repo-tree");
  scoped("repo-github-metadata");
}
