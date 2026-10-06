import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  boardTable,
  columnTable,
  flagTypeTable,
  labelTable,
  milestoneTable,
  organizationMemberTable,
  taskFlagTable,
  taskFollowerTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { getEffectiveTeamIdsForUser } from "../../team/effective-membership";

export type MyTasksRelation =
  | "assigned"
  | "created"
  | "team"
  | "followed"
  | "all";

type GetMyTasksOptions = {
  userId: string;
  /** Restrict to a single organization; omit for every org the user belongs to. */
  organizationId?: string;
  /**
   * Which relationship to the user a task must have.
   * - assigned: directly assigned to the user
   * - created:  the user raised it (derived from the `created` activity row)
   * - team:     assigned to a team the user belongs to
   * - all:      any of the above, plus tasks the user participated in
   */
  relation?: MyTasksRelation;
  /** Include tasks sitting in a final (done) column. Defaults to false. */
  includeCompleted?: boolean;
  limit?: number;
  offset?: number;
};

/**
 * Cross-board "My Tasks" list (#58).
 *
 * Scoped through `organization_member`, so a user can only ever see tasks in
 * organizations they still belong to — removing a member removes their access
 * with no separate cleanup.
 *
 * Soft-deleted tasks (`deleted_at`) are excluded: trashed work is not "my
 * work", and the recycle bin has its own endpoint.
 */
async function getMyTasks({
  userId,
  organizationId,
  relation = "all",
  includeCompleted = false,
  limit = 100,
  offset = 0,
}: GetMyTasksOptions) {
  // Transitive: "my team's tasks" includes tasks assigned to ancestor teams
  // of the user's sub-teams (sub-team members count as parent-team members).
  const userTeamIds = await getEffectiveTeamIdsForUser(userId);

  const assignedToUser = eq(taskTable.userId, userId);

  // `inArray` with an empty list generates invalid SQL in drizzle, so guard it.
  const assignedToUserTeam =
    userTeamIds.length > 0
      ? inArray(taskTable.teamId, userTeamIds)
      : sql`false`;

  // The task table has no author column; creation is recorded in the activity
  // feed as a `created` row, so authorship is derived from there rather than
  // guessed.
  const createdByUser = sql`exists (
    select 1 from ${activityTable}
    where ${activityTable.taskId} = ${taskTable.id}
      and ${activityTable.type} = 'created'
      and ${activityTable.userId} = ${userId}
  )`;

  // "Related" is meaningful user data here: a user who commented on or changed
  // a ticket participated in it. Task-to-task relations have no user identity,
  // so treating them as a user relation would be fiction.
  const participatedByUser = sql`exists (
    select 1 from ${activityTable}
    where ${activityTable.taskId} = ${taskTable.id}
      and ${activityTable.userId} = ${userId}
      and ${activityTable.type} <> 'created'
  )`;

  const followedByUser = sql`exists (
    select 1 from ${taskFollowerTable}
    where ${taskFollowerTable.taskId} = ${taskTable.id}
      and ${taskFollowerTable.userId} = ${userId}
  )`;

  const relationFilter =
    relation === "assigned"
      ? assignedToUser
      : relation === "team"
        ? assignedToUserTeam
        : relation === "created"
          ? createdByUser
          : relation === "followed"
            ? followedByUser
            : or(
                assignedToUser,
                assignedToUserTeam,
                createdByUser,
                participatedByUser,
              );

  const conditions = [
    // Membership gate: never leak tasks from an organization the user left.
    sql`exists (
      select 1 from ${organizationMemberTable}
      where ${organizationMemberTable.organizationId} = ${boardTable.organizationId}
        and ${organizationMemberTable.userId} = ${userId}
    )`,
    isNull(taskTable.deletedAt),
    relationFilter,
  ];

  if (organizationId) {
    conditions.push(eq(boardTable.organizationId, organizationId));
  }

  if (!includeCompleted) {
    conditions.push(
      or(isNull(columnTable.isFinal), eq(columnTable.isFinal, false)),
    );
  }

  const tasks = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      status: taskTable.status,
      priority: taskTable.priority,
      dueDate: taskTable.dueDate,
      createdAt: taskTable.createdAt,
      updatedAt: taskTable.updatedAt,
      boardId: taskTable.boardId,
      boardName: boardTable.name,
      boardSlug: boardTable.slug,
      // KFL-190: My Tasks marks tickets that live on an archived board.
      boardArchivedAt: boardTable.archivedAt,
      organizationId: boardTable.organizationId,
      columnId: taskTable.columnId,
      columnName: columnTable.name,
      // #120: My Tasks renders the column's status icon, which honours a
      // per-column custom icon when one is configured.
      columnIcon: columnTable.icon,
      isFinal: columnTable.isFinal,
      assigneeId: taskTable.userId,
      assigneeName: userTable.name,
      teamId: taskTable.teamId,
      milestoneId: taskTable.milestoneId,
      milestoneName: milestoneTable.name,
      // A ticket is flagged when it has at least one unresolved flag. EXISTS
      // avoids a join fan-out that would duplicate a task per active flag.
      flagged: sql<boolean>`exists (
        select 1 from ${taskFlagTable}
        where ${taskFlagTable.taskId} = ${taskTable.id}
          and ${taskFlagTable.resolvedAt} is null
      )`,
      // Newest active flag's name + colour, so the row can label and tint like
      // the inbox. Correlated scalar subqueries keep one row per task.
      flagName: sql<string | null>`(
        select ${flagTypeTable.name}
        from ${taskFlagTable}
        join ${flagTypeTable} on ${flagTypeTable.id} = ${taskFlagTable.flagTypeId}
        where ${taskFlagTable.taskId} = ${taskTable.id}
          and ${taskFlagTable.resolvedAt} is null
        order by ${taskFlagTable.createdAt} desc
        limit 1
      )`,
      flagColor: sql<string | null>`(
        select ${flagTypeTable.color}
        from ${taskFlagTable}
        join ${flagTypeTable} on ${flagTypeTable.id} = ${taskFlagTable.flagTypeId}
        where ${taskFlagTable.taskId} = ${taskTable.id}
          and ${taskFlagTable.resolvedAt} is null
        order by ${taskFlagTable.createdAt} desc
        limit 1
      )`,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .leftJoin(columnTable, eq(taskTable.columnId, columnTable.id))
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(milestoneTable, eq(taskTable.milestoneId, milestoneTable.id))
    .where(and(...conditions))
    .orderBy(desc(taskTable.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100))
    .offset(Math.max(offset, 0));

  if (tasks.length === 0) return [];
  const labels = await db
    .select({
      id: labelTable.id,
      name: labelTable.name,
      color: labelTable.color,
      taskId: labelTable.taskId,
    })
    .from(labelTable)
    .where(
      inArray(
        labelTable.taskId,
        tasks.map(({ id }) => id),
      ),
    );
  const labelsByTask = new Map<string, typeof labels>();
  for (const label of labels) {
    if (!label.taskId) continue;
    const existing = labelsByTask.get(label.taskId);
    if (existing) existing.push(label);
    else labelsByTask.set(label.taskId, [label]);
  }
  return tasks.map((task) => ({
    ...task,
    labels: (labelsByTask.get(task.id) ?? []).map(({ id, name, color }) => ({
      id,
      name,
      color,
    })),
  }));
}

export default getMyTasks;
