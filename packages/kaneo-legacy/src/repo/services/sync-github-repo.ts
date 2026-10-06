import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  repoIssueTable,
  repoPullRequestTable,
  repoTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { getInstallationOctokit } from "../../plugins/github/utils/github-app";
import { resolveInstallationId } from "../controllers/manage-github-repo";

/**
 * Mirror a GitHub repository's issues and pull requests into repo_issue /
 * repo_pull_request.
 *
 * This is a straight mirror of the provider's own data: state, labels and
 * numbers are stored as GitHub reports them. Nothing here touches tasks,
 * boards or columns — repos are a separate domain by design.
 */

/**
 * Mirror a single GitHub issue into repo_issue.
 *
 * Split out of syncGitHubRepo() so callers that just created or touched one
 * issue don't have to re-paginate every issue and pull request in the repo —
 * that full mirror is slow enough on real repos to exceed an edge proxy's
 * request timeout, which would leave a freshly created GitHub issue with no
 * corresponding local row.
 */
export async function syncGitHubIssue(
  repoId: string,
  item: Record<string, unknown>,
) {
  const values = toRepoIssueValues(repoId, item);
  await db
    .insert(repoIssueTable)
    .values(values)
    .onConflictDoUpdate({
      target: [repoIssueTable.repoId, repoIssueTable.number],
      set: {
        title: values.title,
        body: values.body,
        state: values.state,
        authorLogin: values.authorLogin,
        authorAvatarUrl: values.authorAvatarUrl,
        assigneeLogins: values.assigneeLogins,
        labels: values.labels,
        commentCount: values.commentCount,
        url: values.url,
        externalUpdatedAt: values.externalUpdatedAt,
        closedAt: values.closedAt,
        updatedAt: new Date(),
      },
    });
  return values.number;
}

function toRepoIssueValues(repoId: string, item: Record<string, unknown>) {
  return {
    repoId,
    number: item.number as number,
    externalId: item.id != null ? String(item.id) : null,
    title: (item.title as string) ?? "",
    body: (item.body as string | null) ?? null,
    state: (item.state as string) ?? "open",
    authorLogin:
      ((item.user as { login?: string } | null)?.login as string) ?? null,
    authorAvatarUrl:
      ((item.user as { avatar_url?: string } | null)?.avatar_url as string) ??
      null,
    assigneeLogins: Array.isArray(item.assignees)
      ? (item.assignees as Array<{ login?: string }>)
          .map((a) => a?.login)
          .filter((x): x is string => Boolean(x))
      : [],
    labels: normalizeLabels(item.labels as GitHubLabel[] | undefined),
    commentCount: (item.comments as number) ?? 0,
    url: (item.html_url as string) ?? "",
    externalCreatedAt: toDate(item.created_at as string),
    externalUpdatedAt: toDate(item.updated_at as string),
    closedAt: toDate(item.closed_at as string | null),
  };
}

type RepoRow = typeof repoTable.$inferSelect;

type GitHubLabel = string | { name?: string | null; color?: string | null };

