import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { publishEvent } from "../../events";
import { listProjectUpdates } from "../project-update-projection";
import { requireAccessibleProject } from "./update-guards";

/**
 * List a Project's Updates, newest first. A Project with zero updates returns
 * [] — "No update" is a presentation of zero rows, never 404 and never a
 * sentinel row.
 */
export default async function listProjectUpdatesController(options: {
  organizationId: string;
  projectId: string;
  userId: string;
}) {
  await requireAccessibleProject({
    organizationId: options.organizationId,
    projectId: options.projectId,
    userId: options.userId,
  });

  return listProjectUpdates(options.organizationId, options.projectId);
}

/** Shared author-only lookup for update/edit/delete (no-leak 404). */
export async function requireAuthoredUpdate(options: {
  organizationId: string;
  projectId: string;
  updateId: string;
  userId: string;
}) {
  const [update] = await db
    .select()
    .from(schema.projectUpdateTable)
    .where(
      and(
        eq(schema.projectUpdateTable.id, options.updateId),
        eq(schema.projectUpdateTable.projectId, options.projectId),
        eq(schema.projectUpdateTable.organizationId, options.organizationId),
      ),
    )
    .limit(1);
  if (!update || update.authorId !== options.userId) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }
  return update;
}
