import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  boardTable,
  projectMilestoneTable,
  projectTable,
  projectTicketTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { getResourcePrivilege, privilegeAllows } from "../../resource-access";
import { findProjectTicket } from "../project-projection";

/**
 * Assign/reassign/clear a Project Milestone on an already-scoped Project
 * Ticket. This is a mutation of the membership row, not of milestone CRUD or
 * the Task. The same-Project invariant is enforced atomically: the milestone
 * lookup is scoped to `projectId` inside the same transaction as the write, so
 * a cross-Project milestone can never be written.
 */
async function assignProjectTicketMilestone(
  organizationId: string,
  projectId: string,
  taskId: string,
  projectMilestoneId: string | null,
  userId: string,
) {
  await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ organizationId: projectTable.organizationId })
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

    const [membership] = await tx
      .select({ id: projectTicketTable.id })
      .from(projectTicketTable)
      .where(
        and(
          eq(projectTicketTable.projectId, projectId),
          eq(projectTicketTable.taskId, taskId),
        ),
      )
      .for("update")
      .limit(1);
    if (!membership) {
      throw new HTTPException(404, { message: "Membership not found" });
    }

    if (projectMilestoneId) {
      const [milestone] = await tx
        .select({ id: projectMilestoneTable.id })
        .from(projectMilestoneTable)
        .where(
          and(
            eq(projectMilestoneTable.id, projectMilestoneId),
            eq(projectMilestoneTable.projectId, projectId),
          ),
        )
        .limit(1);
      if (!milestone) {
        throw new HTTPException(404, { message: "Project not found" });
      }
    }

    await tx
      .update(projectTicketTable)
      .set({ projectMilestoneId })
      .where(eq(projectTicketTable.id, membership.id));
  });

  // Post-commit: refresh Project/Milestone/Ticket consumers in this org.
  await publishEvent("project.updated", { organizationId, projectId });

  const ticket = await findProjectTicket(
    organizationId,
    projectId,
    taskId,
    userId,
  );
  if (!ticket) {
    throw new HTTPException(500, { message: "Failed to load scoped ticket" });
  }
  return ticket;
}

export default assignProjectTicketMilestone;
