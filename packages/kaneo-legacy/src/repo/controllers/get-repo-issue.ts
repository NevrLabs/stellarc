import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoIssueTable, repoTable } from "../../database/schema";
import { getGitHubRepoClient } from "./manage-github-repo";
import { getRepoItemTaskLinks } from "./repo-task-links";

const UNSUPPORTED_RELATION_STATUSES = new Set([404, 410, 422]);

async function optionalGitHubRelation<T>(request: Promise<T>) {
  return request
    .then((data) => ({ supported: true, data }))
    .catch((error: unknown) => {
      const status = (error as { status?: number }).status;
      if (status && UNSUPPORTED_RELATION_STATUSES.has(status)) {
        return { supported: false, data: null };
      }
      throw error;
    });
}

type GitHubIssueRelation = {
  html_url?: string;
  number?: number;
  repository_url?: string;
  state?: string;
  title?: string;
};
type GitHubTimelineEvent = {
  source?: {
    issue?: {
      html_url?: string;
      number?: number;
      pull_request?: { merged_at?: string | null };
      state?: string;
      title?: string;
    };
  };
};

export async function getGitHubIssueRelations(
  octokit: {
    paginate: (
      route: string,
      request: Record<string, unknown>,
    ) => Promise<GitHubIssueRelation[]>;
    request: (
      route: string,
      request: Record<string, unknown>,
    ) => Promise<{ data: GitHubIssueRelation }>;
  },
  request: Record<string, unknown>,
) {
  const [parent, subIssues] = await Promise.all([
    optionalGitHubRelation(
      octokit
        .request(
          "GET /repos/{owner}/{repo}/issues/{issue_number}/parent",
          request,
        )
        .then(({ data }) => data),
    ),
    optionalGitHubRelation(
      octokit.paginate(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues",
        request,
      ),
    ),
  ]);

  return {
    parent: parent.data,
    parentSupported: parent.supported,
    subIssues: subIssues.data ?? [],
    subIssuesSupported: subIssues.supported,
  };
}

export async function getRepoIssue(
  repoId: string,
  number: number,
  organizationId?: string,
) {
  const issue = await db.query.repoIssueTable.findFirst({
    where: and(
      eq(repoIssueTable.repoId, repoId),
      eq(repoIssueTable.number, number),
    ),
  });
  if (!issue) throw new HTTPException(404, { message: "Issue not found" });
  const result = {
    ...issue,
    taskLinks: organizationId
      ? await getRepoItemTaskLinks(repoId, number, "issue", organizationId)
      : [],
  };
  const repo = await db.query.repoTable.findFirst({
    where: eq(repoTable.id, repoId),
  });
  if (repo?.provider !== "github") return result;

  let octokit: Awaited<ReturnType<typeof getGitHubRepoClient>>["octokit"];
  try {
    ({ octokit } = await getGitHubRepoClient(repoId));
  } catch (error) {
    // Mirrored issue detail remains usable when the App is unavailable or the
    // repository is an offline fixture. Sync retry handles broken-state marking.
    console.warn("GitHub issue enrichment unavailable; using mirror", error);
    return result;
  }
  const request = {
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
    per_page: 100,
    headers: { accept: "application/vnd.github+json" },
  };
  /*
    Same fallback contract as the client acquisition above: enrichment is
    best-effort. These calls 404 when the issue exists only in the mirror
    (deleted upstream, or a locally seeded row), and previously that rejected
    the whole handler into a 500 — the detail page went blank even though the
    mirror had everything needed to render it.
  */
  let comments: unknown[];
  let timeline: unknown[];
  let relations: Awaited<ReturnType<typeof getGitHubIssueRelations>>;
  let detail: Awaited<ReturnType<typeof octokit.rest.issues.get>>;
  try {
    [comments, timeline, relations, detail] = await Promise.all([
      octokit.paginate(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
        request,
      ),
      octokit.paginate(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline",
        request,
      ),
      getGitHubIssueRelations(octokit, request),
      // The mirror has no milestone column, so read the current assignment
      // live rather than letting the UI assume "no milestone".
      octokit.rest.issues.get({
        owner: repo.owner,
        repo: repo.name,
        issue_number: number,
      }),
    ]);
  } catch (error) {
    console.warn("GitHub issue enrichment failed; using mirror", error);
    return result;
  }

  // GitHub represents development relationships as cross-reference timeline
  // events. Expose linked PRs separately while retaining raw timeline data.
  const linkedPullRequests = (timeline as GitHubTimelineEvent[]).flatMap(
    (event) => {
      const source = event?.source?.issue;
      if (!source?.pull_request) return [];
      return [
        {
          number: source.number,
          title: source.title,
          url: source.html_url,
          state: source.state,
          mergedAt: source.pull_request.merged_at ?? null,
        },
      ];
    },
  );

  return {
    ...result,
    github: {
      comments,
      timeline,
      linkedPullRequests,
      milestone: detail.data.milestone
        ? {
            number: detail.data.milestone.number,
            title: detail.data.milestone.title,
          }
        : null,
      stateReason: detail.data.state_reason ?? null,
      parent: relations.parent,
      parentSupported: relations.parentSupported,
      subIssues: relations.subIssues,
      subIssuesSupported: relations.subIssuesSupported,
    },
  };
}
