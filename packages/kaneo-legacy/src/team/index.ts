import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import { organizationAccess } from "../utils/organization-access-middleware";
import {
  getEffectiveTeamMembers,
  wouldCreateTeamCycle,
} from "./effective-membership";

/**
 * Sub-team endpoints. Team CRUD itself lives in Better Auth's organization
 * plugin; these cover what it cannot express — the parent link and the
 * transitively-resolved member list.
 */
const team = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
  };
}>()
  .get(
    "/hierarchy",
    describeRoute({
      operationId: "getTeamHierarchy",
      tags: ["Teams"],
      description:
        "Parent links for every team in the organization. Served here rather than through Better Auth's listTeams because its client strips fields it does not know at parse time.",
      responses: {
        200: {
          description: "Teams with their parent ids",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    parentTeamId: v.nullable(v.string()),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("query", v.object({ organizationId: v.string() })),
    organizationAccess.fromQuery(),
    async (c) => {
      const organizationId = c.get("organizationId");
      const rows = await db
        .select({
          id: schema.teamTable.id,
          parentTeamId: schema.teamTable.parentTeamId,
        })
        .from(schema.teamTable)
        .where(eq(schema.teamTable.organizationId, organizationId));
      return c.json(rows);
    },
  )
  .put(
    "/:teamId/parent",
    describeRoute({
      operationId: "setTeamParent",
      tags: ["Teams"],
      description:
        "Set or clear a team's parent team (sub-teams). Members of a sub-team count as members of every ancestor team, resolved at query time. Rejects cycles and cross-organization parents.",
      responses: {
        200: {
          description: "Updated team",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  id: v.string(),
                  parentTeamId: v.nullable(v.string()),
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    validator(
      "json",
      v.object({
        organizationId: v.string(),
        parentTeamId: v.nullable(v.string()),
      }),
    ),
    organizationAccess.fromBody(),
    async (c) => {
      const { teamId } = c.req.valid("param");
      const { parentTeamId } = c.req.valid("json");
      const organizationId = c.get("organizationId");

      const [target] = await db
        .select({ id: schema.teamTable.id })
        .from(schema.teamTable)
        .where(
          and(
            eq(schema.teamTable.id, teamId),
            eq(schema.teamTable.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!target) throw new HTTPException(404, { message: "Team not found" });

      if (parentTeamId !== null) {
        const [parent] = await db
          .select({ id: schema.teamTable.id })
          .from(schema.teamTable)
          .where(
            and(
              eq(schema.teamTable.id, parentTeamId),
              eq(schema.teamTable.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!parent) {
          throw new HTTPException(404, { message: "Parent team not found" });
        }
        if (await wouldCreateTeamCycle(teamId, parentTeamId)) {
          throw new HTTPException(409, {
            message:
              "That parent would create a cycle: a team cannot nest under itself or one of its own sub-teams",
          });
        }
      }

      const [updated] = await db
        .update(schema.teamTable)
        .set({ parentTeamId })
        .where(eq(schema.teamTable.id, teamId))
        .returning({
          id: schema.teamTable.id,
          parentTeamId: schema.teamTable.parentTeamId,
        });
      return c.json(updated);
    },
  )
  .get(
    "/:teamId/effective-members",
    describeRoute({
      operationId: "getEffectiveTeamMembers",
      tags: ["Teams"],
      description:
        "Members of a team including everyone inherited from its sub-teams. Inherited rows carry the sub-team that contributes them (viaTeamId/viaTeamName); direct members have both null.",
      responses: {
        200: {
          description: "Effective members with provenance",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    userId: v.string(),
                    viaTeamId: v.nullable(v.string()),
                    viaTeamName: v.nullable(v.string()),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    validator("query", v.object({ organizationId: v.string() })),
    organizationAccess.fromQuery(),
    async (c) => {
      const { teamId } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const [target] = await db
        .select({ id: schema.teamTable.id })
        .from(schema.teamTable)
        .where(
          and(
            eq(schema.teamTable.id, teamId),
            eq(schema.teamTable.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!target) throw new HTTPException(404, { message: "Team not found" });
      return c.json(await getEffectiveTeamMembers(teamId));
    },
  );

export default team;
