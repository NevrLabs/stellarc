import { and, eq, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectMilestoneTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getProjectMilestone } from "../project-projection";

/**
 * Reopen a completed milestone by clearing both completion fields. Repeating
 * reopen is idempotent: the guarded update only fires when completion is set.
 */
async function reopenProjectMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  userId: string,
) {
  const [updated] = await db
    .update(projectMilestoneTable)
    .set({ completedAt: null, completedBy: null })
    .where(
      and(
        eq(projectMilestoneTable.projectId, projectId),
        eq(projectMilestoneTable.id, milestoneId),
        isNotNull(projectMilestoneTable.completedAt),
      ),
    )
    .returning({ id: projectMilestoneTable.id });

  if (!updated) {
    const [existing] = await db
      .select({ id: projectMilestoneTable.id })
      .from(projectMilestoneTable)
      .where(
        and(
          eq(projectMilestoneTable.projectId, projectId),
          eq(projectMilestoneTable.id, milestoneId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new HTTPException(404, { message: "Project not found" });
    }
  }

  await publishEvent("project.updated", { organizationId, projectId });

  const milestone = await getProjectMilestone(
    organizationId,
    projectId,
    milestoneId,
    userId,
  );
  if (!milestone) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  return milestone;
}

export default reopenProjectMilestone;
