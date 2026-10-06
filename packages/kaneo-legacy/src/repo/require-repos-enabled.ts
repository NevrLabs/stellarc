import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { organizationTable } from "../database/schema";

/** Gates only the dedicated organization-level Repos product.
 * Board GitHub/Gitea integrations and webhook sync never pass through this middleware.
 */
/** Whether the organization-level Repos product is turned on. */
export async function areReposEnabled(organizationId: string) {
  if (!organizationId) return false;

  const [organization] = await db
    .select({ reposEnabled: organizationTable.reposEnabled })
    .from(organizationTable)
    .where(eq(organizationTable.id, organizationId))
    .limit(1);

  return Boolean(organization?.reposEnabled);
}

export async function assertReposEnabled(organizationId: string) {
  if (!organizationId) {
    throw new HTTPException(400, {
      message: "Organization ID could not be determined",
    });
  }

  if (!(await areReposEnabled(organizationId))) {
    throw new HTTPException(404, {
      message: "Repos is not enabled for this organization",
    });
  }
}

export async function requireReposEnabled(c: Context, next: Next) {
  const organizationId = c.get("organizationId");
  if (!organizationId) {
    throw new HTTPException(400, {
      message: "Organization ID could not be determined",
    });
  }

  await assertReposEnabled(organizationId);

  return next();
}
