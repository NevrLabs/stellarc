import { and, eq } from "drizzle-orm";
import db from "../../database";
import { repoTable } from "../../database/schema";
import { syncGiteaWebhookPayload } from "../../repo/services/webhook-sync";
import { verifyGiteaSignature } from "./utils/verify-signature";

/**
 * Gitea webhook ingress for first-class Repos. The payload selects the Repo;
 * its stored per-repo webhook secret verifies the delivery. No board/task
 * integration ID exists in this path.
 */
export async function handleGiteaWebhookRequest(
  rawBody: string,
  signatureHeader: string | undefined,
): Promise<{ success: boolean; error?: string }> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { success: false, error: "Invalid JSON payload" };
  }

  const repository = (payload as { repository?: unknown })?.repository as
    | { name?: string; owner?: { login?: string; username?: string } }
    | undefined;
  const owner = repository?.owner?.login ?? repository?.owner?.username;
  const name = repository?.name;
  if (!owner || !name) {
    return { success: false, error: "Webhook repository is missing" };
  }

  const repo = await db.query.repoTable.findFirst({
    where: and(
      eq(repoTable.provider, "gitea"),
      eq(repoTable.owner, owner),
      eq(repoTable.name, name),
    ),
  });
  if (!repo || !repo.isActive) {
    // A 2xx outcome avoids endless provider retries for repos not managed here.
    return { success: true };
  }

  const config = (repo.config ?? {}) as { webhookSecret?: unknown };
  if (
    typeof config.webhookSecret !== "string" ||
    !verifyGiteaSignature(rawBody, config.webhookSecret, signatureHeader)
  ) {
    return { success: false, error: "Invalid webhook signature" };
  }

  await syncGiteaWebhookPayload(payload);
  return { success: true };
}
