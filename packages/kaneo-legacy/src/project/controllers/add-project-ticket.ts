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
 * Scope a ticket into a Project. The same-organization proof and the
 * zero-or-one Project membership check both run inside the insert
 * transaction, so a foreign-org or already-scoped ticket can never leave a
 * partial association behind.
 */
export async function addProjectTicket({
  projectId,
  taskId,
  rank,
  projectMilestoneId,
  userId,
}: {
  projectId: string;
  taskId: string;
  rank: number | undefined;
  projectMilestoneId: string | null | undefined;
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

    // fromTask-equivalent Board `edit` access, resolved against the board's
    // own organization. Denials 404 (never 403) so the caller cannot probe
    // which tasks/boards exist.
    const privilege = await getResourcePrivilege({
      organizationId: task.boardOrganizationId,
      resourceType: "board",
      resourceId: task.boardId,
      userId,
    });
    if (!privilegeAllows(privilege, "edit")) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    // The database cannot prove same-organization; the task reaches its org
    // through its board, so the proof is explicit here.
    if (project.organizationId !== task.boardOrganizationId) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    const [existing] = await tx
      .select({ id: projectTicketTable.id })
      .from(projectTicketTable)
      .where(eq(projectTicketTable.taskId, taskId))
      .limit(1);
    if (existing) {
      throw new HTTPException(409, {
        message: "Ticket is already scoped to a Project",
      });
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

    const [inserted] = await tx
      .insert(projectTicketTable)
      .values({
        projectId,
        taskId,
        rank: rank ?? 0,
        addedBy: userId,
        projectMilestoneId: projectMilestoneId ?? null,
      })
      .returning();
    if (!inserted) {
      throw new HTTPException(500, { message: "Failed to scope ticket" });
    }

    return { organizationId: project.organizationId };
  });

  // Post-commit: refresh every Project consumer in this organization.
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

export default addProjectTicket;
