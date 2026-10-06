import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import db from "../../database";
import { boardTable, taskTable } from "../../database/schema";
import { deleteS3Keys, getTaskAssetKeys } from "../../storage/cleanup-assets";

export const DEFAULT_TRASH_RETENTION_DAYS = 30;

type PurgeOptions = {
  /** Restrict the purge to a single organization. */
  organizationId?: string;
  /** Override "now" - used by tests. */
  now?: Date;
};

function cutoffFor(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * Hard-deletes trashed tasks whose `deletedAt` is older than the owning
 * organization's `trash_retention_days`.
 *
 * Exported as a plain function on purpose: no cron/scheduler wiring here, the
 * caller decides when to run it.
 */
export async function purgeTrashedTasks(options: PurgeOptions = {}) {
  const now = options.now ?? new Date();

  const orgRetentionRows = (await db.execute(
    sql`SELECT id, COALESCE(trash_retention_days, ${DEFAULT_TRASH_RETENTION_DAYS}) AS retention_days FROM organization${
      options.organizationId
        ? sql` WHERE id = ${options.organizationId}`
        : sql``
    }`,
  )) as unknown as Array<{ id: string; retention_days: number }>;

  const orgRows = Array.isArray(orgRetentionRows)
    ? orgRetentionRows
    : ((
        orgRetentionRows as {
          rows?: Array<{ id: string; retention_days: number }>;
        }
      ).rows ?? []);

  let purgedCount = 0;
  const purgedTaskIds: string[] = [];

  for (const org of orgRows) {
    const retentionDays =
      Number(org.retention_days) > 0
        ? Number(org.retention_days)
        : DEFAULT_TRASH_RETENTION_DAYS;
    const cutoff = cutoffFor(now, retentionDays);

    const expired = await db
      .select({ id: taskTable.id })
      .from(taskTable)
      .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .where(
        and(
          eq(boardTable.organizationId, org.id),
          isNotNull(taskTable.deletedAt),
          lt(taskTable.deletedAt, cutoff),
        ),
      );

    for (const task of expired) {
      const assetKeys = await getTaskAssetKeys(task.id);

      const [deleted] = await db
        .delete(taskTable)
        .where(and(eq(taskTable.id, task.id), isNotNull(taskTable.deletedAt)))
        .returning()
        .execute();

      if (deleted) {
        purgedCount += 1;
        purgedTaskIds.push(task.id);
        if (assetKeys.length > 0) {
          deleteS3Keys(assetKeys).catch(() => {});
        }
      }
    }
  }

  return { purgedCount, purgedTaskIds };
}

export default purgeTrashedTasks;
