import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { renameBoardKey } from "../identity/rename-identity";
import { boardSchema } from "../schemas";
import {
  BACKLOG_STATUS_SLUGS,
  STATUS_DEFINITIONS,
} from "../task/status-taxonomy";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import archiveBoardCtrl from "./controllers/archive-board";
import createBoardCtrl from "./controllers/create-board";
import deleteBoardCtrl from "./controllers/delete-board";
import getBoardCtrl from "./controllers/get-board";
import getBoardsCtrl from "./controllers/get-boards";
import unarchiveBoardCtrl from "./controllers/unarchive-board";
import updateBoardCtrl from "./controllers/update-board";

const TASK_STATUS_ORDER_SLUGS = STATUS_DEFINITIONS.filter(
  (status) => !status.isBacklog,
).map((status) => status.slug);

/**
 * #226: a board stores ordering only — never arbitrary status definitions.
 * Reject unknown/duplicate slugs so one malformed PUT cannot make a status
 * appear twice or disappear. Partial arrays are valid; readers append omitted
 * statuses canonically, making future vocabulary additions safe.
 */
function statusOrderValidator(allowed: readonly string[]) {
  return v.pipe(
    v.array(v.string()),
    v.maxLength(64),
    v.check(
      (values) => new Set(values).size === values.length,
      "Status order cannot contain duplicates",
    ),
    v.check(
      (values) => values.every((value) => allowed.includes(value)),
      "Status order contains an unknown or wrong-surface status",
    ),
  );
}

const board = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listBoards",
      tags: ["Boards"],
      description: "Get all boards in a organization",
      responses: {
        200: {
          description: "List of boards with statistics",
          content: {
            "application/json": { schema: resolver(v.array(boardSchema)) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        organizationId: v.string(),
        includeArchived: v.optional(v.string()),
        teamId: v.optional(v.string()),
      }),
    ),
    organizationAccess.fromQuery(),
    async (c) => {
      const organizationId = c.get("organizationId");
      const userId = c.get("userId");
      const { includeArchived, teamId } = c.req.valid("query");
      const boards = await getBoardsCtrl(
        organizationId,
        userId,
        includeArchived === "true",
        teamId,
      );
      return c.json(boards);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createBoard",
      tags: ["Boards"],
      description: "Create a new board in a organization",
      responses: {
        200: {
          description: "Board created successfully",
          content: {
            "application/json": { schema: resolver(boardSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        name: v.string(),
        organizationId: v.string(),
        icon: v.string(),
        slug: v.string(),
      }),
    ),
    organizationAccess.fromBody(),
    requireOrganizationPermission({ board: ["create"] }),
    async (c) => {
      const { name, icon, slug } = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const newBoard = await createBoardCtrl(organizationId, name, icon, slug);
      return c.json(newBoard);
    },
  )
  .put(
    "/:id/key",
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ key: v.string() })),
    organizationAccess.fromBoard(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) =>
      c.json(
        await renameBoardKey(
          c.req.valid("param").id,
          c.get("organizationId"),
          c.req.valid("json").key,
        ),
      ),
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getBoard",
      tags: ["Boards"],
      description: "Get a specific board by ID",
      responses: {
        200: {
          description: "Board details",
          content: {
            "application/json": { schema: resolver(boardSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromBoard(),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const boardData = await getBoardCtrl(id, organizationId);
      return c.json(boardData);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateBoard",
      tags: ["Boards"],
      description: "Update an existing board",
      responses: {
        200: {
          description: "Board updated successfully",
          content: {
            "application/json": { schema: resolver(boardSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        icon: v.string(),
        slug: v.string(),
        description: v.string(),
        isPublic: v.boolean(),
        // #95: nesting depth is a per-board setting. Clamp in valibot so the
        // API rejects out-of-range values before the DB CHECK constraint does.
        subtaskDepthLimit: v.optional(
          v.pipe(
            v.number(),
            v.integer(),
            v.minValue(1, "subtaskDepthLimit must be between 1 and 4"),
            v.maxValue(4, "subtaskDepthLimit must be between 1 and 4"),
          ),
        ),
        // #226: board-owned ordering only; vocabulary remains global.
        taskStatusOrder: v.optional(
          statusOrderValidator(TASK_STATUS_ORDER_SLUGS),
        ),
        backlogStatusOrder: v.optional(
          statusOrderValidator(BACKLOG_STATUS_SLUGS),
        ),
        defaultAssigneeId: v.optional(v.union([v.string(), v.null()])),
        defaultAssigneeTeamId: v.optional(v.union([v.string(), v.null()])),
      }),
    ),
    organizationAccess.fromBoard(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const {
        name,
        icon,
        slug,
        description,
        isPublic,
        subtaskDepthLimit,
        taskStatusOrder,
        backlogStatusOrder,
        defaultAssigneeId,
        defaultAssigneeTeamId,
      } = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const updatedBoard = await updateBoardCtrl(
        id,
        name,
        icon,
        slug,
        description,
        isPublic,
        organizationId,
        subtaskDepthLimit,
        taskStatusOrder,
        backlogStatusOrder,
        defaultAssigneeId,
        defaultAssigneeTeamId,
      );
      return c.json(updatedBoard);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteBoard",
      tags: ["Boards"],
      description: "Delete a board by ID",
      responses: {
        200: {
          description: "Board deleted successfully",
          content: {
            "application/json": { schema: resolver(boardSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromBoard(),
    requireOrganizationPermission({ board: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const deletedBoard = await deleteBoardCtrl(id, organizationId);
      return c.json(deletedBoard);
    },
  )
  .put(
    "/:id/archive",
    describeRoute({
      operationId: "archiveBoard",
      tags: ["Boards"],
      description: "Archive a board by ID",
      responses: {
        200: {
          description: "Board archived successfully",
          content: {
            "application/json": { schema: resolver(boardSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromBoard(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const archivedBoard = await archiveBoardCtrl(id, organizationId);
      return c.json(archivedBoard);
    },
  )
  .put(
    "/:id/unarchive",
    describeRoute({
      operationId: "unarchiveBoard",
      tags: ["Boards"],
      description: "Unarchive a board by ID",
      responses: {
        200: {
          description: "Board unarchived successfully",
          content: {
            "application/json": { schema: resolver(boardSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromBoard(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const unarchivedBoard = await unarchiveBoardCtrl(id, organizationId);
      return c.json(unarchivedBoard);
    },
  );

export default board;
