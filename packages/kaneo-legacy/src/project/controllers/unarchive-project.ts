import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { findProjectById } from "../project-projection";

/**
 * Clears ONLY archivedAt/archivedBy — status (planned/started/completed/
 * canceled) is untouched, keeping lifecycle and archive independent.
 */
async function unarchiveProject(
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
    .set({ archivedAt: null, archivedBy: null })
    .where(eq(projectTable.id, projectId));

  const project = await findProjectById(organizationId, projectId, userId);
  if (!project) {
    throw new HTTPException(500, {
      message: "Failed to load unarchived project",
    });
  }
  await publishEvent("project.unarchived", { organizationId, projectId });
  return project;
}

export default async function unarchiveProjectController(
  projectId: string,
  organizationId: string,
  userId: string,
) {
  await unarchiveProject(projectId, organizationId, userId);
}
