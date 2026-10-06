import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectSlugAliasTable } from "../../database/schema";
import { getResourcePrivilege, privilegeAllows } from "../../resource-access";
import { findProjectById, findProjectBySlug } from "../project-projection";

/**
 * Server-owned Project slug resolver: canonical match first (case-
 * insensitive), then alias join. Missing/cross-org/inaccessible slugs return
 * the IDENTICAL 404 so a caller cannot distinguish "does not exist" from
 * "exists but you cannot see it".
 */
async function resolveProject(
  organizationId: string,
  slug: string,
  userId: string,
) {
  const normalized = slug.toLowerCase();

  let project = await findProjectBySlug(organizationId, normalized, userId);
  let usedSlugAlias = false;

  if (!project) {
    const [alias] = await db
      .select({ projectId: projectSlugAliasTable.projectId })
      .from(projectSlugAliasTable)
      .where(
        and(
          eq(projectSlugAliasTable.organizationId, organizationId),
          sql`lower(${projectSlugAliasTable.slug}) = ${normalized}`,
        ),
      )
      .limit(1);
    if (alias) {
      project = await findProjectById(organizationId, alias.projectId, userId);
      usedSlugAlias = true;
    }
  }

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const privilege = await getResourcePrivilege({
    organizationId,
    resourceType: "project",
    resourceId: project.id,
    userId,
  });
  if (!privilegeAllows(privilege, "view")) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return {
    ...project,
    usedSlugAlias,
  };
}

export default resolveProject;
