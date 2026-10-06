import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";

const resourceTypeSchema = v.picklist([
  "board",
  "repo",
  "table",
  "project",
] as const);
const privilegeSchema = v.picklist(["view", "edit", "manage"] as const);
/**
 * Per-resource organization baseline: what ordinary members get with no
 * explicit grant. "none" hides the resource; null = follow the org default.
 */
const orgPrivilegeSchema = v.nullable(
  v.picklist(["none", "view", "edit", "manage"] as const),
);
const resourceParamsSchema = v.object({
  organizationId: v.string(),
  resourceType: resourceTypeSchema,
  resourceId: v.string(),
});
const grantBodySchema = v.object({
  principalType: v.picklist(["user", "team"] as const),
  principalId: v.string(),
  privilege: privilegeSchema,
});
const grantParamsSchema = v.object({
  ...resourceParamsSchema.entries,
  grantId: v.string(),
});

type ResourceParams = v.InferOutput<typeof resourceParamsSchema>;
type GrantBody = v.InferOutput<typeof grantBodySchema>;

function resourceTable(resourceType: ResourceParams["resourceType"]) {
  switch (resourceType) {
    case "board":
      return schema.boardTable;
    case "repo":
      return schema.repoTable;
    case "table":
      return schema.dataTableTable;
    case "project":
      return schema.projectTable;
  }
}

async function validateResource(params: ResourceParams) {
  const table = resourceTable(params.resourceType);
  const [resource] = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.id, params.resourceId),
        eq(table.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!resource)
    throw new HTTPException(404, { message: "Resource not found" });
}

async function validatePrincipal(organizationId: string, body: GrantBody) {
  if (body.principalType === "user") {
    const [member] = await db
      .select({ id: schema.organizationMemberTable.id })
      .from(schema.organizationMemberTable)
      .where(
        and(
          eq(schema.organizationMemberTable.organizationId, organizationId),
          eq(schema.organizationMemberTable.userId, body.principalId),
        ),
      )
      .limit(1);
    if (!member)
      throw new HTTPException(400, {
        message: "User is not an organization member",
      });
    return;
  }
  const [team] = await db
    .select({ id: schema.teamTable.id })
    .from(schema.teamTable)
    .where(
      and(
        eq(schema.teamTable.organizationId, organizationId),
        eq(schema.teamTable.id, body.principalId),
      ),
    )
    .limit(1);
  if (!team)
    throw new HTTPException(400, {
      message: "Team does not belong to the organization",
    });
}

const resourceGrant = new Hono<{
  Variables: { userId: string; organizationId: string };
}>()
  .use(
    "/:organizationId/*",
    organizationAccess.fromParam("organizationId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
  )
  .get(
    "/:organizationId/:resourceType/:resourceId",
    validator("param", resourceParamsSchema),
    async (c) => {
      const params = c.req.valid("param");
      await validateResource(params);
      const grants = await db
        .select()
        .from(schema.resourceGrantTable)
        .where(
          and(
            eq(schema.resourceGrantTable.organizationId, params.organizationId),
            eq(schema.resourceGrantTable.resourceType, params.resourceType),
            eq(schema.resourceGrantTable.resourceId, params.resourceId),
          ),
        );
      return c.json(grants);
    },
  )
  .get(
    "/:organizationId/:resourceType/:resourceId/org-privilege",
    validator("param", resourceParamsSchema),
    async (c) => {
      const params = c.req.valid("param");
      const table = resourceTable(params.resourceType);
      const [resource] = await db
        .select({ orgPrivilege: table.orgPrivilege })
        .from(table)
        .where(
          and(
            eq(table.id, params.resourceId),
            eq(table.organizationId, params.organizationId),
          ),
        )
        .limit(1);
      if (!resource)
        throw new HTTPException(404, { message: "Resource not found" });
      return c.json({ orgPrivilege: resource.orgPrivilege ?? null });
    },
  )
  .put(
    "/:organizationId/:resourceType/:resourceId/org-privilege",
    validator("param", resourceParamsSchema),
    validator("json", v.object({ orgPrivilege: orgPrivilegeSchema })),
    async (c) => {
      const params = c.req.valid("param");
      const { orgPrivilege } = c.req.valid("json");
      const table = resourceTable(params.resourceType);
      const [updated] = await db
        .update(table)
        .set({ orgPrivilege })
        .where(
          and(
            eq(table.id, params.resourceId),
            eq(table.organizationId, params.organizationId),
          ),
        )
        .returning({ orgPrivilege: table.orgPrivilege });
      if (!updated)
        throw new HTTPException(404, { message: "Resource not found" });
      return c.json({ orgPrivilege: updated.orgPrivilege ?? null });
    },
  )
  .put(
    "/:organizationId/:resourceType/:resourceId",
    validator("param", resourceParamsSchema),
    validator("json", grantBodySchema),
    async (c) => {
      const params = c.req.valid("param");
      const body = c.req.valid("json");
      await Promise.all([
        validateResource(params),
        validatePrincipal(params.organizationId, body),
      ]);
      const principalCondition =
        body.principalType === "user"
          ? eq(schema.resourceGrantTable.userId, body.principalId)
          : eq(schema.resourceGrantTable.teamId, body.principalId);
      const where = and(
        eq(schema.resourceGrantTable.organizationId, params.organizationId),
        eq(schema.resourceGrantTable.resourceType, params.resourceType),
        eq(schema.resourceGrantTable.resourceId, params.resourceId),
        principalCondition,
      );
      const [existing] = await db
        .select({ id: schema.resourceGrantTable.id })
        .from(schema.resourceGrantTable)
        .where(where)
        .limit(1);
      const [grant] = existing
        ? await db
            .update(schema.resourceGrantTable)
            .set({ privilege: body.privilege })
            .where(eq(schema.resourceGrantTable.id, existing.id))
            .returning()
        : await db
            .insert(schema.resourceGrantTable)
            .values({
              organizationId: params.organizationId,
              resourceType: params.resourceType,
              resourceId: params.resourceId,
              userId: body.principalType === "user" ? body.principalId : null,
              teamId: body.principalType === "team" ? body.principalId : null,
              privilege: body.privilege,
            })
            .returning();
      return c.json(grant);
    },
  )
  .delete(
    "/:organizationId/:resourceType/:resourceId/:grantId",
    validator("param", grantParamsSchema),
    async (c) => {
      const params = c.req.valid("param");
      await validateResource(params);
      const [deleted] = await db
        .delete(schema.resourceGrantTable)
        .where(
          and(
            eq(schema.resourceGrantTable.id, params.grantId),
            eq(schema.resourceGrantTable.organizationId, params.organizationId),
            eq(schema.resourceGrantTable.resourceType, params.resourceType),
            eq(schema.resourceGrantTable.resourceId, params.resourceId),
          ),
        )
        .returning({ id: schema.resourceGrantTable.id });
      if (!deleted)
        throw new HTTPException(404, { message: "Grant not found" });
      return c.json(deleted);
    },
  );

export default resourceGrant;
