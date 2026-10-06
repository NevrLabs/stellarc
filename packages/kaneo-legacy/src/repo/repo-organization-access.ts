import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { repoTable } from "../database/schema";
import { getResourcePrivilege, privilegeAllows } from "../resource-access";
import { validateOrganizationAccess } from "../utils/validate-organization-access";
import { assertReposEnabled } from "./require-repos-enabled";

/**
 * Mirrors `organizationAccess.fromBoard()` from
 * `../utils/organization-access-middleware`, but resolves the organization
 * from a repo id. Repos are an organization-level entity with no board/task
 * link, so they can't reuse any of the existing lookup resources.
 *
 * Sets `organizationId` in the context after verifying the caller is a member
 * of the owning organization, so downstream controllers (and
 * `requireOrganizationPermission`) behave exactly like every other feature.
 */
export function repoOrganizationAccess(idKey = "id") {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const repoId = c.req.param(idKey) || c.req.query(idKey) || null;

    if (!repoId) {
      throw new HTTPException(400, {
        message: "Organization ID could not be determined",
      });
    }

    const [repo] = await db
      .select({ organizationId: repoTable.organizationId })
      .from(repoTable)
      .where(eq(repoTable.id, repoId))
      .limit(1);

    if (!repo?.organizationId) {
      throw new HTTPException(404, { message: "Repo not found" });
    }

    const apiKey = c.get("apiKey");
    const apiKeyId = apiKey?.id;

    await validateOrganizationAccess(userId, repo.organizationId, apiKeyId);
    await assertReposEnabled(repo.organizationId);
    const privilege = await getResourcePrivilege({
      organizationId: repo.organizationId,
      resourceType: "repo",
      resourceId: repoId,
      userId,
    });
    const required = c.req.method === "GET" ? "view" : "edit";
    if (!privilegeAllows(privilege, required)) {
      throw new HTTPException(404, { message: "Repo not found" });
    }

    c.set("organizationId", repo.organizationId);

    return next();
  };
}
