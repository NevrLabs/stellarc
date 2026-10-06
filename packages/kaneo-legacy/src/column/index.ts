import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import createColumn from "./controllers/create-column";
import deleteColumn from "./controllers/delete-column";
import getColumns from "./controllers/get-columns";
import reorderColumns from "./controllers/reorder-columns";
import updateColumn from "./controllers/update-column";

const column = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/:boardId",
    describeRoute({
      operationId: "getColumns",
      tags: ["Columns"],
      description: "Get all columns for a board",
      responses: {
        200: {
          description: "List of columns ordered by position",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const columns = await getColumns(boardId);
      return c.json(columns);
    },
  )
  .post(
    "/:boardId",
    describeRoute({
      operationId: "createColumn",
      tags: ["Columns"],
      description: "Create a new column in a board",
      responses: {
        200: {
          description: "Column created successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        icon: v.optional(v.string()),
        color: v.optional(v.string()),
        isFinal: v.optional(v.boolean()),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const { name, icon, color, isFinal } = c.req.valid("json");
      const result = await createColumn({
        boardId,
        name,
        icon,
        color,
        isFinal,
      });
      return c.json(result);
    },
  )
  .put(
    "/reorder/:boardId",
    describeRoute({
      operationId: "reorderColumns",
      tags: ["Columns"],
      description: "Reorder columns in a board",
      responses: {
        200: {
          description: "Columns reordered successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "json",
      v.object({
        columns: v.array(
          v.object({
            id: v.string(),
            position: v.number(),
          }),
        ),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const { columns } = c.req.valid("json");
      const result = await reorderColumns(boardId, columns);
      return c.json(result);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateColumn",
      tags: ["Columns"],
      description: "Update a column",
      responses: {
        200: {
          description: "Column updated successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(v.string()),
        icon: v.optional(v.nullable(v.string())),
        color: v.optional(v.nullable(v.string())),
        isFinal: v.optional(v.boolean()),
      }),
    ),
    organizationAccess.fromColumn("id"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const data = c.req.valid("json");
      const result = await updateColumn(id, data);
      return c.json(result);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteColumn",
      tags: ["Columns"],
      description: "Delete a column",
      responses: {
        200: {
          description: "Column deleted successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromColumn("id"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await deleteColumn(id);
      return c.json(result);
    },
  );

export default column;
