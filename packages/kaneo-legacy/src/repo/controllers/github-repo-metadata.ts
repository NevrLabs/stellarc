import { eq } from "drizzle-orm";
import db from "../../database";
import { repoTable } from "../../database/schema";
import { listGitHubMilestones } from "./github-issue-management";
import { getGitHubRepoClient } from "./manage-github-repo";

export type GitHubRepoMetadata = {
  labels: { name: string; color: string; description: string | null }[];
  assignableUsers: { login: string; avatarUrl: string }[];
  milestones: {
    number: number;
    title: string;
    state: string;
    dueOn: string | null;
  }[];
};

const EMPTY_METADATA: GitHubRepoMetadata = {
  labels: [],
  assignableUsers: [],
  milestones: [],
};

/**
 * Live picker data for a GitHub repo: labels, assignable users and milestones.
 *
 * Non-GitHub repos have no equivalent concept here, so they resolve to empty
 * arrays instead of erroring — the frontend renders an empty picker rather
 * than a failed request.
 */
export async function getGitHubRepoMetadata(
  repoId: string,
): Promise<GitHubRepoMetadata> {
  const [repo] = await db
    .select({ provider: repoTable.provider })
    .from(repoTable)
    .where(eq(repoTable.id, repoId))
    .limit(1);

  if (repo?.provider !== "github") {
    return EMPTY_METADATA;
  }

  const { repo: githubRepo, octokit } = await getGitHubRepoClient(repoId);
  const target = { owner: githubRepo.owner, repo: githubRepo.name };

  const [labels, assignees, milestones] = await Promise.all([
    octokit.paginate("GET /repos/{owner}/{repo}/labels", {
      ...target,
      per_page: 100,
    }),
    octokit.paginate("GET /repos/{owner}/{repo}/assignees", {
      ...target,
      per_page: 100,
    }),
    listGitHubMilestones(repoId),
  ]);

  return {
    labels: labels.map((label) => ({
      name: label.name,
      color: label.color,
      description: label.description ?? null,
    })),
    assignableUsers: assignees.map((user) => ({
      login: user.login,
      avatarUrl: user.avatar_url,
    })),
    milestones: milestones.map((milestone) => ({
      number: milestone.number,
      title: milestone.title,
      state: milestone.state,
      dueOn: milestone.due_on ?? null,
    })),
  };
}

export default getGitHubRepoMetadata;
