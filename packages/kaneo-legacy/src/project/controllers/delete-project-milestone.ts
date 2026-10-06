import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectMilestoneTable,
  projectTicketTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Delete a Project Milestone. Memberships and Tickets are never touched: the
 * assignment is cleared transactionally (a single-column FK also SET NULLs on
 * delete, but we clear explicitly so the invariant never depends on FK nuance)
 * before the milestone row is removed.
 */
async function deleteProjectMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
) {
  await db.transaction(async (tx) => {
    const [milestone] = await tx
      .select({ id: projectMilestoneTable.id })
      .from(projectMilestoneTable)
      .where(
        and(
          eq(projectMilestoneTable.projectId, projectId),
          eq(projectMilestoneTable.id, milestoneId),
        ),
      )
      .limit(1);
    if (!milestone) {
      throw new HTTPException(404, { message: "Project not found" });
    }

    await tx
      .update(projectTicketTable)
      .set({ projectMilestoneId: null })
      .where(
        and(
          eq(projectTicketTable.projectId, projectId),
          eq(projectTicketTable.projectMilestoneId, milestoneId),
        ),
      );

    await tx
      .delete(projectMilestoneTable)
      .where(
        and(
          eq(projectMilestoneTable.projectId, projectId),
          eq(projectMilestoneTable.id, milestoneId),
        ),
      );
  });

  await publishEvent("project.updated", { organizationId, projectId });
  return { ok: true };
}

export default deleteProjectMilestone;
