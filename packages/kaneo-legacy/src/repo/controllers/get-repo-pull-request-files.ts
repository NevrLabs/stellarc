import { getGitHubRepoClient } from "./manage-github-repo";

export type GitHubPullRequestFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  /** Null for binary files and for files GitHub omits the patch on (too large). */
  patch: string | null;
};

export type GitHubPullRequestFiles = {
  files: GitHubPullRequestFile[];
  totals: {
    additions: number;
    deletions: number;
    changedFiles: number;
  };
};

/**
 * Serve a pull request's changed files (patch text + per-file counts) live from
 * GitHub instead of mirroring them into Postgres: diffs are large, read-only and
 * only ever viewed on the PR detail page, so the client-side query cache is the
 * right place for them.
 *
 * Paginated because GitHub returns at most 100 files per page (and caps a PR's
 * file list at 300 overall) — a single request would silently truncate wide PRs.
 */
export async function getRepoPullRequestFiles({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}): Promise<GitHubPullRequestFiles> {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: repo.owner,
    repo: repo.name,
    pull_number: number,
    per_page: 100,
  });

  const mapped = files.map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    // Binary files carry no patch. Keep the row so the UI can still show the
    // rename/add/delete and its counts, rather than dropping the file entirely.
    patch: file.patch ?? null,
  }));

  return {
    files: mapped,
    totals: {
      additions: mapped.reduce((sum, file) => sum + file.additions, 0),
      deletions: mapped.reduce((sum, file) => sum + file.deletions, 0),
      changedFiles: mapped.length,
    },
  };
}

export default getRepoPullRequestFiles;
