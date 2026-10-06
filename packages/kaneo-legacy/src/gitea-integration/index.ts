import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { boardTable, integrationTable } from "../database/schema";
import { type GiteaConfig, validateGiteaConfig } from "../plugins/gitea/config";
import { handleGiteaWebhookRequest } from "../plugins/gitea/webhook-handler";
import { giteaIntegrationSchema } from "../schemas";
import {
  organizationAccess,
  organizationAccessMiddleware,
} from "../utils/organization-access-middleware";
import {
  hasOrganizationPermission,
  requireOrganizationPermission,
} from "../utils/require-organization-permission";
import { validateOrganizationAccess } from "../utils/validate-organization-access";
import createGiteaIntegration from "./controllers/create-gitea-integration";
import deleteGiteaIntegration from "./controllers/delete-gitea-integration";
import getGiteaIntegration from "./controllers/get-gitea-integration";
import { importGiteaIssues } from "./controllers/import-gitea-issues";
import listGiteaRepositories from "./controllers/list-gitea-repositories";
import verifyGiteaAccess from "./controllers/verify-gitea-access";

const giteaRepositorySchema = v.object({
  id: v.number(),
  name: v.string(),
  full_name: v.string(),
  owner: v.object({
    login: v.string(),
  }),
  private: v.boolean(),
  html_url: v.string(),
});

const verificationResultSchema = v.object({
  isInstalled: v.boolean(),
  hasRequiredPermissions: v.boolean(),
  repositoryExists: v.boolean(),
  repositoryPrivate: v.nullable(v.boolean()),
  missingPermissions: v.array(v.string()),
  message: v.string(),
  failureReason: v.nullable(
    v.picklist(["not_a_gitea_instance", "redirected", "repository_not_found"]),
  ),
});

const importResultSchema = v.object({
  imported: v.number(),
  updated: v.number(),
  skipped: v.number(),
  errors: v.optional(v.array(v.string())),
});

const nullableGiteaIntegrationSchema = v.nullable(giteaIntegrationSchema);

