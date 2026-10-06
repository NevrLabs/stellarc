import { and, asc, eq, isNull, sql } from "drizzle-orm";
import db from "../../database";
import { boardTable } from "../../database/schema";
import { listAccessibleResourceIds } from "../../resource-access";
import { isClosedStatus } from "../../task/status-taxonomy";

async function getBoards(
  organizationId: string,
  userId: string,
  includeArchived = false,
  teamId?: string | null,
) {
  const boards = await db.query.boardTable.findMany({
    where: includeArchived
      ? eq(boardTable.organizationId, organizationId)
      : and(
          eq(boardTable.organizationId, organizationId),
          isNull(boardTable.archivedAt),
        ),
    /*
      KFL-190: archived boards rank LAST. `(archived_at is not null)` sorts
      false (active) before true (archived) ascending, so archiving a board
      demotes it without hiding it, and `createdAt` keeps a stable order
      within each group.
    */
    orderBy: [
      sql`(${boardTable.archivedAt} is not null)`,
      asc(boardTable.createdAt),
    ],
    with: {
      tasks: true,
    },
  });

  const accessibleIds = new Set(
    await listAccessibleResourceIds({
      organizationId,
      resourceType: "board",
      userId,
      resourceIds: boards.map((board) => board.id),
      teamId,
    }),
  );

  const boardsWithStatistics = boards
    .filter((board) => accessibleIds.has(board.id))
    .map((board) => {
      /*
        #226: archived tasks are hidden everywhere except the backlog archive
        dropdown, so they must not distort board totals, completion percentage,
        deadline, or timeline span. Archive itself is NOT completion — the
        retained status decides that.
      */
      const activeTasks = board.tasks.filter((task) => task.archivedAt == null);
      const totalTasks = activeTasks.length;
      const completedTasks = activeTasks.filter((task) =>
        isClosedStatus(task.status),
      ).length;
      const completionPercentage =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const dueDate = activeTasks.reduce((earliest: Date | null, task) => {
        if (!earliest || (task.dueDate && task.dueDate < earliest))
          return task.dueDate;
        return earliest;
      }, null);

      /**
       * Span of the board on a timeline: from the earliest task start to the
       * latest task due date. `dueDate` above is deliberately left alone — it
       * is the *soonest* deadline and drives the "due" badge, which is a
       * different question from "how long does this board run".
       *
       * Tasks fall back to their due date when they have no start (and vice
       * versa) so a board with only one of the two still occupies a real span
       * rather than disappearing from the timeline.
       */
      let startsAt: Date | null = null;
      let endsAt: Date | null = null;
      for (const task of activeTasks) {
        const taskStart = task.startDate ?? task.dueDate;
        const taskEnd = task.dueDate ?? task.startDate;
        if (taskStart && (!startsAt || taskStart < startsAt))
          startsAt = taskStart;
        if (taskEnd && (!endsAt || taskEnd > endsAt)) endsAt = taskEnd;
      }

      return {
        ...board,
        statistics: {
          completionPercentage,
          totalTasks,
          dueDate,
          startsAt,
          endsAt,
        },
        archivedTasks: [],
        plannedTasks: [],
        triageTasks: [],
        columns: [],
      };
    });

  return boardsWithStatistics;
}

export default getBoards;
