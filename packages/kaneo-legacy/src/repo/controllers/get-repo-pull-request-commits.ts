import { getGitHubRepoClient } from "./manage-github-repo";

export type GitHubPullRequestCommit = {
  sha: string;
  message: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string | null;
  url: string;
};

export type GitHubPullRequestCommits = {
  commits: GitHubPullRequestCommit[];
};

/**
 * Serve a pull request's commit history live from GitHub. Same rationale as the
 * files endpoint: read-only, single-page data that would only rot in the mirror.
 *
 * Paginated because GitHub returns at most 100 commits per page.
 */
export async function getRepoPullRequestCommits({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}): Promise<GitHubPullRequestCommits> {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    owner: repo.owner,
    repo: repo.name,
    pull_number: number,
    per_page: 100,
  });

  return {
    commits: commits.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      // `author` is the linked GitHub account and is null for commits authored
      // by an email GitHub cannot map to a user; fall back to the git author
      // name so the UI always has something to attribute the commit to.
      authorLogin: commit.author?.login ?? commit.commit.author?.name ?? null,
      authorAvatarUrl: commit.author?.avatar_url ?? null,
      committedAt:
        commit.commit.committer?.date ?? commit.commit.author?.date ?? null,
      url: commit.html_url,
    })),
  };
}

export default getRepoPullRequestCommits;
