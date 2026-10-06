import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { flagTypeTable, taskFlagTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Unflag a task. This is an UPDATE, never a DELETE: the row is kept as the
 * audit trail and we stamp who resolved it (resolvedBy) and when (resolvedAt).
 * Only currently-active flags (resolvedAt IS NULL) can be resolved, so a
 * second unflag can't overwrite the original resolver.
 */
async function resolveTaskFlag(
  id: string,
  resolvedBy: string,
  resolveNote: string,
) {
  const [flag] = await db
    .select()
    .from(taskFlagTable)
    .where(eq(taskFlagTable.id, id))
    .limit(1);

  if (!flag) {
    throw new HTTPException(404, { message: "Flag not found" });
  }

  if (flag.resolvedAt) {
    throw new HTTPException(409, { message: "Flag is already resolved" });
  }

  const [resolved] = await db
    .update(taskFlagTable)
    .set({
      resolvedAt: new Date(),
      resolvedBy,
      resolveNote,
      updatedAt: new Date(),
    })
    .where(and(eq(taskFlagTable.id, id), isNull(taskFlagTable.resolvedAt)))
    .returning();

  if (!resolved) {
    throw new HTTPException(409, { message: "Flag is already resolved" });
  }

  const [task] = await db
    .select({ id: taskTable.id, boardId: taskTable.boardId })
    .from(taskTable)
    .where(eq(taskTable.id, resolved.taskId))
    .limit(1);

  // #107: the activity feed renders flag entries with the flag type's own
  // colour and icon. flag_resolved used to publish only the id, so a resolved
  // entry rendered as a colourless generic row next to its own flag_raised.
  const [flagType] = await db
    .select({
      name: flagTypeTable.name,
      color: flagTypeTable.color,
      icon: flagTypeTable.icon,
    })
    .from(flagTypeTable)
    .where(eq(flagTypeTable.id, resolved.flagTypeId))
    .limit(1);

  await publishEvent("task.flag_resolved", {
    boardId: task?.boardId,
    taskId: resolved.taskId,
    userId: resolvedBy,
    type: "flag_resolved",
    flagId: resolved.id,
    flagTypeId: resolved.flagTypeId,
    flagTypeName: flagType?.name,
    flagTypeColor: flagType?.color ?? null,
    flagTypeIcon: flagType?.icon ?? null,
    resolvedBy,
    resolveNote,
    targetUserId: resolved.targetUserId,
    targetTeamId: resolved.targetTeamId,
  });

  return resolved;
}

export default resolveTaskFlag;
