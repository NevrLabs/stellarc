import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { integrationTable } from "../database/schema";
import {
  defaultSlackEvents,
  normalizeSlackConfig,
  type SlackConfig,
  validateSlackConfig,
} from "../plugins/slack/config";
import { slackIntegrationSchema } from "../schemas";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";

const slackIntegration = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
    apiKey?: {
      id: string;
      userId: string;
      enabled: boolean;
    };
  };
}>();

function maskWebhookUrl(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const maskedLast =
      last.length > 8 ? `${last.slice(0, 4)}…${last.slice(-4)}` : "••••";
    return `${url.origin}/${parts.slice(0, -1).join("/")}/${maskedLast}`;
  } catch {
    return "Configured";
  }
}

function toResponse(integration: {
  id: string;
  boardId: string;
  config: string;
  isActive: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const config = normalizeSlackConfig(
    JSON.parse(integration.config) as SlackConfig,
  );

  return {
    id: integration.id,
    boardId: integration.boardId,
    channelName: config.channelName ?? null,
    webhookConfigured: Boolean(config.webhookUrl),
    maskedWebhookUrl: maskWebhookUrl(config.webhookUrl),
    events: {
      ...defaultSlackEvents,
      ...(config.events ?? {}),
    },
    isActive: integration.isActive,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

async function getSlackIntegration(boardId: string) {
  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.boardId, boardId),
      eq(integrationTable.type, "slack"),
    ),
  });

  if (!integration) {
    return null;
  }

  return toResponse(integration);
}

const nullableSlackIntegrationSchema = v.nullable(slackIntegrationSchema);

slackIntegration
  .get(
    "/board/:boardId",
    describeRoute({
      operationId: "getSlackIntegration",
      tags: ["Slack"],
      description: "Get Slack integration for a board",
      responses: {
        200: {
          description: "Slack integration details",
          content: {
            "application/json": {
              schema: resolver(nullableSlackIntegrationSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const integration = await getSlackIntegration(boardId);
      return c.json(integration);
    },
  )
  .post(
    "/board/:boardId",
    describeRoute({
      operationId: "createSlackIntegration",
      tags: ["Slack"],
      description: "Create or replace a Slack integration for a board",
      responses: {
        200: {
          description: "Slack integration created successfully",
          content: {
            "application/json": { schema: resolver(slackIntegrationSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "json",
      v.object({
        webhookUrl: v.pipe(v.string(), v.minLength(1)),
        channelName: v.optional(v.string()),
        events: v.optional(
          v.object({
            taskCreated: v.optional(v.boolean()),
            taskStatusChanged: v.optional(v.boolean()),
            taskPriorityChanged: v.optional(v.boolean()),
            taskTitleChanged: v.optional(v.boolean()),
            taskDescriptionChanged: v.optional(v.boolean()),
            taskCommentCreated: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const body = c.req.valid("json");

      const config = normalizeSlackConfig({
        webhookUrl: body.webhookUrl,
        channelName: body.channelName,
        events: body.events,
      });

      const validation = await validateSlackConfig(config);
      if (!validation.valid) {
        throw new HTTPException(400, {
          message: validation.errors?.join(", ") ?? "Invalid config",
        });
      }

      const existing = await db.query.integrationTable.findFirst({
        where: and(
          eq(integrationTable.boardId, boardId),
          eq(integrationTable.type, "slack"),
        ),
      });

      if (existing) {
        await db
          .update(integrationTable)
          .set({
            config: JSON.stringify(config),
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(integrationTable.id, existing.id));
      } else {
        await db.insert(integrationTable).values({
          boardId,
          type: "slack",
          config: JSON.stringify(config),
          isActive: true,
        });
      }

      const integration = await getSlackIntegration(boardId);
      return c.json(integration);
    },
  )
  .patch(
    "/board/:boardId",
    describeRoute({
      operationId: "updateSlackIntegration",
      tags: ["Slack"],
      description: "Update Slack integration settings",
      responses: {
        200: {
          description: "Slack integration updated successfully",
          content: {
            "application/json": { schema: resolver(slackIntegrationSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "json",
      v.object({
        webhookUrl: v.optional(v.string()),
        channelName: v.optional(v.nullable(v.string())),
        isActive: v.optional(v.boolean()),
        events: v.optional(
          v.object({
            taskCreated: v.optional(v.boolean()),
            taskStatusChanged: v.optional(v.boolean()),
            taskPriorityChanged: v.optional(v.boolean()),
            taskTitleChanged: v.optional(v.boolean()),
            taskDescriptionChanged: v.optional(v.boolean()),
            taskCommentCreated: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const body = c.req.valid("json");

      const existing = await db.query.integrationTable.findFirst({
        where: and(
          eq(integrationTable.boardId, boardId),
          eq(integrationTable.type, "slack"),
        ),
      });

      if (!existing) {
        throw new HTTPException(404, {
          message: "Slack integration not found",
        });
      }

      const currentConfig = normalizeSlackConfig(
        JSON.parse(existing.config) as SlackConfig,
      );
      const nextConfig = normalizeSlackConfig({
        webhookUrl: body.webhookUrl?.trim() || currentConfig.webhookUrl,
        channelName:
          body.channelName === undefined
            ? currentConfig.channelName
            : (body.channelName ?? undefined),
        events: {
          ...(currentConfig.events ?? {}),
          ...(body.events ?? {}),
        },
      });

      const validation = await validateSlackConfig(nextConfig);
      if (!validation.valid) {
        throw new HTTPException(400, {
          message: validation.errors?.join(", ") ?? "Invalid config",
        });
      }

      await db
        .update(integrationTable)
        .set({
          config: JSON.stringify(nextConfig),
          isActive:
            body.isActive !== undefined
              ? body.isActive
              : (existing.isActive ?? true),
          updatedAt: new Date(),
        })
        .where(eq(integrationTable.id, existing.id));

      const integration = await getSlackIntegration(boardId);
      return c.json(integration);
    },
  )
  .delete(
    "/board/:boardId",
    describeRoute({
      operationId: "deleteSlackIntegration",
      tags: ["Slack"],
      description: "Delete Slack integration for a board",
      responses: {
        200: {
          description: "Slack integration deleted successfully",
          content: {
            "application/json": {
              schema: resolver(v.object({ success: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");

      const existing = await db.query.integrationTable.findFirst({
        where: and(
          eq(integrationTable.boardId, boardId),
          eq(integrationTable.type, "slack"),
        ),
      });

      if (!existing) {
        throw new HTTPException(404, {
          message: "Slack integration not found",
        });
      }

      await db
        .delete(integrationTable)
        .where(eq(integrationTable.id, existing.id));
      return c.json({ success: true });
    },
  );

export default slackIntegration;
