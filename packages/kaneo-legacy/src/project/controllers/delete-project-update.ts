import { eq } from "drizzle-orm";
import db, { schema } from "../../database";
import { publishEvent } from "../../events";
import { requireAuthoredUpdate } from "./list-project-updates";
import {
  requireAccessibleProject,
  requireCurrentOrganizationMember,
} from "./update-guards";

/**
 * Author-only hard delete — no tombstone. The next-newest Update becomes the
 * latest health; with zero rows left the Project renders "No update" again.
 */
export default async function deleteProjectUpdateController(options: {
  organizationId: string;
  projectId: string;
  updateId: string;
  userId: string;
}) {
  await requireCurrentOrganizationMember({
    organizationId: options.organizationId,
    userId: options.userId,
  });
  await requireAccessibleProject({
    organizationId: options.organizationId,
    projectId: options.projectId,
    userId: options.userId,
    edit: true,
  });

  const existing = await requireAuthoredUpdate(options);

  await db
    .delete(schema.projectUpdateTable)
    .where(eq(schema.projectUpdateTable.id, existing.id));

  await publishEvent("project-update.deleted", {
    organizationId: existing.organizationId,
    projectId: existing.projectId,
    updateId: existing.id,
    health: existing.health,
  });

  return { success: true };
}
