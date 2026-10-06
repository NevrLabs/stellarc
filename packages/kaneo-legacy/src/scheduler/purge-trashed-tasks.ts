import { purgeTrashedTasks } from "../task/controllers/purge-trashed-tasks";

/**
 * Periodic hard-purge of soft-deleted tasks that have exceeded the
 * organization's trash_retention_days (default 30). Prevents the slow
 * accumulation of trashed test/stale tickets that bloat DB size and
 * board queries.
 */
export async function purgeExpiredTrashedTasks(): Promise<void> {
  try {
    const result = await purgeTrashedTasks();
    if (result.purgedCount > 0) {
      console.info(`🗑️  Purged ${result.purgedCount} expired trashed tasks`);
    }
  } catch (error) {
    console.error("Failed to purge expired trashed tasks", { error });
  }
}
