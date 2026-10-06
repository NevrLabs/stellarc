import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import assignMilestoneToTask from "./controllers/assign-milestone-to-task";
import createMilestone from "./controllers/create-milestone";
import deleteMilestone from "./controllers/delete-milestone";
import getMilestone from "./controllers/get-milestone";
import getMilestonesByBoardId from "./controllers/get-milestones-by-board-id";
import updateMilestone from "./controllers/update-milestone";

const milestoneStatusSchema = v.picklist([
  "planned",
  "active",
  "completed",
  "archived",
]);
const milestoneDueDateSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must use YYYY-MM-DD"),
);

const milestoneSchema = v.object({
  id: v.string(),
  boardId: v.string(),
  name: v.string(),
  description: v.nullable(v.string()),
  dueDate: v.nullable(v.union([v.string(), v.date()])),
  status: v.string(),
  position: v.number(),
  completedAt: v.nullable(v.union([v.string(), v.date()])),
  createdAt: v.union([v.string(), v.date()]),
  updatedAt: v.union([v.string(), v.date()]),
});

/**
 * Milestones are BOARD-SCOPED: every route is nested under /board/:boardId so
 * the board is always part of the addressing and of the access check.
 */
const milestone = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/board/:boardId",
    describeRoute({
      operationId: "getBoardMilestones",
      tags: ["Milestones"],
      description: "Get all milestones for a specific board",
      responses: {
        200: {
          description: "List of milestones on the board",
          content: {
            "application/json": { schema: resolver(v.array(milestoneSchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const milestones = await getMilestonesByBoardId(boardId);
      return c.json(milestones);
    },
  )
  .post(
    "/board/:boardId",
    describeRoute({
      operationId: "createMilestone",
      tags: ["Milestones"],
      description: "Create a new milestone on a board",
      responses: {
        200: {
          description: "Milestone created successfully",
          content: {
            "application/json": { schema: resolver(milestoneSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1)),
        description: v.optional(v.nullable(v.string())),
        dueDate: v.optional(v.nullable(milestoneDueDateSchema)),
        status: v.optional(milestoneStatusSchema),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const { name, description, dueDate, status } = c.req.valid("json");
      const created = await createMilestone({
        boardId,
        name,
        description,
        dueDate,
        status,
      });
      return c.json(created);
    },
  )
  .get(
    "/board/:boardId/:id",
    describeRoute({
      operationId: "getMilestone",
      tags: ["Milestones"],
      description: "Get a single milestone on a board",
      responses: {
        200: {
          description: "Milestone details",
          content: {
            "application/json": { schema: resolver(milestoneSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string(), id: v.string() })),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId, id } = c.req.valid("param");
      return c.json(await getMilestone(boardId, id));
    },
  )
  .put(
    "/board/:boardId/task/:taskId",
    describeRoute({
      operationId: "assignTaskMilestone",
      tags: ["Milestones"],
      description: "Assign a task to a milestone (or clear it with null)",
      responses: {
        200: {
          description: "Task milestone updated",
        },
      },
    }),
    validator("param", v.object({ boardId: v.string(), taskId: v.string() })),
    validator("json", v.object({ milestoneId: v.nullable(v.string()) })),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ task: ["update"] }),
    async (c) => {
      const { boardId, taskId } = c.req.valid("param");
      const { milestoneId } = c.req.valid("json");
      const task = await assignMilestoneToTask(boardId, taskId, milestoneId);
      return c.json(task);
    },
  )
  .put(
    "/board/:boardId/:id",
    describeRoute({
      operationId: "updateMilestone",
      tags: ["Milestones"],
      description: "Update a milestone on a board",
      responses: {
        200: {
          description: "Milestone updated successfully",
          content: {
            "application/json": { schema: resolver(milestoneSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string(), id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(v.pipe(v.string(), v.minLength(1))),
        description: v.optional(v.nullable(v.string())),
        dueDate: v.optional(v.nullable(milestoneDueDateSchema)),
        status: v.optional(milestoneStatusSchema),
        position: v.optional(v.number()),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { boardId, id } = c.req.valid("param");
      const updates = c.req.valid("json");
      return c.json(await updateMilestone(boardId, id, updates));
    },
  )
  .delete(
    "/board/:boardId/:id",
    describeRoute({
      operationId: "deleteMilestone",
      tags: ["Milestones"],
      description: "Delete a milestone from a board",
      responses: {
        200: {
          description: "Milestone deleted successfully",
          content: {
            "application/json": { schema: resolver(milestoneSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string(), id: v.string() })),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { boardId, id } = c.req.valid("param");
      return c.json(await deleteMilestone(boardId, id));
    },
  );

export default milestone;
