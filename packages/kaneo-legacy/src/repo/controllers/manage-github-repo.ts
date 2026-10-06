import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { Octokit } from "octokit";
import db from "../../database";
import { repoTable, userTable } from "../../database/schema";
import { getUsableDelegatedToken } from "../../github-delegation";
import {
  getGithubApp,
  getInstallationOctokit,
} from "../../plugins/github/utils/github-app";
import { syncGitHubIssue, syncGitHubRepo } from "../services/sync-github-repo";
import { getRepoIssue } from "./get-repo-issue";
import { getRepoPullRequest } from "./get-repo-pull-request";
import {
  formatGitHubCommentBody,
  selectGitHubCommentAuthor,
} from "./github-comment-author-policy";

type GitHubItemKind = "issue" | "pullRequest";

type UpdateGitHubItemInput = {
  title?: string;
  body?: string | null;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
  milestone?: number | null;
};

function configuredInstallationId(
  repo: typeof repoTable.$inferSelect,
): number | null {
  const config = (repo.config ?? {}) as { installationId?: number | string };
  const raw = config.installationId;
  const installationId = typeof raw === "string" ? Number(raw) : raw;
  return installationId && Number.isInteger(installationId)
    ? installationId
    : null;
}

/**
 * Resolve the live installation ID that can actually reach this repo.
 *
 * A repo's `config.installationId` is a cache, and it goes stale the moment the
 * user uninstalls/reinstalls the GitHub App (GitHub issues a brand new
 * installation ID each time). The old ID then 404s on every token request,
 * which surfaced as blanket 500s across the repo UI.
 *
 * Strategy: ask the App which installation owns `repo.owner`, and persist that
 * so subsequent calls stay cheap. Fall back to the cached ID only if the
 * lookup fails for an unrelated reason.
 */
export async function resolveInstallationId(
  repo: typeof repoTable.$inferSelect,
): Promise<number> {
  const cached = configuredInstallationId(repo);
  const app = getGithubApp();
  if (!app) {
    if (cached) return cached;
    throw new HTTPException(422, {
      message: "GitHub App is not configured on this instance",
    });
  }

  let liveId: number | null = null;
  try {
    // Works for both user- and organization-owned accounts.
    const { data } = await app.octokit.request(
      "GET /users/{username}/installation",
      { username: repo.owner },
    );
    liveId = data.id;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404) throw error;
  }

  if (!liveId) {
    throw new HTTPException(422, {
      message: `The Kaneo GitHub App is not installed on "${repo.owner}". Install it for that account, then reload.`,
    });
  }

  if (liveId !== cached) {
    // Self-heal the cache so we stop hammering a dead installation.
    await db
      .update(repoTable)
      .set({
        config: { ...(repo.config ?? {}), installationId: liveId },
        updatedAt: new Date(),
      })
      .where(eq(repoTable.id, repo.id));
  }

  return liveId;
}

/**
 * Reconcile an issue's assignees to an exact list.
 *
 * The pinned Octokit build has addAssignees/removeAssignees but no
 * setAssignees, so calling setAssignees threw a TypeError and every
 * assignee change failed.
 */
async function setGitHubAssignees({
  octokit,
  owner,
  repo,
  issue_number,
  assignees,
}: {
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>;
  owner: string;
  repo: string;
  issue_number: number;
  assignees: string[];
}) {
  const { data } = await octokit.rest.issues.get({ owner, repo, issue_number });
  const current = (data.assignees ?? []).map((user) => user.login);
  const desired = [...new Set(assignees)];
  const toAdd = desired.filter((login) => !current.includes(login));
  const toRemove = current.filter((login) => !desired.includes(login));

  if (toRemove.length > 0) {
    await octokit.rest.issues.removeAssignees({
      owner,
      repo,
      issue_number,
      assignees: toRemove,
    });
  }
  if (toAdd.length > 0) {
    await octokit.rest.issues.addAssignees({
      owner,
      repo,
      issue_number,
      assignees: toAdd,
    });
  }
}

export async function getGitHubRepoClient(repoId: string) {
  const repo = await db.query.repoTable.findFirst({
    where: eq(repoTable.id, repoId),
  });
  if (!repo) throw new HTTPException(404, { message: "Repo not found" });
  if (repo.provider !== "github") {
    throw new HTTPException(400, {
      message: "GitHub mutations are only supported for GitHub repos",
    });
  }

  return {
    repo,
    octokit: await getInstallationOctokit(await resolveInstallationId(repo)),
  };
}

export async function updateGitHubItem({
  repoId,
  number,
  kind,
  updates,
  userId,
}: {
  repoId: string;
  number: number;
  kind: GitHubItemKind;
  updates: UpdateGitHubItemInput;
  userId?: string;
}) {
  if (Object.keys(updates).length === 0) {
    throw new HTTPException(400, { message: "At least one field is required" });
  }

  // Attribute the change to the acting member, not the Kaneo App bot.
  const { repo, octokit } = await getActingOctokit(repoId, userId);
  const issue_number = number;

  // Batch every field change concurrently instead of serially: GitHub's issue
  // update, labels, and assignees are independent endpoints.
  await Promise.all([
    updates.title !== undefined ||
    updates.body !== undefined ||
    updates.state !== undefined ||
    updates.milestone !== undefined
      ? octokit.rest.issues.update({
          owner: repo.owner,
          repo: repo.name,
          issue_number,
          title: updates.title,
          body: updates.body,
          state: updates.state,
          milestone: updates.milestone,
        })
      : Promise.resolve(),
    updates.labels === undefined
      ? Promise.resolve()
      : octokit.rest.issues.setLabels({
          owner: repo.owner,
          repo: repo.name,
          issue_number,
          labels: updates.labels,
        }),
    // This Octokit build exposes addAssignees/removeAssignees but no
    // setAssignees, so reconcile the desired list against the current one.
    updates.assignees === undefined
      ? Promise.resolve()
      : setGitHubAssignees({
          octokit,
          owner: repo.owner,
          repo: repo.name,
          issue_number,
          assignees: updates.assignees,
        }),
  ]);

  // A full repo re-sync made every metadata edit wait on all issues and PRs.
  // Return the fresh single item instead and let the mirror catch up in the
  // background, so the UI responds immediately.
  void syncGitHubRepo(repoId).catch((error) => {
    console.error("[updateGitHubItem] background sync failed", error);
  });

  return kind === "issue"
    ? getRepoIssue(repoId, number)
    : getRepoPullRequest(repoId, number);
}

