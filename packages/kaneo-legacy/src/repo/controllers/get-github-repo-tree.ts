import { getGitHubRepoClient } from "./manage-github-repo";

export type GitHubRepoTreeEntry = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
};

export type GitHubRepoTree = {
  entries: GitHubRepoTreeEntry[];
  ref: string;
  truncated: boolean;
};

function entryType(entry: { type?: string; mode?: string }) {
  if (entry.type === "tree") return "dir" as const;
  if (entry.type === "commit") return "submodule" as const;
  if (entry.mode === "120000") return "symlink" as const;
  return "file" as const;
}

/**
 * Read the repository tree in one GitHub request after resolving its ref.
 * GitHub truncates exceptionally large recursive trees; callers must use the
 * existing contents endpoint as a bounded lazy fallback in that case.
 */
export async function getGitHubRepoTree({
  repoId,
  ref,
}: {
  repoId: string;
  ref?: string;
}): Promise<GitHubRepoTree> {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const resolvedRef = ref ?? repo.defaultBranch ?? "HEAD";
  const { data: commit } = await octokit.rest.repos.getCommit({
    owner: repo.owner,
    repo: repo.name,
    ref: resolvedRef,
  });
  const { data: tree } = await octokit.rest.git.getTree({
    owner: repo.owner,
    repo: repo.name,
    tree_sha: commit.commit.tree.sha,
    recursive: "1",
  });

  return {
    entries: (tree.tree ?? [])
      .filter((entry) => entry.path && entry.sha)
      .map((entry) => {
        const path = entry.path as string;
        return {
          name: path.split("/").pop() as string,
          path,
          type: entryType(entry),
          size: entry.size ?? 0,
          sha: entry.sha as string,
        };
      }),
    ref: commit.sha,
    truncated: tree.truncated,
  };
}

export default getGitHubRepoTree;