const giteaIntegration = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
    apiKey?: {
      id: string;
      userId: string;
      enabled: boolean;
    };
  };
}>()
  .post(
    "/repositories",
    describeRoute({
      operationId: "listGiteaRepositories",
      tags: ["Gitea"],
      description: "List repositories accessible with a Gitea token",
      responses: {
        200: {
          description: "Repositories",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  repositories: v.array(giteaRepositorySchema),
                }),
              ),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        baseUrl: v.pipe(v.string(), v.url()),
        accessToken: v.pipe(v.string(), v.minLength(1)),
      }),
    ),
    async (c) => {
      const { baseUrl, accessToken } = c.req.valid("json");
      const result = await listGiteaRepositories({ baseUrl, accessToken });
      return c.json(result);
    },
  )
  .post(
    "/verify",
    describeRoute({
      operationId: "verifyGiteaAccess",
      tags: ["Gitea"],
      description: "Verify Gitea token and repository access",
      responses: {
        200: {
          description: "Verification result",
          content: {
            "application/json": {
              schema: resolver(verificationResultSchema),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        baseUrl: v.pipe(v.string(), v.url()),
        accessToken: v.pipe(v.string(), v.minLength(1)),
        repositoryOwner: v.pipe(v.string(), v.minLength(1)),
        repositoryName: v.pipe(v.string(), v.minLength(1)),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const result = await verifyGiteaAccess(body);
      return c.json(result);
    },
  )
  .get(
    "/board/:boardId",
    describeRoute({
      operationId: "getGiteaIntegration",
      tags: ["Gitea"],
      description: "Get Gitea integration for a board",
      responses: {
        200: {
          description: "Gitea integration details",
          content: {
            "application/json": {
              schema: resolver(nullableGiteaIntegrationSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    organizationAccessMiddleware({
      sources: [{ type: "lookup", resource: "board", idKey: "boardId" }],
    }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const includeWebhookSecret = await hasOrganizationPermission(c, {
        organization: ["manage_settings"],
      });
      const integration = await getGiteaIntegration(
        boardId,
        includeWebhookSecret,
      );
      if (!integration) {
        return c.json(null, 200);
      }
      return c.json(integration);
    },
  )
  .post(
    "/board/:boardId",
    describeRoute({
      operationId: "createGiteaIntegration",
      tags: ["Gitea"],
      description: "Create or update Gitea integration for a board",
      responses: {
        200: {
          description: "Integration saved",
          content: {
            "application/json": {
              schema: resolver(giteaIntegrationSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "json",
      v.object({
        baseUrl: v.pipe(v.string(), v.url()),
        accessToken: v.optional(v.string()),
        repositoryOwner: v.pipe(v.string(), v.minLength(1)),
        repositoryName: v.pipe(v.string(), v.minLength(1)),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const body = c.req.valid("json");
      await createGiteaIntegration({
        boardId,
        baseUrl: body.baseUrl,
        accessToken: body.accessToken,
        repositoryOwner: body.repositoryOwner,
        repositoryName: body.repositoryName,
      });
      const integration = await getGiteaIntegration(boardId, true);
      if (!integration) {
        throw new HTTPException(500, { message: "Failed to load integration" });
      }
      return c.json(integration);
    },
  )
  .patch(
    "/board/:boardId",
    describeRoute({
      operationId: "updateGiteaIntegration",
      tags: ["Gitea"],
      description: "Update Gitea integration settings",
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: resolver(giteaIntegrationSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ boardId: v.string() })),
    validator(
      "json",
      v.object({
        isActive: v.optional(v.boolean()),
        commentTaskLinkOnGiteaIssue: v.optional(v.boolean()),
      }),
    ),
    organizationAccess.fromBoard("boardId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const body = c.req.valid("json");

      const row = await db.query.integrationTable.findFirst({
        where: and(
          eq(integrationTable.boardId, boardId),
          eq(integrationTable.type, "gitea"),
        ),
      });

      if (!row) {
        return c.json({ error: "Integration not found" }, 404);
      }

      let config: GiteaConfig;
      try {
        config = JSON.parse(row.config) as GiteaConfig;
      } catch {
        throw new HTTPException(500, { message: "Invalid integration config" });
      }

      if (body.commentTaskLinkOnGiteaIssue !== undefined) {
        config = {
          ...config,
          commentTaskLinkOnGiteaIssue: body.commentTaskLinkOnGiteaIssue,
        };
      }

      const validation = await validateGiteaConfig(config);
      if (!validation.valid) {
        throw new HTTPException(400, {
          message: validation.errors?.join(", ") ?? "Invalid config",
        });
      }

      await db
        .update(integrationTable)
        .set({
          config: JSON.stringify(config),
          isActive:
            body.isActive !== undefined
              ? body.isActive
              : (row.isActive ?? true),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrationTable.boardId, boardId),
            eq(integrationTable.type, "gitea"),
          ),
        );

      const updated = await getGiteaIntegration(boardId, true);
      if (!updated) {
        throw new HTTPException(500, { message: "Failed to load integration" });
      }
      return c.json(updated, 200);
    },
  )
  .delete(
    "/board/:boardId",
    describeRoute({
      operationId: "deleteGiteaIntegration",
      tags: ["Gitea"],
      description: "Delete Gitea integration for a board",
      responses: {
        200: {
          description: "Deleted",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  success: v.boolean(),
                  message: v.string(),
                }),
              ),
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
      const result = await deleteGiteaIntegration(boardId);
      return c.json(result);
    },
  )
  .post(
    "/import-issues",
    describeRoute({
      operationId: "importGiteaIssues",
      tags: ["Gitea"],
      description: "Import Gitea issues as tasks",
      responses: {
        200: {
          description: "Import result",
          content: {
            "application/json": {
              schema: resolver(importResultSchema),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        boardId: v.string(),
      }),
    ),
    async (c, next) => {
      const userId = c.get("userId");
      if (!userId) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const { boardId } = c.req.valid("json");

      const [board] = await db
        .select({ organizationId: boardTable.organizationId })
        .from(boardTable)
        .where(eq(boardTable.id, boardId))
        .limit(1);

      if (!board) {
        throw new HTTPException(404, { message: "Board not found" });
      }

      const apiKey = c.get("apiKey");
      const apiKeyId = apiKey?.id;

      await validateOrganizationAccess(userId, board.organizationId, apiKeyId);
      c.set("organizationId", board.organizationId);

      return next();
    },
    requireOrganizationPermission({ task: ["create"] }),
    async (c) => {
      const { boardId } = c.req.valid("json");
      const result = await importGiteaIssues(boardId);
      return c.json(result);
    },
  );

/** First-class Repo Gitea webhook: identify the repo from its signed payload. */
export async function handleGiteaWebhookRoute(c: Context) {
  const arrayBuffer = await c.req.arrayBuffer();
  const body = Buffer.from(arrayBuffer).toString("utf8");
  const signature =
    c.req.header("x-gitea-signature") || c.req.header("X-Gitea-Signature");
  const result = await handleGiteaWebhookRequest(body, signature);

  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ status: "success" });
}

export default giteaIntegration;
