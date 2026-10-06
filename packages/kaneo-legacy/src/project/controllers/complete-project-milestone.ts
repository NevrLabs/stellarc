import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectMilestoneTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getProjectMilestone } from "../project-projection";

/**
 * Explicitly complete an open milestone with server time and the current
 * actor. Repeating completion is idempotent and preserves the original
 * attribution/time: the guarded update only fires when completion is null.
 */
async function completeProjectMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  userId: string,
) {
  const [updated] = await db
    .update(projectMilestoneTable)
    .set({ completedAt: new Date(), completedBy: userId })
    .where(
      and(
        eq(projectMilestoneTable.projectId, projectId),
        eq(projectMilestoneTable.id, milestoneId),
        isNull(projectMilestoneTable.completedAt),
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

export default completeProjectMilestone;
