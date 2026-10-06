import { HTTPException } from "hono/http-exception";
import { syncGitHubRepo } from "../services/sync-github-repo";
import { getRepoIssue } from "./get-repo-issue";
import { getActingOctokit, getGitHubRepoClient } from "./manage-github-repo";

type CloseReason = "completed" | "not_planned";

export async function closeGitHubIssue({
  repoId,
  number,
  reason,
}: {
  repoId: string;
  number: number;
  reason: CloseReason;
}) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  await octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
    state: "closed",
    state_reason: reason,
  });
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

/** Reopen a mirrored issue using the member's delegated GitHub identity. */
export async function reopenGitHubIssue({
  repoId,
  number,
  userId,
}: {
  repoId: string;
  number: number;
  userId: string;
}) {
  const { repo, octokit } = await getActingOctokit(repoId, userId);
  await octokit.rest.issues.update({
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
    state: "open",
  });
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

async function getIssueNodeId(repoId: string, number: number) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.issues.get({
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
  });
  if (!data.node_id) {
    throw new HTTPException(422, {
      message: "GitHub did not return an issue node ID",
    });
  }
  return { nodeId: data.node_id, octokit };
}

async function getIssueId(repoId: string, number: number) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.issues.get({
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
  });
  return { id: data.id, octokit, repo };
}

/**
 * Sub-issues use REST ids (not node ids) and are only available on repos where
 * GitHub has enabled the feature, so surface a clear error instead of a 404.
 */
export async function addGitHubSubIssue({
  repoId,
  number,
  subIssueNumber,
}: {
  repoId: string;
  number: number;
  subIssueNumber: number;
}) {
  if (number === subIssueNumber) {
    throw new HTTPException(400, {
      message: "An issue cannot be its own sub-issue",
    });
  }
  const [parent, child] = await Promise.all([
    getIssueId(repoId, number),
    getIssueId(repoId, subIssueNumber),
  ]);
  try {
    await parent.octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues",
      {
        owner: parent.repo.owner,
        repo: parent.repo.name,
        issue_number: number,
        sub_issue_id: child.id,
      },
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 410 || status === 422) {
      throw new HTTPException(422, {
        message:
          "GitHub rejected this sub-issue. The repository may not have sub-issues enabled, or the issue is already linked.",
      });
    }
    throw error;
  }
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

export async function removeGitHubSubIssue({
  repoId,
  number,
  subIssueNumber,
}: {
  repoId: string;
  number: number;
  subIssueNumber: number;
}) {
  const [parent, child] = await Promise.all([
    getIssueId(repoId, number),
    getIssueId(repoId, subIssueNumber),
  ]);
  await parent.octokit.request(
    "DELETE /repos/{owner}/{repo}/issues/{issue_number}/sub_issue",
    {
      owner: parent.repo.owner,
      repo: parent.repo.name,
      issue_number: number,
      sub_issue_id: child.id,
    },
  );
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

export async function markGitHubIssueDuplicate({
  repoId,
  number,
  canonicalNumber,
}: {
  repoId: string;
  number: number;
  canonicalNumber: number;
}) {
  if (number === canonicalNumber) {
    throw new HTTPException(400, {
      message: "An issue cannot duplicate itself",
    });
  }
  const [duplicate, canonical] = await Promise.all([
    getIssueNodeId(repoId, number),
    getIssueNodeId(repoId, canonicalNumber),
  ]);
  await duplicate.octokit.graphql(
    "mutation($duplicateId: ID!, $canonicalId: ID!) { markIssueAsDuplicate(input: {duplicateId: $duplicateId, canonicalId: $canonicalId}) { issue { id } } }",
    { duplicateId: duplicate.nodeId, canonicalId: canonical.nodeId },
  );
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

export async function unmarkGitHubIssueDuplicate({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}) {
  const issue = await getIssueNodeId(repoId, number);
  await issue.octokit.graphql(
    "mutation($issueId: ID!) { undoMarkIssueAsDuplicate(input: {issueId: $issueId}) { issue { id } } }",
    { issueId: issue.nodeId },
  );
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

export async function listGitHubMilestones(repoId: string) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  return octokit.paginate("GET /repos/{owner}/{repo}/milestones", {
    owner: repo.owner,
    repo: repo.name,
    state: "all",
    per_page: 100,
  });
}

export async function createGitHubMilestone(
  repoId: string,
  input: { title: string; description?: string; dueOn?: string },
) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.issues.createMilestone({
    owner: repo.owner,
    repo: repo.name,
    title: input.title,
    description: input.description,
    due_on: input.dueOn,
  });
  return data;
}

export async function updateGitHubMilestone(
  repoId: string,
  number: number,
  input: {
    title?: string;
    description?: string | null;
    dueOn?: string | null;
    state?: "open" | "closed";
  },
) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.issues.updateMilestone({
    owner: repo.owner,
    repo: repo.name,
    milestone_number: number,
    title: input.title,
    description: input.description,
    due_on: input.dueOn,
    state: input.state,
  });
  return data;
}