function normalizeLabels(
  labels: GitHubLabel[] | undefined,
): Array<{ name: string; color?: string }> {
  if (!Array.isArray(labels)) return [];
  const out: Array<{ name: string; color?: string }> = [];
  for (const l of labels) {
    if (typeof l === "string") {
      out.push({ name: l });
    } else if (l?.name) {
      out.push({ name: l.name, color: l.color ?? undefined });
    }
  }
  return out;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function syncGitHubRepo(repoId: string): Promise<{
  issues: number;
  pullRequests: number;
}> {
  const repo = await db.query.repoTable.findFirst({
    where: eq(repoTable.id, repoId),
  });

  if (!repo) {
    throw new Error("Repo not found");
  }
  if (repo.provider !== "github") {
    throw new Error(`Repo ${repoId} is not a GitHub repo`);
  }

  // Resolve the installation live: a cached ID dies on App uninstall/reinstall.
  const octokit = await getInstallationOctokit(
    await resolveInstallationId(repo),
  );

  // GitHub's issues endpoint returns PRs too; separate them by `pull_request`.
  const rawItems = await octokit.paginate("GET /repos/{owner}/{repo}/issues", {
    owner: repo.owner,
    repo: repo.name,
    state: "all",
    per_page: 100,
  });

  let issueCount = 0;
  for (const item of rawItems as Array<Record<string, unknown>>) {
    if (item.pull_request) continue;

    const values = toRepoIssueValues(repo.id, item);

    await db
      .insert(repoIssueTable)
      .values(values)
      .onConflictDoUpdate({
        target: [repoIssueTable.repoId, repoIssueTable.number],
        set: {
          title: values.title,
          body: values.body,
          state: values.state,
          authorLogin: values.authorLogin,
          authorAvatarUrl: values.authorAvatarUrl,
          assigneeLogins: values.assigneeLogins,
          labels: values.labels,
          commentCount: values.commentCount,
          url: values.url,
          externalUpdatedAt: values.externalUpdatedAt,
          closedAt: values.closedAt,
          updatedAt: new Date(),
        },
      });
    issueCount++;
  }

  const rawPulls = await octokit.paginate("GET /repos/{owner}/{repo}/pulls", {
    owner: repo.owner,
    repo: repo.name,
    state: "all",
    per_page: 100,
  });

  let prCount = 0;
  for (const item of rawPulls as Array<Record<string, unknown>>) {
    const mergedAt = toDate(item.merged_at as string | null);
    // GitHub reports merged PRs as state "closed"; surface "merged" explicitly.
    const state = mergedAt ? "merged" : ((item.state as string) ?? "open");

    // The list payload carries no diff counts, so read them from the stored row
    // and only spend a detail request when they are missing or the PR changed
    // upstream. Re-fetching every PR on every sync would burn rate limit.
    const externalUpdatedAt = toDate(item.updated_at as string);
    const [existing] = await db
      .select({
        additions: repoPullRequestTable.additions,
        deletions: repoPullRequestTable.deletions,
        changedFiles: repoPullRequestTable.changedFiles,
        externalUpdatedAt: repoPullRequestTable.externalUpdatedAt,
      })
      .from(repoPullRequestTable)
      .where(
        and(
          eq(repoPullRequestTable.repoId, repo.id),
          eq(repoPullRequestTable.number, item.number as number),
        ),
      )
      .limit(1);

    let delta = {
      additions: existing?.additions ?? null,
      deletions: existing?.deletions ?? null,
      changedFiles: existing?.changedFiles ?? null,
    };
    const deltaMissing =
      delta.additions === null ||
      delta.deletions === null ||
      delta.changedFiles === null;
    const changedUpstream =
      externalUpdatedAt !== null &&
      existing?.externalUpdatedAt?.getTime() !== externalUpdatedAt.getTime();
    if (deltaMissing || changedUpstream) {
      try {
        const detail = await octokit.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}",
          {
            owner: repo.owner,
            repo: repo.name,
            pull_number: item.number as number,
          },
        );
        delta = {
          additions: detail.data.additions ?? null,
          deletions: detail.data.deletions ?? null,
          changedFiles: detail.data.changed_files ?? null,
        };
      } catch (error) {
        // A single unreadable pull request must not abort the whole sync; the
        // list still renders, just without a delta for this row.
        console.error(
          `Failed to read diff counts for pull request #${item.number}:`,
          error,
        );
      }
    }

    const values = {
      repoId: repo.id,
      number: item.number as number,
      externalId: item.id != null ? String(item.id) : null,
      title: (item.title as string) ?? "",
      body: (item.body as string | null) ?? null,
      state,
      isDraft: Boolean(item.draft),
      authorLogin:
        ((item.user as { login?: string } | null)?.login as string) ?? null,
      authorAvatarUrl:
        ((item.user as { avatar_url?: string } | null)?.avatar_url as string) ??
        null,
      headBranch:
        ((item.head as { ref?: string } | null)?.ref as string) ?? null,
      baseBranch:
        ((item.base as { ref?: string } | null)?.ref as string) ?? null,
      labels: normalizeLabels(item.labels as GitHubLabel[] | undefined),
      commentCount: (item.comments as number) ?? 0,
      additions: delta.additions,
      deletions: delta.deletions,
      changedFiles: delta.changedFiles,
      url: (item.html_url as string) ?? "",
      externalCreatedAt: toDate(item.created_at as string),
      externalUpdatedAt,
      mergedAt,
      closedAt: toDate(item.closed_at as string | null),
    };

    await db
      .insert(repoPullRequestTable)
      .values(values)
      .onConflictDoUpdate({
        target: [repoPullRequestTable.repoId, repoPullRequestTable.number],
        set: {
          title: values.title,
          body: values.body,
          state: values.state,
          isDraft: values.isDraft,
          authorLogin: values.authorLogin,
          authorAvatarUrl: values.authorAvatarUrl,
          headBranch: values.headBranch,
          baseBranch: values.baseBranch,
          labels: values.labels,
          commentCount: values.commentCount,
          additions: values.additions,
          deletions: values.deletions,
          changedFiles: values.changedFiles,
          url: values.url,
          externalUpdatedAt: values.externalUpdatedAt,
          mergedAt: values.mergedAt,
          closedAt: values.closedAt,
          updatedAt: new Date(),
        },
      });
    prCount++;
  }

  await db
    .update(repoTable)
    .set({ lastSyncedAt: new Date() })
    .where(eq(repoTable.id, repo.id));

  // Tell connected clients the mirror changed so they can drop cached repo
  // queries. Every sync path (manual resync, webhooks, the stale-repo
  // scheduler, issue management) funnels through here.
  await publishEvent("repo.synced", {
    repoId: repo.id,
    organizationId: repo.organizationId,
  });

  return { issues: issueCount, pullRequests: prCount };
}
