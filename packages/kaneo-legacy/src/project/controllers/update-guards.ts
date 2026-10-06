import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { publishEvent } from "../../events";
import { getResourcePrivilege, privilegeAllows } from "../../resource-access";

/**
 * Load the access-checked parent Project for an updates route.
 *
 * No-leak invariant: missing / cross-org / view-denied all return the
 * IDENTICAL 404 "Project not found" (mirrors resolve-project.ts).
 * `edit: true` additionally requires the edit privilege (post/edit/delete
 * update); `edit: false` only requires view.
 */
export async function requireAccessibleProject(options: {
  organizationId: string;
  projectId: string;
  userId: string;
  edit?: boolean;
}) {
  const [project] = await db
    .select({ id: schema.projectTable.id })
    .from(schema.projectTable)
    .where(
      and(
        eq(schema.projectTable.id, options.projectId),
        eq(schema.projectTable.organizationId, options.organizationId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const privilege = await getResourcePrivilege({
    organizationId: options.organizationId,
    resourceType: "project",
    resourceId: options.projectId,
    userId: options.userId,
  });
  if (!privilegeAllows(privilege, options.edit ? "edit" : "view")) {
    throw new HTTPException(404, { message: "Project not found" });
  }
}

/**
 * Author membership check: the author must STILL be a current member of the
 * organization — an author FK alone proves nothing about present membership
 * (a departed user's account still resolves). Same 404 as the project guard.
 */
export async function requireCurrentOrganizationMember(options: {
  organizationId: string;
  userId: string;
}) {
  const [membership] = await db
    .select({ id: schema.organizationMemberTable.id })
    .from(schema.organizationMemberTable)
    .where(
      and(
        eq(
          schema.organizationMemberTable.organizationId,
          options.organizationId,
        ),
        eq(schema.organizationMemberTable.userId, options.userId),
      ),
    )
    .limit(1);
  if (!membership) {
    throw new HTTPException(404, { message: "Project not found" });
  }
}
