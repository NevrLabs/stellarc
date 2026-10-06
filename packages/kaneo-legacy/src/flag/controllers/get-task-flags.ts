import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../database";
import {
  flagTypeTable,
  taskFlagTable,
  teamTable,
  userTable,
} from "../../database/schema";

const raiser = alias(userTable, "flag_raiser");
const resolver = alias(userTable, "flag_resolver");
const target = alias(userTable, "flag_target_user");

/**
 * Flags on a task. `includeResolved=false` (the default) returns only ACTIVE
 * flags — resolvedAt IS NULL. Dropping that filter would surface historical
 * flags as if the task were still flagged, so the isNull condition is the
 * guard this endpoint lives or dies by.
 */
async function getTaskFlags(
  taskId: string | string[],
  includeResolved = false,
) {
  const conditions = [
    Array.isArray(taskId)
      ? inArray(taskFlagTable.taskId, taskId)
      : eq(taskFlagTable.taskId, taskId),
  ];

  if (!includeResolved) {
    conditions.push(isNull(taskFlagTable.resolvedAt));
  }

  return db
    .select({
      id: taskFlagTable.id,
      taskId: taskFlagTable.taskId,
      flagTypeId: taskFlagTable.flagTypeId,
      flagTypeName: flagTypeTable.name,
      flagTypeColor: flagTypeTable.color,
      flagTypeIcon: flagTypeTable.icon,
      flaggedBy: taskFlagTable.flaggedBy,
      flaggedByName: raiser.name,
      targetUserId: taskFlagTable.targetUserId,
      targetUserName: target.name,
      targetTeamId: taskFlagTable.targetTeamId,
      targetTeamName: teamTable.name,
      note: taskFlagTable.note,
      resolvedAt: taskFlagTable.resolvedAt,
      resolvedBy: taskFlagTable.resolvedBy,
      resolvedByName: resolver.name,
      createdAt: taskFlagTable.createdAt,
      updatedAt: taskFlagTable.updatedAt,
    })
    .from(taskFlagTable)
    .innerJoin(flagTypeTable, eq(taskFlagTable.flagTypeId, flagTypeTable.id))
    .leftJoin(raiser, eq(taskFlagTable.flaggedBy, raiser.id))
    .leftJoin(resolver, eq(taskFlagTable.resolvedBy, resolver.id))
    .leftJoin(target, eq(taskFlagTable.targetUserId, target.id))
    .leftJoin(teamTable, eq(taskFlagTable.targetTeamId, teamTable.id))
    .where(and(...conditions))
    .orderBy(asc(flagTypeTable.position), desc(taskFlagTable.createdAt));
}

export default getTaskFlags;
