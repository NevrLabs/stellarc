import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import db from "../../database";
import {
  boardTable,
  flagTypeTable,
  taskFlagTable,
  taskTable,
  teamTable,
} from "../../database/schema";
import { getEffectiveTeamIdsForUser } from "../../team/effective-membership";

/**
 * Active flags aimed at the current user, either directly (targetUserId) or
 * via one of their teams (targetTeamId). Resolved flags are excluded.
 *
 * Note: boards belong directly to an organization in this schema — there is no
 * intermediate project table — so org scoping reads `board.organizationId`.
 */
async function getFlagsForUser(userId: string, organizationId?: string) {
  /*
    Transitive: a flag targeting a parent team reaches sub-team members too.
    Effective ids resolve across organizations, so re-scope to the requested
    organization the same way the old direct-membership join did.
  */
  const effectiveIds = await getEffectiveTeamIdsForUser(userId);
  let teamIds = effectiveIds;
  if (organizationId && effectiveIds.length) {
    const scoped = await db
      .select({ id: teamTable.id })
      .from(teamTable)
      .where(
        and(
          inArray(teamTable.id, effectiveIds),
          eq(teamTable.organizationId, organizationId),
        ),
      );
    teamIds = scoped.map((team) => team.id);
  }

  const targetCondition = teamIds.length
    ? or(
        eq(taskFlagTable.targetUserId, userId),
        inArray(taskFlagTable.targetTeamId, teamIds),
      )
    : eq(taskFlagTable.targetUserId, userId);

  const conditions = [isNull(taskFlagTable.resolvedAt), targetCondition];

  if (organizationId) {
    conditions.push(eq(boardTable.organizationId, organizationId));
  }

  return db
    .select({
      id: taskFlagTable.id,
      taskId: taskFlagTable.taskId,
      taskTitle: taskTable.title,
      taskNumber: taskTable.number,
      boardId: taskTable.boardId,
      boardName: boardTable.name,
      organizationId: boardTable.organizationId,
      flagTypeId: taskFlagTable.flagTypeId,
      flagTypeName: flagTypeTable.name,
      flagTypeColor: flagTypeTable.color,
      flagTypeIcon: flagTypeTable.icon,
      flaggedBy: taskFlagTable.flaggedBy,
      targetUserId: taskFlagTable.targetUserId,
      targetTeamId: taskFlagTable.targetTeamId,
      note: taskFlagTable.note,
      createdAt: taskFlagTable.createdAt,
    })
    .from(taskFlagTable)
    .innerJoin(taskTable, eq(taskFlagTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .innerJoin(flagTypeTable, eq(taskFlagTable.flagTypeId, flagTypeTable.id))
    .where(and(...conditions))
    .orderBy(desc(taskFlagTable.createdAt));
}

export default getFlagsForUser;
