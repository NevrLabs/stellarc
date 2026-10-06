import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import db from "../../database";
import { organizationTable } from "../../database/schema";
import {
  RESOURCE_PRIVILEGES,
  RESOURCE_TYPES,
  type ResourcePrivilege,
} from "../../resource-access";

const privilegeSchema = v.picklist(RESOURCE_PRIVILEGES);

/**
 * The organization endpoint carries ONLY the org-wide default. Per-resource
 * baselines live on each resource (board/repo/data_table `org_privilege`,
 * NULL = follow org) and are managed through the resource-grant routes, next
 * to the explicit user/team grants they interact with.
 */
export const visibilityDefaultsBodySchema = v.object({
  defaultResourcePrivilege: privilegeSchema,
});

export type VisibilityDefaultsBody = v.InferOutput<
  typeof visibilityDefaultsBodySchema
>;

export async function getVisibilityDefaults(organizationId: string) {
  const [organization] = await db
    .select({
      defaultResourcePrivilege: organizationTable.defaultResourcePrivilege,
    })
    .from(organizationTable)
    .where(eq(organizationTable.id, organizationId))
    .limit(1);
  if (!organization) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  return {
    defaultResourcePrivilege:
      organization.defaultResourcePrivilege as ResourcePrivilege,
    resourceTypes: RESOURCE_TYPES,
  };
}

export async function updateVisibilityDefaults(
  organizationId: string,
  body: VisibilityDefaultsBody,
) {
  const [updated] = await db
    .update(organizationTable)
    .set({ defaultResourcePrivilege: body.defaultResourcePrivilege })
    .where(eq(organizationTable.id, organizationId))
    .returning({ id: organizationTable.id });
  if (!updated) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  return getVisibilityDefaults(organizationId);
}