/**
 * Prefer the acting member's delegated GitHub token so writes are attributed to
 * them instead of the Kaneo App bot. Falls back to the installation token when
 * the user hasn't connected their GitHub account (or the grant was revoked).
 */
export async function getActingOctokit(
  repoId: string,
  userId?: string,
): Promise<{
  repo: typeof repoTable.$inferSelect;
  octokit: Octokit;
  actedAsUser: boolean;
}> {
  const { repo, octokit: installationOctokit } =
    await getGitHubRepoClient(repoId);
  if (!userId) {
    return { repo, octokit: installationOctokit, actedAsUser: false };
  }

  // Refreshes the 8h App user token when needed; null means no delegation.
  const delegatedToken = await getUsableDelegatedToken(userId);
  const grant = delegatedToken ? { accessToken: delegatedToken } : undefined;

  if (!grant?.accessToken) {
    return { repo, octokit: installationOctokit, actedAsUser: false };
  }

  return {
    repo,
    octokit: new Octokit({ auth: grant.accessToken }),
    actedAsUser: true,
  };
}

export async function createGitHubItemComment({
  repoId,
  number,
  body,
  userId,
}: {
  repoId: string;
  number: number;
  body: string;
  userId: string;
}) {
  const { repo, octokit: installationOctokit } =
    await getGitHubRepoClient(repoId);
  const result = await createGitHubComment({
    owner: repo.owner,
    repo: repo.name,
    number,
    body,
    userId,
    installationOctokit,
  });

  /*
    Refresh the mirror's comment count for THIS issue only. This used to call
    syncGitHubRepo(repoId) — a full re-mirror that paginates every issue and
    every pull request in the repository — inside the comment request, so
    posting one comment on a synced task took as long as an initial repo sync.
    Fire-and-forget: the comment is already on GitHub, and a count refresh is
    not worth holding the response for (same pattern as the background sync
    kick-off above).
  */
  void installationOctokit
    .request("GET /repos/{owner}/{repo}/issues/{issue_number}", {
      owner: repo.owner,
      repo: repo.name,
      issue_number: number,
    })
    .then(({ data: issue }) =>
      syncGitHubIssue(repoId, issue as Record<string, unknown>),
    )
    .catch((error) => {
      console.warn("Failed to refresh mirrored issue after comment", error);
    });
  return result;
}

export async function createGitHubComment({
  owner,
  repo,
  number,
  body,
  userId,
  installationOctokit,
  fallbackToInstallation = false,
}: {
  owner: string;
  repo: string;
  number: number;
  body: string;
  userId: string;
  installationOctokit: Octokit;
  fallbackToInstallation?: boolean;
}) {
  // This is deliberately a dedicated grant, separate from sign-in OAuth.
  // Sign-in commonly has user:email only; delegated identity has repo scope.
  // Refreshes the 8h App user token when needed; null means no delegation, so
  // the caller falls back to the app instead of posting with a dead token.
  const delegatedAccessToken = await getUsableDelegatedToken(userId);
  const githubAccount = delegatedAccessToken
    ? { accessToken: delegatedAccessToken }
    : undefined;
  const [user] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  // A delegated grant makes the GitHub user the real author. When that grant is
  // an App user token, GitHub itself renders "with <App>" provenance, so Kaneo
  // adds no footer — a manual one would duplicate what GitHub already shows.
  // Only the App-installation fallback needs an attribution line, because there
  // the author is the bot rather than the person.
  let octokit = installationOctokit;
  let { author } = selectGitHubCommentAuthor(
    Boolean(githubAccount?.accessToken),
  );
  // Attribution is applied on both paths: the delegated comment is authored by
  // the real user, but the trailing line still records that it came from Kaneo.
  const commentBody = formatGitHubCommentBody(body, user?.name);
  if (githubAccount?.accessToken) {
    octokit = new Octokit({ auth: githubAccount.accessToken });
  }

  let data: Awaited<
    ReturnType<typeof octokit.rest.issues.createComment>
  >["data"];
  try {
    ({ data } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: commentBody,
    }));
  } catch (error) {
    if (!fallbackToInstallation || !githubAccount?.accessToken) throw error;
    // The body already carries attribution, so the fallback reuses it as-is.
    author = "github-app";
    ({ data } = await installationOctokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: commentBody,
    }));
  }
  return {
    id: String(data.id),
    url: data.html_url,
    createdAt: new Date(data.created_at),
    author,
  };
}

export async function mergeGitHubPullRequest({
  repoId,
  number,
  method,
}: {
  repoId: string;
  number: number;
  method?: "merge" | "squash" | "rebase";
}) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.pulls.merge({
    owner: repo.owner,
    repo: repo.name,
    pull_number: number,
    merge_method: method,
  });

  if (!data.merged) {
    throw new HTTPException(409, {
      message: data.message || "GitHub pull request could not be merged",
    });
  }

  await syncGitHubRepo(repoId);
  return getRepoPullRequest(repoId, number);
}
