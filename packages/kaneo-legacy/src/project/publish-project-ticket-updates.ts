import { eq } from "drizzle-orm";
import db from "../database";
import { projectTable, projectTicketTable } from "../database/schema";
import { publishEvent } from "../events";

/** Projects that have scoped the given task, with their organization. */
export async function getProjectTicketMemberships(
  taskId: string,
): Promise<Array<{ projectId: string; organizationId: string }>> {
  return db
    .select({
      projectId: projectTicketTable.projectId,
      organizationId: projectTable.organizationId,
    })
    .from(projectTicketTable)
    .innerJoin(projectTable, eq(projectTicketTable.projectId, projectTable.id))
    .where(eq(projectTicketTable.taskId, taskId));
}

/**
 * Fan `project.updated` out to every Project that has scoped the given task.
 *
 * Task lifecycle mutations (status, archive, delete, restore, permanent
 * delete, move) change a scoped ticket's progress eligibility or completion,
 * so each affected Project must refresh its derived progress and ticket list
 * in other tabs/clients. No ticket payload is broadcast — the client refetches
 * through the authorization-filtered Project API.
 */
export async function publishProjectTicketUpdates(
  taskId: string,
): Promise<void> {
  const memberships = await getProjectTicketMemberships(taskId);
  for (const membership of memberships) {
    await publishEvent("project.updated", {
      organizationId: membership.organizationId,
      projectId: membership.projectId,
    });
  }
}
