import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import getSettings from "../utils/get-settings";
import { isInstanceAdmin } from "../utils/is-instance-admin";

const bodySchema = v.object({
  organizationId: v.pipe(v.string(), v.minLength(1)),
  claimPath: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/),
  ),
  roleMappings: v.array(
    v.object({
      role: v.pipe(v.string(), v.trim(), v.minLength(1)),
      teamId: v.pipe(v.string(), v.minLength(1)),
    }),
  ),
});

const oidcTeamSync = new Hono<{
  Variables: {
    user: { role?: string | null } | null;
    userId: string;
  };
}>();

oidcTeamSync.use("*", async (c, next) => {
  // Claim mapping only exists in single-org mode. Refusing here means the
  // multi-org instance cannot read or write mapping config at all, so the
  // previous all-organizations read is unreachable rather than merely unused.
  if (!getSettings().singleOrgMode) {
    throw new HTTPException(404, {
      message:
        "OIDC claim mapping is only available in single-organization mode",
    });
  }
  if (!(await isInstanceAdmin(c))) {
    throw new HTTPException(403, {
      message: "Instance administrator required",
    });
  }
  await next();
});

oidcTeamSync.get("/", async (c) => {
  const [configs, teams] = await Promise.all([
    db.select().from(schema.oidcTeamSyncConfigTable),
    db
      .select({
        id: schema.teamTable.id,
        name: schema.teamTable.name,
        source: schema.teamTable.source,
        organizationId: schema.teamTable.organizationId,
        organizationName: schema.organizationTable.name,
      })
      .from(schema.teamTable)
      .innerJoin(
        schema.organizationTable,
        eq(schema.teamTable.organizationId, schema.organizationTable.id),
      ),
  ]);

  return c.json({ configs, teams });
});

oidcTeamSync.put("/", validator("json", bodySchema), async (c) => {
  const body = c.req.valid("json");
  const mappedTeamIds = [
    ...new Set(body.roleMappings.map(({ teamId }) => teamId)),
  ];

  if (mappedTeamIds.length > 0) {
    const eligibleTeams = await db
      .select({ id: schema.teamTable.id })
      .from(schema.teamTable)
      .where(
        and(
          eq(schema.teamTable.organizationId, body.organizationId),
          eq(schema.teamTable.source, "oidc"),
        ),
      );
    const eligibleIds = new Set(eligibleTeams.map(({ id }) => id));
    if (mappedTeamIds.some((teamId) => !eligibleIds.has(teamId))) {
      throw new HTTPException(400, {
        message:
          "Mappings may only target IdP-synced teams in this organization",
      });
    }
  }

  const [saved] = await db
    .insert(schema.oidcTeamSyncConfigTable)
    .values(body)
    .onConflictDoUpdate({
      target: schema.oidcTeamSyncConfigTable.organizationId,
      set: {
        claimPath: body.claimPath,
        roleMappings: body.roleMappings,
      },
    })
    .returning();

  return c.json(saved);
});

export default oidcTeamSync;
