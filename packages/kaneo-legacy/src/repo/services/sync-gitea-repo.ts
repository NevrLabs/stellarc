import { eq } from "drizzle-orm";
import db from "../../database";
import {
  repoIssueTable,
  repoPullRequestTable,
  repoTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Mirror a Gitea repository's issues and pull requests into repo_issue /
 * repo_pull_request.
 *
 * Gitea exposes a GitHub-compatible-ish REST API but authenticates with a
 * per-instance access token against a self-hosted base URL, so it can't reuse
 * the GitHub App client. As with GitHub, this is a pure mirror — no tasks,
 * boards or columns are touched.
 */

type RepoRow = typeof repoTable.$inferSelect;

type GiteaRepoConfig = {
  baseUrl?: string;
  accessToken?: string;
};

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeLabels(
  labels: Array<{ name?: string | null; color?: string | null }> | undefined,
): Array<{ name: string; color?: string }> {
  if (!Array.isArray(labels)) return [];
  return labels
    .filter((l) => Boolean(l?.name))
    .map((l) => ({
      name: l.name as string,
      color: l.color ?? undefined,
    }));
}

function readConfig(repo: RepoRow): { baseUrl: string; token: string } {
  const cfg = (repo.config ?? {}) as GiteaRepoConfig;
  if (!cfg.baseUrl || !cfg.accessToken) {
    throw new Error(
      `Repo ${repo.owner}/${repo.name} is missing baseUrl or accessToken in config`,
    );
  }
  return { baseUrl: normalizeBaseUrl(cfg.baseUrl), token: cfg.accessToken };
}

async function giteaGetAll(
  baseUrl: string,
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const limit = 50;

  for (let page = 1; page <= 100; page++) {
    const qs = new URLSearchParams({
      ...params,
      page: String(page),
      limit: String(limit),
    });
    const res = await fetch(`${baseUrl}/api/v1${path}?${qs.toString()}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(
        `Gitea request failed (${res.status}) for ${path}: ${await res.text()}`,
      );
    }

    const batch = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < limit) break;
  }

  return out;
}

export async function syncGiteaRepo(repoId: string): Promise<{
  issues: number;
  pullRequests: number;
}> {
  const repo = await db.query.repoTable.findFirst({
    where: eq(repoTable.id, repoId),
  });

  if (!repo) {
    throw new Error("Repo not found");
  }
  if (repo.provider !== "gitea") {
    throw new Error(`Repo ${repoId} is not a Gitea repo`);
  }

  const { baseUrl, token } = readConfig(repo);
  const slug = `/repos/${repo.owner}/${repo.name}`;

  // Gitea's /issues endpoint also returns PRs; filter them out via `pull_request`.
  const rawIssues = await giteaGetAll(baseUrl, token, `${slug}/issues`, {
    state: "all",
    type: "issues",
  });

  let issueCount = 0;
  for (const item of rawIssues) {
    if (item.pull_request) continue;

    const values = {
      repoId: repo.id,
      number: item.number as number,
      externalId: item.id != null ? String(item.id) : null,
      title: (item.title as string) ?? "",
      body: (item.body as string | null) ?? null,
      state: (item.state as string) ?? "open",
      authorLogin: (item.user as { login?: string } | null)?.login ?? null,
      authorAvatarUrl:
        (item.user as { avatar_url?: string } | null)?.avatar_url ?? null,
      assigneeLogins: Array.isArray(item.assignees)
        ? (item.assignees as Array<{ login?: string }>)
            .map((a) => a?.login)
            .filter((x): x is string => Boolean(x))
        : [],
      labels: normalizeLabels(
        item.labels as Array<{ name?: string; color?: string }> | undefined,
      ),
      commentCount: (item.comments as number) ?? 0,
      url: (item.html_url as string) ?? "",
      externalCreatedAt: toDate(item.created_at as string),
      externalUpdatedAt: toDate(item.updated_at as string),
      closedAt: toDate(item.closed_at as string | null),
    };

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

  const rawPulls = await giteaGetAll(baseUrl, token, `${slug}/pulls`, {
    state: "all",
  });

  let prCount = 0;
  for (const item of rawPulls) {
    const mergedAt = toDate(item.merged_at as string | null);
    const state = mergedAt ? "merged" : ((item.state as string) ?? "open");

    const values = {
      repoId: repo.id,
      number: item.number as number,
      externalId: item.id != null ? String(item.id) : null,
      title: (item.title as string) ?? "",
      body: (item.body as string | null) ?? null,
      state,
      isDraft: Boolean(item.draft),
      authorLogin: (item.user as { login?: string } | null)?.login ?? null,
      authorAvatarUrl:
        (item.user as { avatar_url?: string } | null)?.avatar_url ?? null,
      headBranch: (item.head as { ref?: string } | null)?.ref ?? null,
      baseBranch: (item.base as { ref?: string } | null)?.ref ?? null,
      labels: normalizeLabels(
        item.labels as Array<{ name?: string; color?: string }> | undefined,
      ),
      commentCount: (item.comments as number) ?? 0,
      url: (item.html_url as string) ?? "",
      externalCreatedAt: toDate(item.created_at as string),
      externalUpdatedAt: toDate(item.updated_at as string),
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

  // Mirror completion signal — see syncGitHubRepo for rationale.
  await publishEvent("repo.synced", {
    repoId: repo.id,
    organizationId: repo.organizationId,
  });

  return { issues: issueCount, pullRequests: prCount };
}

export async function syncRepo(repoId: string) {
  const repo = await db.query.repoTable.findFirst({
    where: eq(repoTable.id, repoId),
  });
  if (!repo) throw new Error("Repo not found");

  if (repo.provider === "gitea") {
    return syncGiteaRepo(repoId);
  }
  const { syncGitHubRepo } = await import("./sync-github-repo");
  return syncGitHubRepo(repoId);
}
