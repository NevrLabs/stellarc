import { and, asc, eq, inArray, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  assetTable,
  boardTable,
  columnTable,
  projectTicketTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { getProjectTicketMemberships } from "../../project/publish-project-ticket-updates";
import { claimTaskNumber } from "./claim-task-numbers";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function isSameProjectMove(
  sourceProjectId: string,
  destinationBoardId: string,
) {
  return sourceProjectId === destinationBoardId;
}

async function resolveDestinationStatus(
  destinationBoardId: string,
  currentStatus: string,
  requestedStatus?: string,
) {
  const destinationColumns = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      position: columnTable.position,
    })
    .from(columnTable)
    .where(eq(columnTable.boardId, destinationBoardId))
    .orderBy(asc(columnTable.position));

  if (destinationColumns.length === 0) {
    throw new HTTPException(400, {
      message: "Destination project does not have a workflow",
    });
  }

  const requestedColumn = requestedStatus
    ? destinationColumns.find((column) => column.slug === requestedStatus)
    : null;

  if (requestedStatus && !requestedColumn) {
    throw new HTTPException(400, {
      message: "Selected status is not valid for the destination project",
    });
  }

  const matchingCurrentColumn = destinationColumns.find(
    (column) => column.slug === currentStatus,
  );

  return requestedColumn ?? matchingCurrentColumn ?? destinationColumns[0];
}

async function getNextTaskPosition(
  dbOrTx: DbOrTx,
  boardId: string,
  status: string,
  columnId: string,
) {
  const [maxPositionResult] = await dbOrTx
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.boardId, boardId),
        eq(taskTable.status, status),
        eq(taskTable.columnId, columnId),
      ),
    );

  return (maxPositionResult?.maxPosition ?? 0) + 1;
}

async function moveTask({
  taskId,
  destinationBoardId,
  destinationStatus,
  currentUserId,
}: {
  taskId: string;
  destinationBoardId: string;
  destinationStatus?: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (isSameProjectMove(existingTask.boardId, destinationBoardId)) {
    throw new HTTPException(400, {
      message: "Task is already in that project",
    });
  }

  const [sourceProject, destinationProject] = await Promise.all([
    db.query.boardTable.findFirst({
      where: eq(boardTable.id, existingTask.boardId),
    }),
    db.query.boardTable.findFirst({
      where: eq(boardTable.id, destinationBoardId),
    }),
  ]);

  if (!sourceProject || !destinationProject) {
    throw new HTTPException(404, {
      message: "Board not found",
    });
  }

  // Capture memberships before the move. Cross-organization moves remove the
  // membership atomically instead of leaving an invalid cross-org relation;
  // same-org moves keep the membership but change its board identity.
  const memberships = await getProjectTicketMemberships(taskId);

  const resolvedColumn = await resolveDestinationStatus(
    destinationBoardId,
    existingTask.status,
    destinationStatus,
  );

  const movedTask = await db.transaction(async (tx) => {
    const [nextTaskNumber, nextPosition] = await Promise.all([
      claimTaskNumber(destinationBoardId, tx),
      getNextTaskPosition(
        tx,
        destinationBoardId,
        resolvedColumn.slug,
        resolvedColumn.id,
      ),
    ]);

    const [updatedTask] = await tx
      .update(taskTable)
      .set({
        boardId: destinationBoardId,
        status: resolvedColumn.slug,
        columnId: resolvedColumn.id,
        number: nextTaskNumber,
        position: nextPosition,
      })
      .where(eq(taskTable.id, taskId))
      .returning();

    if (!updatedTask) {
      throw new HTTPException(500, {
        message: "Failed to move task",
      });
    }

    await tx
      .update(assetTable)
      .set({ boardId: destinationBoardId })
      .where(eq(assetTable.taskId, taskId));

    const crossOrgProjectIds = memberships
      .filter(
        (membership) =>
          membership.organizationId !== destinationProject.organizationId,
      )
      .map((membership) => membership.projectId);
    if (crossOrgProjectIds.length > 0) {
      await tx
        .delete(projectTicketTable)
        .where(
          and(
            eq(projectTicketTable.taskId, taskId),
            inArray(projectTicketTable.projectId, crossOrgProjectIds),
          ),
        );
    }

    return updatedTask;
  });

  await publishEvent("task.moved", {
    taskId,
    type: "moved",
    userId: currentUserId,
    fromProjectId: sourceProject.id,
    fromProjectName: sourceProject.name,
    toProjectId: destinationProject.id,
    toProjectName: destinationProject.name,
    oldStatus: existingTask.status,
    newStatus: resolvedColumn.slug,
  });

  // Refresh every Project that scoped the moved ticket (same-org board change
  // or cross-org membership removal both change the visible set).
  for (const membership of memberships) {
    await publishEvent("project.updated", {
      organizationId: membership.organizationId,
      projectId: membership.projectId,
    });
  }

  return {
    task: movedTask,
    sourceProjectId: sourceProject.id,
    destinationBoardId: destinationProject.id,
  };
}

export default moveTask;
