import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { taskTemplateTable } from "../database/schema";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";

const offsetSchema = v.nullable(
  v.pipe(
    v.string(),
    v.regex(/^([+-])(\d{1,5})([mhdw])$/i),
    v.check((value) => {
      const match = /^([+-])(\d+)([mhdw])$/i.exec(value);
      if (!match) return false;
      const units = { m: 1 / 1440, h: 1 / 24, d: 1, w: 7 };
      const unit = match[3]?.toLowerCase() as keyof typeof units | undefined;
      return Boolean(unit && Number(match[2]) * units[unit] <= 3650);
    }),
  ),
);

const dataSchema = v.object({
  title: v.string(),
  description: v.nullable(v.string()),
  priority: v.nullable(v.string()),
  startDate: v.nullable(v.string()),
  dueDate: v.nullable(v.string()),
  status: v.optional(v.nullable(v.string())),
  labels: v.optional(v.array(v.string())),
  startDateOffset: v.optional(offsetSchema),
  dueDateOffset: v.optional(offsetSchema),
});

const taskTemplate = new Hono<{ Variables: { userId: string } }>()
  .get(
    "/organization/:organizationId",
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const { organizationId } = c.req.valid("param");
      return c.json(
        await db
          .select()
          .from(taskTemplateTable)
          .where(eq(taskTemplateTable.organizationId, organizationId))
          .orderBy(asc(taskTemplateTable.name)),
      );
    },
  )
  .post(
    "/organization/:organizationId",
    validator("param", v.object({ organizationId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.trim(), v.minLength(1)),
        data: dataSchema,
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => {
      const { organizationId } = c.req.valid("param");
      const [created] = await db
        .insert(taskTemplateTable)
        .values({ organizationId, ...c.req.valid("json") })
        .returning();
      return c.json(created);
    },
  )
  .put(
    "/organization/:organizationId/:id",
    validator(
      "param",
      v.object({ organizationId: v.string(), id: v.string() }),
    ),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.trim(), v.minLength(1)),
        data: dataSchema,
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => {
      const { organizationId, id } = c.req.valid("param");
      const [updated] = await db
        .update(taskTemplateTable)
        .set(c.req.valid("json"))
        .where(
          and(
            eq(taskTemplateTable.id, id),
            eq(taskTemplateTable.organizationId, organizationId),
          ),
        )
        .returning();
      return c.json(updated);
    },
  )
  .delete(
    "/organization/:organizationId/:id",
    validator(
      "param",
      v.object({ organizationId: v.string(), id: v.string() }),
    ),
    organizationAccess.fromParam("organizationId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => {
      const { organizationId, id } = c.req.valid("param");
      const [deleted] = await db
        .delete(taskTemplateTable)
        .where(
          and(
            eq(taskTemplateTable.id, id),
            eq(taskTemplateTable.organizationId, organizationId),
          ),
        )
        .returning();
      return c.json(deleted);
    },
  );

export default taskTemplate;
