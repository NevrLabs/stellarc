import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { findProjectById } from "../project-projection";

/**
 * Archive is orthogonal to lifecycle `status`: this touches ONLY
 * archivedAt/archivedBy, exactly like Board's archive endpoint.
 */
async function archiveProject(
  projectId: string,
  organizationId: string,
  userId: string,
) {
  const [existing] = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  await db
    .update(projectTable)
    .set({ archivedAt: new Date(), archivedBy: userId })
    .where(eq(projectTable.id, projectId));

  const project = await findProjectById(organizationId, projectId, userId);
  if (!project) {
    throw new HTTPException(500, {
      message: "Failed to load archived project",
    });
  }
  await publishEvent("project.archived", { organizationId, projectId });
  return project;
}

export default archiveProject;
