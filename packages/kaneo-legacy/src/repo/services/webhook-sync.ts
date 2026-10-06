import { and, eq } from "drizzle-orm";
import db from "../../database";
import { repoTable } from "../../database/schema";
import { syncRepo } from "./sync-gitea-repo";

/**
 * Resolve a provider event to the first-class Repo entity and refresh its
 * provider mirror. Webhooks deliberately do not inspect/create/update tasks.
 */
export async function syncRepoFromWebhook({
  provider,
  owner,
  name,
}: {
  provider: "github" | "gitea";
  owner: string;
  name: string;
}): Promise<boolean> {
  const repo = await db.query.repoTable.findFirst({
    where: and(
      eq(repoTable.provider, provider),
      eq(repoTable.owner, owner),
      eq(repoTable.name, name),
    ),
  });

  if (!repo?.isActive) return false;
  await syncRepo(repo.id);
  return true;
}

export function getWebhookRepoSlug(
  payload: unknown,
): { owner: string; name: string } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const repository = (payload as { repository?: unknown }).repository;
  if (!repository || typeof repository !== "object") return undefined;
  const r = repository as {
    name?: unknown;
    owner?: { login?: unknown; username?: unknown };
  };
  const owner = r.owner?.login ?? r.owner?.username;
  return typeof owner === "string" && typeof r.name === "string"
    ? { owner, name: r.name }
    : undefined;
}

export async function syncGitHubWebhookPayload(payload: unknown) {
  const slug = getWebhookRepoSlug(payload);
  return slug ? syncRepoFromWebhook({ provider: "github", ...slug }) : false;
}

export async function syncGiteaWebhookPayload(payload: unknown) {
  const slug = getWebhookRepoSlug(payload);
  return slug ? syncRepoFromWebhook({ provider: "gitea", ...slug }) : false;
}
