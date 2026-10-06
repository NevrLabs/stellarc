import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import createFlagType from "./controllers/create-flag-type";
import deleteFlagType from "./controllers/delete-flag-type";
import getFlagTypesByBoardId from "./controllers/get-flag-types-by-board-id";
import getFlagsForUser from "./controllers/get-flags-for-user";
import getTaskFlags from "./controllers/get-task-flags";
import raiseTaskFlag from "./controllers/raise-task-flag";
import resolveTaskFlag from "./controllers/resolve-task-flag";
import updateFlagType from "./controllers/update-flag-type";

/**
 * Response schemas are defined locally and eagerly — referencing an undefined
 * schema inside describeRoute still bundles fine but throws ReferenceError at
 * boot, crash-looping the API.
 */
const flagTypeSchema = v.object({
  id: v.string(),
  boardId: v.string(),
  name: v.string(),
  color: v.nullable(v.string()),
  icon: v.nullable(v.string()),
  position: v.number(),
  createdAt: v.union([v.string(), v.date()]),
  updatedAt: v.union([v.string(), v.date()]),
});

const taskFlagSchema = v.object({
  id: v.string(),
  taskId: v.string(),
  flagTypeId: v.string(),
  flaggedBy: v.nullable(v.string()),
  targetUserId: v.nullable(v.string()),
  targetTeamId: v.nullable(v.string()),
  note: v.nullable(v.string()),
  resolvedAt: v.nullable(v.union([v.string(), v.date()])),
  resolvedBy: v.nullable(v.string()),
  createdAt: v.union([v.string(), v.date()]),
  updatedAt: v.union([v.string(), v.date()]),
});

const taskFlagDetailSchema = v.looseObject({
  id: v.string(),
  taskId: v.string(),
  flagTypeId: v.string(),
  flagTypeName: v.string(),
  resolvedAt: v.nullable(v.union([v.string(), v.date()])),
  resolvedBy: v.nullable(v.string()),
});

const flag = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/type/board/:boardId",
    describeRoute({
      operationId: "getBoardFlagTypes",
      tags: ["Flags"],
      description:
        "List the flag types available on a board, seeding the four defaults when the board has none",
      responses: {
        200: {
          description: "Flag types for the board",
          content: {
            "application/json": { schema: resolver(v.array(flagTypeSchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const flagTypes = await getFlagTypesByBoardId(boardId);
      return c.json(flagTypes);
    },
  )
  .post(
    "/type",
    describeRoute({
      operationId: "createFlagType",
      tags: ["Flags"],
      description: "Create a board-wide flag type",
      responses: {
        200: {
          description: "Flag type created",
          content: {
            "application/json": { schema: resolver(flagTypeSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        boardId: v.string(),
        name: v.pipe(v.string(), v.minLength(1)),
        color: v.optional(v.nullable(v.string())),
        icon: v.optional(v.nullable(v.string())),
        position: v.optional(v.number()),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const body = c.req.valid("json");
      const flagType = await createFlagType(body);
      return c.json(flagType);
    },
  )
  .put(
    "/type/:id",
    describeRoute({
      operationId: "updateFlagType",
      tags: ["Flags"],
      description: "Update a board flag type",
      responses: {
        200: {
          description: "Flag type updated",
          content: {
            "application/json": { schema: resolver(flagTypeSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(v.pipe(v.string(), v.minLength(1))),
        color: v.optional(v.nullable(v.string())),
        icon: v.optional(v.nullable(v.string())),
        position: v.optional(v.number()),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const flagType = await updateFlagType(id, body);
      return c.json(flagType);
    },
  )
  .delete(
    "/type/:id",
    describeRoute({
      operationId: "deleteFlagType",
      tags: ["Flags"],
      description: "Delete a board flag type",
      responses: {
        200: {
          description: "Flag type deleted",
          content: {
            "application/json": { schema: resolver(flagTypeSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const flagType = await deleteFlagType(id);
      return c.json(flagType);
    },
  )
  .get(
    "/task/:taskId",
    describeRoute({
      operationId: "getTaskFlags",
      tags: ["Flags"],
      description:
        "List flags on a task. Only active (unresolved) flags unless includeResolved=true",
      responses: {
        200: {
          description: "Flags on the task",
          content: {
            "application/json": {
              schema: resolver(v.array(taskFlagDetailSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "query",
      v.object({
        includeResolved: v.optional(v.picklist(["true", "false"])),
      }),
    ),
    organizationAccess.fromTaskId(),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const { includeResolved } = c.req.valid("query");
      const flags = await getTaskFlags(taskId, includeResolved === "true");
      return c.json(flags);
    },
  )
  .post(
    "/task/:taskId",
    describeRoute({
      operationId: "raiseTaskFlag",
      tags: ["Flags"],
      description:
        "Raise a flag on a task, targeting exactly one of a user or a team",
      responses: {
        200: {
          description: "Flag raised",
          content: {
            "application/json": { schema: resolver(taskFlagSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "json",
      v.object({
        flagTypeId: v.string(),
        targetUserId: v.optional(v.nullable(v.string())),
        targetTeamId: v.optional(v.nullable(v.string())),
        note: v.optional(v.nullable(v.string())),
      }),
    ),
    organizationAccess.fromTaskId(),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const body = c.req.valid("json");
      const userId = c.get("userId");
      const raised = await raiseTaskFlag({
        taskId,
        flagTypeId: body.flagTypeId,
        flaggedBy: userId,
        targetUserId: body.targetUserId ?? null,
        targetTeamId: body.targetTeamId ?? null,
        note: body.note ?? null,
      });
      return c.json(raised);
    },
  )
  .post(
    "/:id/resolve",
    describeRoute({
      operationId: "resolveTaskFlag",
      tags: ["Flags"],
      description:
        "Unflag a task. Keeps the row for audit and records who resolved it",
      responses: {
        200: {
          description: "Flag resolved",
          content: {
            "application/json": { schema: resolver(taskFlagSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    // #107: unflagging demands a written reason. Enforced server-side so the
    // rule holds for API clients, not just the dialog.
    validator(
      "json",
      v.object({
        resolveNote: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(1, "A note is required to unflag"),
        ),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { resolveNote } = c.req.valid("json");
      const userId = c.get("userId");
      const resolved = await resolveTaskFlag(id, userId, resolveNote);
      return c.json(resolved);
    },
  )
  .get(
    "/mine",
    describeRoute({
      operationId: "getMyFlags",
      tags: ["Flags"],
      description:
        "Active flags targeting the current user directly or via their teams",
      responses: {
        200: {
          description: "Flags targeting the current user",
          content: {
            "application/json": {
              schema: resolver(v.array(taskFlagDetailSchema)),
            },
          },
        },
      },
    }),
    validator("query", v.object({ organizationId: v.optional(v.string()) })),
    async (c) => {
      const { organizationId } = c.req.valid("query");
      const userId = c.get("userId");
      const flags = await getFlagsForUser(userId, organizationId);
      return c.json(flags);
    },
  );

export default flag;
