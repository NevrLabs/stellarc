import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  flagTypeTable,
  taskFlagTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Raise a flag on a task. Flags are entirely separate from task.status — this
 * never touches the task row. A flag is raised BY `flaggedBy` and aimed AT
 * exactly one of a user or a team.
 */
async function raiseTaskFlag({
  taskId,
  flagTypeId,
  flaggedBy,
  targetUserId,
  targetTeamId,
  note,
}: {
  taskId: string;
  flagTypeId: string;
  flaggedBy: string;
  targetUserId?: string | null;
  targetTeamId?: string | null;
  note?: string | null;
}) {
  if (Boolean(targetUserId) === Boolean(targetTeamId)) {
    throw new HTTPException(400, {
      message: "A flag must target exactly one of targetUserId or targetTeamId",
    });
  }

  const [task] = await db
    .select({
      id: taskTable.id,
      boardId: taskTable.boardId,
      organizationId: boardTable.organizationId,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const [flagType] = await db
    .select({
      id: flagTypeTable.id,
      name: flagTypeTable.name,
      color: flagTypeTable.color,
      icon: flagTypeTable.icon,
    })
    .from(flagTypeTable)
    .where(
      and(
        eq(flagTypeTable.id, flagTypeId),
        eq(flagTypeTable.boardId, task.boardId),
      ),
    )
    .limit(1);

  if (!flagType) {
    throw new HTTPException(404, {
      message: "Flag type not found on this board",
    });
  }

  // Don't stack duplicate active flags of the same type at the same target.
  const [existing] = await db
    .select({ id: taskFlagTable.id })
    .from(taskFlagTable)
    .where(
      and(
        eq(taskFlagTable.taskId, taskId),
        eq(taskFlagTable.flagTypeId, flagTypeId),
        isNull(taskFlagTable.resolvedAt),
        targetUserId
          ? eq(taskFlagTable.targetUserId, targetUserId)
          : eq(taskFlagTable.targetTeamId, targetTeamId as string),
      ),
    )
    .limit(1);

  if (existing) {
    throw new HTTPException(409, {
      message: "This flag is already active for that target",
    });
  }

  const [flag] = await db
    .insert(taskFlagTable)
    .values({
      taskId,
      flagTypeId,
      flaggedBy,
      targetUserId: targetUserId ?? null,
      targetTeamId: targetTeamId ?? null,
      note: note ?? null,
    })
    .returning();

  if (!flag) {
    throw new HTTPException(500, { message: "Failed to raise flag" });
  }

  await publishEvent("task.flag_raised", {
    boardId: task.boardId,
    taskId: task.id,
    userId: flaggedBy,
    type: "flag_raised",
    flagId: flag.id,
    flagTypeId,
    flagTypeName: flagType.name,
    flagTypeColor: flagType.color ?? null,
    flagTypeIcon: flagType.icon ?? null,
    targetUserId: flag.targetUserId,
    targetTeamId: flag.targetTeamId,
    note: flag.note,
  });

  return flag;
}

export default raiseTaskFlag;
