import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { boardTable, taskRelationTable, taskTable } from "../database/schema";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import { validateOrganizationAccess } from "../utils/validate-organization-access";
import createTaskRelation from "./controllers/create-task-relation";
import deleteTaskRelation from "./controllers/delete-task-relation";
import getBoardTaskRelations from "./controllers/get-board-task-relations";
import getTaskRelations from "./controllers/get-task-relations";

const taskRelationSchema = v.object({
  id: v.string(),
  sourceTaskId: v.string(),
  targetTaskId: v.string(),
  relationType: v.string(),
  createdAt: v.date(),
});

const taskRelation = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
  };
}>()
  .get(
    "/board/:boardId",
    describeRoute({
      operationId: "getBoardTaskRelations",
      tags: ["Task Relations"],
      description: "Get all relations between tasks on a board",
      responses: {
        200: {
          description: "Task relations scoped to a single board",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  relations: v.array(
                    v.object({
                      id: v.string(),
                      sourceTaskId: v.string(),
                      targetTaskId: v.string(),
                      relationType: v.string(),
                    }),
                  ),
                  foreignTasks: v.array(v.any()),
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId } = c.req.valid("param");
      return c.json(
        await getBoardTaskRelations(
          boardId,
          c.get("organizationId"),
          c.get("userId"),
        ),
      );
    },
  )
  .get(
    "/:taskId",
    describeRoute({
      operationId: "getTaskRelations",
      tags: ["Task Relations"],
      description: "Get all relations for a task",
      responses: {
        200: {
          description: "Task relations with associated task data",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    organizationAccess.fromTaskId("taskId"),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const relations = await getTaskRelations(taskId, c.get("organizationId"));
      return c.json(relations);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createTaskRelation",
      tags: ["Task Relations"],
      description: "Create a relation between two tasks",
      responses: {
        200: {
          description: "Task relation created successfully",
          content: {
            "application/json": { schema: resolver(taskRelationSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        sourceTaskId: v.string(),
        targetTaskId: v.string(),
        relationType: v.picklist(["subtask", "blocks", "related"]),
      }),
    ),
    async (c, next) => {
      const userId = c.get("userId");
      if (!userId) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { sourceTaskId } = c.req.valid("json");
      const [task] = await db
        .select({ organizationId: boardTable.organizationId })
        .from(taskTable)
        .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
        .where(eq(taskTable.id, sourceTaskId))
        .limit(1);
      if (!task) {
        throw new HTTPException(404, { message: "Source task not found" });
      }
      await validateOrganizationAccess(userId, task.organizationId);
      c.set("organizationId", task.organizationId);
      return next();
    },
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const userId = c.get("userId");
      const { sourceTaskId, targetTaskId, relationType } = c.req.valid("json");
      const relation = await createTaskRelation({
        sourceTaskId,
        targetTaskId,
        relationType,
        userId,
        organizationId: c.get("organizationId"),
      });
      return c.json(relation);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteTaskRelation",
      tags: ["Task Relations"],
      description: "Delete a task relation",
      responses: {
        200: {
          description: "Task relation deleted successfully",
          content: {
            "application/json": { schema: resolver(taskRelationSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    async (c, next) => {
      const userId = c.get("userId");
      if (!userId) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { id } = c.req.valid("param");
      const [rel] = await db
        .select({ sourceTaskId: taskRelationTable.sourceTaskId })
        .from(taskRelationTable)
        .where(eq(taskRelationTable.id, id))
        .limit(1);
      if (!rel) {
        throw new HTTPException(404, { message: "Task relation not found" });
      }
      const [task] = await db
        .select({ organizationId: boardTable.organizationId })
        .from(taskTable)
        .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
        .where(eq(taskTable.id, rel.sourceTaskId))
        .limit(1);
      if (!task) {
        throw new HTTPException(404, { message: "Task not found" });
      }
      await validateOrganizationAccess(userId, task.organizationId);
      c.set("organizationId", task.organizationId);
      return next();
    },
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const userId = c.get("userId");
      const { id } = c.req.valid("param");
      const relation = await deleteTaskRelation(id, userId);
      return c.json(relation);
    },
  );

export default taskRelation;
