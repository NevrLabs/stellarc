import { eq } from "drizzle-orm";
import db from "../database";
import { repoTable } from "../database/schema";
import { syncRepo } from "../repo/services/sync-gitea-repo";

const STALE_AFTER_MINUTES = 30;

/**
 * Periodic safety net: refresh active repos whose last sync is stale (or never
 * synced). Catches missed webhook deliveries without requiring a manual trigger.
 *
 * Syncs sequentially to avoid hammering the provider rate limit.
 */
export async function syncStaleRepos(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000);

  const repos = await db
    .select({
      id: repoTable.id,
      name: repoTable.name,
      lastSyncedAt: repoTable.lastSyncedAt,
    })
    .from(repoTable)
    .where(eq(repoTable.isActive, true));

  let synced = 0;
  for (const repo of repos) {
    if (repo.lastSyncedAt && repo.lastSyncedAt > cutoff) continue;

    try {
      await syncRepo(repo.id);
      synced++;
    } catch (error) {
      console.error(
        `[Scheduler] Repo resync failed for ${repo.name}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (synced > 0) {
    console.log(`[Scheduler] Resynced ${synced} stale repo(s)`);
  }
}
