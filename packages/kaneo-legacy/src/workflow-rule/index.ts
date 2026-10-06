import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import deleteWorkflowRule from "./controllers/delete-workflow-rule";
import getWorkflowRules from "./controllers/get-workflow-rules";
import upsertWorkflowRule from "./controllers/upsert-workflow-rule";

const workflowRule = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/:boardId",
    describeRoute({
      operationId: "getWorkflowRules",
      tags: ["Workflow Rules"],
      description: "Get all workflow rules for a board",
      responses: {
        200: {
          description: "List of workflow rules",
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
      const rules = await getWorkflowRules(boardId);
      return c.json(rules);
    },
  )
  .put(
    "/:boardId",
    describeRoute({
      operationId: "upsertWorkflowRule",
      tags: ["Workflow Rules"],
      description: "Create or update a workflow rule",
      responses: {
        200: {
          description: "Workflow rule upserted successfully",
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
        integrationType: v.string(),
        eventType: v.string(),
        columnId: v.string(),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const { integrationType, eventType, columnId } = c.req.valid("json");
      const result = await upsertWorkflowRule({
        boardId,
        integrationType,
        eventType,
        columnId,
      });
      return c.json(result);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteWorkflowRule",
      tags: ["Workflow Rules"],
      description: "Delete a workflow rule",
      responses: {
        200: {
          description: "Workflow rule deleted successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    organizationAccess.fromWorkflowRule("id"),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await deleteWorkflowRule(id);
      return c.json(result);
    },
  );

export default workflowRule;
