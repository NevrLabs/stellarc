import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  projectTable,
  projectTicketTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { getResourcePrivilege, privilegeAllows } from "../../resource-access";

/**
 * Remove a ticket from a Project. Only the association row is ever touched —
 * never the Task or its Board metadata. Absent membership returns 404 so the
 * operation is idempotent.
 */
export async function removeProjectTicket({
  projectId,
  taskId,
  userId,
}: {
  projectId: string;
  taskId: string;
  userId: string;
}) {
  const { organizationId } = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({
        id: projectTable.id,
        organizationId: projectTable.organizationId,
      })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .limit(1);
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }

    const [task] = await tx
      .select({
        boardId: taskTable.boardId,
        boardOrganizationId: boardTable.organizationId,
      })
      .from(taskTable)
      .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .where(eq(taskTable.id, taskId))
      .limit(1);
    if (!task) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    const privilege = await getResourcePrivilege({
      organizationId: task.boardOrganizationId,
      resourceType: "board",
      resourceId: task.boardId,
      userId,
    });
    if (!privilegeAllows(privilege, "edit")) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    if (project.organizationId !== task.boardOrganizationId) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    const [removed] = await tx
      .delete(projectTicketTable)
      .where(
        and(
          eq(projectTicketTable.projectId, projectId),
          eq(projectTicketTable.taskId, taskId),
        ),
      )
      .returning();
    if (!removed) {
      throw new HTTPException(404, { message: "Membership not found" });
    }

    return { organizationId: project.organizationId };
  });

  await publishEvent("project.updated", { organizationId, projectId });
}

export default removeProjectTicket;
