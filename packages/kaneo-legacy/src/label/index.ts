import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { labelSchema } from "../schemas";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import assignLabelToTask from "./controllers/assign-label-to-task";
import createLabel from "./controllers/create-label";
import deleteLabel from "./controllers/delete-label";
import getLabel from "./controllers/get-label";
import getLabelsByOrganizationId from "./controllers/get-labels-by-organization-id";
import getLabelsByTaskId from "./controllers/get-labels-by-task-id";
import unassignLabelFromTask from "./controllers/unassign-label-from-task";
import updateLabel from "./controllers/update-label";

const label = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/task/:taskId",
    describeRoute({
      operationId: "getTaskLabels",
      tags: ["Labels"],
      description: "Get all labels assigned to a specific task",
      responses: {
        200: {
          description: "List of labels for the task",
          content: {
            "application/json": { schema: resolver(v.array(labelSchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    organizationAccess.fromTaskId(),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const labels = await getLabelsByTaskId(taskId);
      return c.json(labels);
    },
  )
  .get(
    "/organization/:organizationId",
    describeRoute({
      operationId: "getOrganizationLabels",
      tags: ["Labels"],
      description: "Get all labels for a specific organization",
      responses: {
        200: {
          description: "List of labels in the organization",
          content: {
            "application/json": { schema: resolver(v.array(labelSchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam(),
    async (c) => {
      const { organizationId } = c.req.valid("param");
      const labels = await getLabelsByOrganizationId(organizationId);
      return c.json(labels);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createLabel",
      tags: ["Labels"],
      description: "Create a new label in a organization",
      responses: {
        200: {
          description: "Label created successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        name: v.string(),
        color: v.string(),
        organizationId: v.string(),
        taskId: v.optional(v.string()),
      }),
    ),
    organizationAccess.fromBody(),
    requireOrganizationPermission({ label: ["create"] }),
    async (c) => {
      const { name, color, organizationId, taskId } = c.req.valid("json");
      const userId = c.get("userId");
      const label = await createLabel(
        name,
        color,
        taskId,
        organizationId,
        userId,
      );
      return c.json(label);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getLabel",
      tags: ["Labels"],
      description: "Get a specific label by ID",
      responses: {
        200: {
          description: "Label details",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromLabel(),
    async (c) => {
      const { id } = c.req.valid("param");
      const label = await getLabel(id);
      return c.json(label);
    },
  )
  .put(
    "/:id/task",
    describeRoute({
      operationId: "attachLabelToTask",
      tags: ["Labels"],
      description: "Attach an existing label to a task",
      responses: {
        200: {
          description: "Label attached to task successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ taskId: v.string() })),
    organizationAccess.fromLabel(),
    requireOrganizationPermission({ label: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { taskId } = c.req.valid("json");
      const userId = c.get("userId");
      const label = await assignLabelToTask(id, taskId, userId);
      return c.json(label);
    },
  )
  .delete(
    "/:id/task",
    describeRoute({
      operationId: "detachLabelFromTask",
      tags: ["Labels"],
      description: "Detach a label from its current task",
      responses: {
        200: {
          description: "Label detached from task successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromLabel(),
    requireOrganizationPermission({ label: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const userId = c.get("userId");
      const label = await unassignLabelFromTask(id, userId);
      return c.json(label);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateLabel",
      tags: ["Labels"],
      description: "Update an existing label",
      responses: {
        200: {
          description: "Label updated successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        color: v.string(),
      }),
    ),
    organizationAccess.fromLabel(),
    requireOrganizationPermission({ label: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { name, color } = c.req.valid("json");
      const label = await updateLabel(id, name, color);
      return c.json(label);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteLabel",
      tags: ["Labels"],
      description: "Delete a label by ID",
      responses: {
        200: {
          description: "Label deleted successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromLabel(),
    requireOrganizationPermission({ label: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const userId = c.get("userId");
      const label = await deleteLabel(id, userId);
      return c.json(label);
    },
  );

export default label;
