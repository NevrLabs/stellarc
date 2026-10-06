import "./instrument";

import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { upgradeWebSocket as bunUpgradeWebSocket } from "hono/bun";
import * as Sentry from "@sentry/node";
import type { Session, User } from "better-auth/types";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import {
  describeRoute,
  openAPIRouteHandler,
  resolver,
  validator,
} from "hono-openapi";
import * as v from "valibot";
import accountAuthentication from "./account-authentication";
import activity from "./activity";
import admin from "./admin";
import agent from "./agent";
import ai from "./ai";
import { auth } from "./auth";
import board from "./board";
import { getPublicBoard } from "./board/controllers/get-public-board";
import column from "./column";
import comment from "./comment";
import config from "./config";
import dataTable from "./data-table";
import db, { getDatabase, schema } from "./database";
import { prepareDatabaseStartup } from "./database/prepare-database-startup";
import { waitForDatabase } from "./database/wait-for-database";
import discordIntegration from "./discord-integration";
import { eventContext } from "./events";
import externalLink from "./external-link";
import flag from "./flag";
import genericWebhookIntegration from "./generic-webhook-integration";
import { handleGiteaWebhookRoute } from "./gitea-integration";
import githubDelegation, {
  handleGitHubDelegationCallback,
} from "./github-delegation";
import githubIntegration, {
  handleGithubWebhookRoute,
} from "./github-integration";
import getInstanceStatus from "./instance/controllers/get-instance-status";
import invitation from "./invitation";
import label from "./label";
import mcpRoutes, { mcpWellKnownRoutes } from "./mcp";
import { migrateColumns } from "./migrations/column-migration";
import milestone from "./milestone";
import notification from "./notification";
import notificationPreferences from "./notification-preferences";
import oauth from "./oauth";
import oidcTeamSync from "./oidc-team-sync";
import organization from "./organization";
import organizationGithub from "./organization-github";
import { handleOrganizationGithubInstallCallback } from "./organization-github/install-callback";
import { initializePlugins } from "./plugins";
import project from "./project";
import repo from "./repo";
import { getResourcePrivilege, privilegeAllows } from "./resource-access";
import resourceGrant from "./resource-grant";
import { initializeScheduler, shutdownScheduler } from "./scheduler";
import search from "./search";
import slackIntegration from "./slack-integration";
import { getPrivateObject } from "./storage/s3";
import task from "./task";
import getPublicTicketEmbed from "./task/controllers/get-public-ticket-embed";
import taskRelation from "./task-relation";
import taskTemplate from "./task-template";
import team from "./team";
import telegramIntegration from "./telegram-integration";
import timeEntry from "./time-entry";
import user from "./user";
import getAvatar from "./user/controllers/get-avatar";
import {
  authenticateApiRequest,
  resolveAssetBearerOrCookie,
} from "./utils/authenticate-api-request";
import { getInvitationDetails } from "./utils/check-registration-allowed";
import { migrateApiKeyReferenceId } from "./utils/migrate-apikey-reference-id";
import { migrateNotificationPreferencesSchema } from "./utils/migrate-notification-preferences-schema";
import { migrateOrganizationUserEmail } from "./utils/migrate-organization-user-email";
import { migrateSessionColumn } from "./utils/migrate-session-column";
import {
  dedupeOperationIds,
  ensureOperationSummaries,
  markOptionalSchemaFieldsNullable,
  mergeOpenApiSpecs,
  normalizeApiServerUrl,
  normalizeEmptyAndEnumSchemas,
  normalizeEmptyRequiredArrays,
  normalizeMalformedPropertySchemas,
  normalizeNullableSchemasForOpenApi30,
  normalizeOrganizationAuthOperations,
} from "./utils/openapi-spec";
import { seedDefaultOrganizationRoles } from "./utils/seed-default-organization-roles";
import { validateOrganizationAccess } from "./utils/validate-organization-access";
import workflowRule from "./workflow-rule";
import {
  addConnection,
  addUserConnection,
  initializeWebSocketAdapter,
  removeConnection,
  removeUserConnection,
  shutdownWebSocketAdapter,
} from "./ws";
import { registerProjectSyncBroadcast } from "./ws/project-sync-broadcast";
import { registerRepoSyncBroadcast } from "./ws/repo-sync-broadcast";

type ApiKey = {
  id: string;
  userId: string;
  enabled: boolean;
  permissions: Record<string, string[]> | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
};

type AppVariables = {
  Variables: {
    user: User | null;
    session: Session | null;
    userId: string;
    apiKey?: ApiKey;
  };
};

type ApiVariables = {
  Variables: {
    user: User | null;
    session: Session | null;
    userId: string;
    userEmail: string;
    apiKey?: ApiKey;
  };
};

const SAFE_INLINE_ASSET_TYPES = new Set([
  "image/apng",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function buildContentDisposition(filename: string, inline: boolean) {
  const normalized = filename
    .normalize("NFC")
    .replace(/[\r\n"]/g, "")
    .trim();
  const safeFilename = normalized || "file";
  const asciiFallback =
    safeFilename
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/]/g, "-")
      .replace(/[^\x20-\u7E]+/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "file";
  const encodedFilename = encodeURIComponent(safeFilename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  const disposition = inline ? "inline" : "attachment";
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

export function createApp() {
  const app = new Hono<AppVariables>();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      // expected errors (401/404/...) are not reported; real failures are
      if (err.status >= 500) {
        Sentry.captureException(err);
      }
      return err.getResponse();
    }

    console.error("[unhandled error]", err);
    Sentry.captureException(err);
    return c.json(
      {
        message: "Internal Server Error",
        error: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  });
  const nodeWs = createNodeWebSocket({ app });
  const { injectWebSocket } = nodeWs;
  // Under Bun (stellarc runtime) upgrades go through Bun.serve's native
  // websocket handler; the node-ws adapter only works with node:http.
  const upgradeWebSocket = (
    typeof Bun !== "undefined" ? bunUpgradeWebSocket : nodeWs.upgradeWebSocket
  ) as typeof nodeWs.upgradeWebSocket;
  const corsOriginSource = [
    process.env.CORS_ORIGINS,
    process.env.KANEO_CLIENT_URL,
  ].find((value) => value?.trim());
  const corsOrigins = corsOriginSource
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const reflectUnconfiguredOrigins = process.env.NODE_ENV !== "production";

  if (!corsOrigins && !reflectUnconfiguredOrigins) {
    console.warn(
      "[cors] Neither CORS_ORIGINS nor KANEO_CLIENT_URL is set, so cross-origin requests are refused. Same-origin deployments (the bundled image) are unaffected; set KANEO_CLIENT_URL if the web app is served from another origin.",
    );
  }

  app.use(
    "*",
    cors({
      credentials: true,
      origin: (origin) => {
        // Reflecting an arbitrary origin alongside credentials lets any site
        // read authenticated responses, so it stays a development convenience.
        if (!corsOrigins) {
          return reflectUnconfiguredOrigins ? origin || "*" : null;
        }

        if (!origin) {
          return null;
        }

        return corsOrigins.includes(origin) ? origin : null;
      },
    }),
  );

  const api = new Hono<ApiVariables>();

  api.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  api.get(
    "/instance/status",
    describeRoute({
      operationId: "getInstanceStatus",
      tags: ["Instance"],
      description:
        "Public instance setup status. When hasUsers is false the next signup becomes the instance admin.",
      security: [],
      responses: {
        200: {
          description: "Instance status",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  hasUsers: v.boolean(),
                  hasAdmin: v.boolean(),
                }),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const status = await getInstanceStatus();
      return c.json(status);
    },
  );

  const publicBoardApi = api.get("/public-board/:id", async (c) => {
    const { id } = c.req.param();
    const board = await getPublicBoard(id);

    return c.json(board);
  });

  /*
    KFL-177: minimal public ticket embed for Teams/Discord/Telegram/Outline.
    Registered here, alongside the other public routes and BEFORE the auth
    middleware, because an embed is fetched by a third-party site with no
    Kaneo session. Returns only ticket key, title and organization name; the
    controller 404s (never 403s) on a private board so the endpoint cannot be
    used to probe which ticket ids exist.
  */
  const publicTicketEmbedApi = api.get(
    "/public-ticket-embed/:id",
    async (c) => {
      const { id } = c.req.param();
      const ticket = await getPublicTicketEmbed(id);

      return c.json(ticket);
    },
  );

  api.post("/repo/webhook/github", handleGithubWebhookRoute);
  // GitHub returns here as a browser navigation, before API auth middleware.
  // The handler revalidates the initiating Better Auth session and OAuth state.
  api.get("/github-delegation/callback", handleGitHubDelegationCallback);
  api.get(
    "/organization-github/install-callback",
    handleOrganizationGithubInstallCallback,
  );

  api.post("/repo/webhook/gitea", handleGiteaWebhookRoute);

  const invitationPublicApi = api.get("/invitation/public/:id", async (c) => {
    const { id } = c.req.param();
    const result = await getInvitationDetails(id);
    return c.json(result);
  });

  api.get(
    "/auth/get-session",
    describeRoute({
      operationId: "getSession",
      tags: ["Authentication"],
      description: "Get the current authenticated session",
      security: [],
      responses: {
        200: {
          description: "Current session details or null when unauthenticated",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    async (c) => {
      return auth.handler(c.req.raw);
    },
  );

  api.get(
    "/asset/:id",
    describeRoute({
      operationId: "getAsset",
      tags: ["Assets"],
      description: "Download an uploaded asset by ID",
      security: [],
      responses: {
        200: {
          description: "The requested asset binary stream",
          content: {
            "*/*": { schema: { type: "string", format: "binary" } },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    async (c) => {
      const { id } = c.req.param();
      const [asset] = await db
        .select({
          id: schema.assetTable.id,
          objectKey: schema.assetTable.objectKey,
          mimeType: schema.assetTable.mimeType,
          filename: schema.assetTable.filename,
          organizationId: schema.assetTable.organizationId,
          boardId: schema.assetTable.boardId,
          repoId: schema.assetTable.repoId,
          isPublic: schema.boardTable.isPublic,
        })
        .from(schema.assetTable)
        .leftJoin(
          schema.boardTable,
          eq(schema.assetTable.boardId, schema.boardTable.id),
        )
        .where(eq(schema.assetTable.id, id))
        .limit(1);

      if (!asset) {
        throw new HTTPException(404, { message: "Asset not found" });
      }

      let userId = "";
      let apiKeyId: string | undefined;
      try {
        ({ userId, apiKeyId } = await resolveAssetBearerOrCookie(c));
      } catch (error) {
        if (!asset.repoId) throw error;
        // Repo media must be fetchable by GitHub's image proxy. The asset ID is
        // unguessable and the owning repo/organization still controls deletion.
      }

      if (userId) {
        await validateOrganizationAccess(
          userId,
          asset.organizationId,
          apiKeyId,
        );
        if (asset.boardId) {
          const privilege = await getResourcePrivilege({
            organizationId: asset.organizationId,
            resourceType: "board",
            resourceId: asset.boardId,
            userId,
          });
          if (!privilegeAllows(privilege, "view")) {
            throw new HTTPException(404, { message: "Asset not found" });
          }
        } else if (!asset.repoId) {
          throw new HTTPException(404, { message: "Asset not found" });
        }
      } else if (!asset.repoId && !asset.isPublic) {
        // Repository media is deliberately public-by-unguessable-URL so GitHub
        // can render it in issue/PR Markdown. Task assets retain board privacy.
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      try {
        const object = await getPrivateObject(asset.objectKey);
        const storedContentType =
          (object.contentType || asset.mimeType)
            .toLowerCase()
            .split(";")[0]
            ?.trim() ?? "";
        const inline = SAFE_INLINE_ASSET_TYPES.has(storedContentType);

        return new Response(object.body as BodyInit, {
          headers: {
            "Cache-Control": asset.isPublic
              ? "public, max-age=300"
              : "private, max-age=120",
            "Content-Disposition": buildContentDisposition(
              asset.filename,
              inline,
            ),
            "Content-Length": object.contentLength?.toString() || "",
            "Content-Type": inline
              ? storedContentType
              : "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
            ETag: object.etag || "",
            "Last-Modified": object.lastModified?.toUTCString() || "",
          },
        });
      } catch (error) {
        console.error("Failed to stream asset:", error);
        throw new HTTPException(404, { message: "Asset object not found" });
      }
    },
  );

  api.get(
    "/user/avatar/:id",
    describeRoute({
      operationId: "getUserAvatar",
      tags: ["User"],
      description: "Download a user avatar by its avatar ID",
      security: [],
      responses: {
        200: {
          description: "The avatar image",
          content: {
            "image/*": { schema: { type: "string", format: "binary" } },
          },
        },
        404: {
          description: "Avatar not found",
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const avatar = await getAvatar(id);

      if (!avatar) {
        throw new HTTPException(404, { message: "Avatar not found" });
      }

      const etag = `"${avatar.id}"`;
      if (c.req.header("If-None-Match") === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag } });
      }

      return new Response(new Uint8Array(avatar.data) as BodyInit, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Length": avatar.size.toString(),
          "Content-Type": avatar.mimeType,
          "X-Content-Type-Options": "nosniff",
          ETag: etag,
          "Last-Modified": avatar.updatedAt.toUTCString(),
        },
      });
    },
  );

  const configApi = api.route("/config", config);

  const honoOpenApiHandler = openAPIRouteHandler(api, {
    documentation: {
      openapi: "3.0.3",
      info: {
        title: "Kaneo API",
        version: "1.0.0",
        description:
          "Kaneo Board Management API - Manage boards, tasks, labels, and more",
      },
      servers: [
        {
          url: normalizeApiServerUrl(
            process.env.KANEO_API_URL || "https://cloud.kaneo.app",
          ),
          description: "Kaneo API Server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "API key or session token (Bearer)",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  api.get("/openapi", async (c) => {
    const maybeResponse = await honoOpenApiHandler(c, async () => {});
    const honoSpecResponse = maybeResponse ?? c.res;
    const honoSpec = (await honoSpecResponse.json()) as Record<string, unknown>;

    let authSpec: Record<string, unknown> = {};
    try {
      authSpec = (await auth.api.generateOpenAPISchema()) as Record<
        string,
        unknown
      >;
    } catch (error) {
      console.error("Failed to generate Better Auth OpenAPI schema:", error);
    }

    const normalizedAuthSpec = normalizeOrganizationAuthOperations(authSpec);
    return c.json(
      ensureOperationSummaries(
        dedupeOperationIds(
          markOptionalSchemaFieldsNullable(
            normalizeNullableSchemasForOpenApi30(
              normalizeEmptyAndEnumSchemas(
                normalizeEmptyRequiredArrays(
                  normalizeMalformedPropertySchemas(
                    mergeOpenApiSpecs(honoSpec, normalizedAuthSpec),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  });

  // Better Auth serves GET /auth/device as JSON. Browsers that open the API URL
  // directly expect a page — redirect full document navigations to the web app.
  const authDeviceQuerySchema = v.object({
    user_code: v.optional(v.string()),
    ui: v.optional(v.picklist(["1"])),
  });

  api.get(
    "/auth/device",
    describeRoute({
      operationId: "getDeviceAuthorizationPage",
      tags: ["Authentication"],
      description:
        "Redirect browser-based device authorization requests to the web UI",
      security: [],
      parameters: [
        {
          name: "user_code",
          in: "query",
          required: false,
          schema: {
            type: "string",
          },
          description: "The device authorization user code.",
        },
        {
          name: "ui",
          in: "query",
          required: false,
          schema: {
            type: "string",
            enum: ["1"],
          },
          description: "Force a redirect to the web UI.",
        },
      ],
      responses: {
        302: {
          description: "Redirects the browser to the web app device screen",
        },
        200: {
          description: "Device authorization payload from Better Auth",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("query", authDeviceQuerySchema),
    async (c) => {
      const { user_code: userCode, ui } = c.req.valid("query");
      const secFetchDest = c.req.header("Sec-Fetch-Dest");
      const forceUiRedirect = ui === "1";
      // Top-level browser tab / address bar (not `fetch()` / XHR from the SPA).
      // Optional `ui=1` forces redirect when Sec-Fetch-* headers are missing (e.g. some clients).
      if (forceUiRedirect || secFetchDest === "document") {
        const clientUrl = (
          process.env.KANEO_CLIENT_URL || "http://localhost:5173"
        ).replace(/\/$/, "");
        const deviceUrl = new URL(`${clientUrl}/device`);
        if (userCode) {
          deviceUrl.searchParams.set("user_code", userCode);
        }
        return c.redirect(deviceUrl.toString(), 302);
      }
      return auth.handler(c.req.raw);
    },
  );

  api.on(["POST", "GET", "PUT", "DELETE"], "/auth/*", async (c) => {
    const authHeader = c.req.header("Authorization");
    const apiKeyHeader = c.req.header("x-api-key");
    const bearerMatch = authHeader?.match(/^Bearer\s+(\S+)$/i);

    if (bearerMatch && !apiKeyHeader) {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      // Preserve Better Auth bearer session tokens on auth routes.
      if (session?.session && session.user) {
        return auth.handler(c.req.raw);
      }

      const headers = new Headers(c.req.raw.headers);

      // Better Auth API key plugin validates from x-api-key by default.
      headers.set("x-api-key", bearerMatch[1]);

      return auth.handler(
        new Request(c.req.raw, {
          headers,
        }),
      );
    }

    return auth.handler(c.req.raw);
  });

  api.route("/", mcpRoutes);

  api.use("*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/api/mcp") || path.startsWith("/api/.well-known/")) {
      return next();
    }
    try {
      await authenticateApiRequest(c);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error("API authentication failed:", error);
      throw new HTTPException(500, { message: "Internal Server Error" });
    }

    const windowId = c.req.header("X-Kaneo-Window-Id");
    const userId = c.get("userId");
    const apiKey = c.get("apiKey");
    const initiatorId =
      apiKey?.metadata?.type === "agent"
        ? `agent:${apiKey.id}`
        : windowId
          ? `${userId}:${windowId}`
          : userId;

    return eventContext.run({ initiatorId }, next);
  });

  const oauthApi = api.route("/oauth", oauth);
  const accountAuthenticationApi = api.route(
    "/account-authentication",
    accountAuthentication,
  );
  const adminApi = api.route("/admin", admin);
  const githubDelegationApi = api.route("/github-delegation", githubDelegation);
  const githubIntegrationApi = api.route(
    "/github-integration",
    githubIntegration,
  );

  const boardApi = api.route("/board", board);
  const projectApi = api.route("/project", project);
  const taskApi = api.route("/task", task);
  const repoApi = api.route("/repo", repo);
  const resourceGrantApi = api.route("/resource-grant", resourceGrant);
  const oidcTeamSyncApi = api.route("/oidc-team-sync", oidcTeamSync);
  const teamApi = api.route("/team", team);
  const columnApi = api.route("/column", column);
  const activityApi = api.route("/activity", activity);
  const aiApi = api.route("/ai", ai);
  const commentApi = api.route("/comment", comment);
  const dataTableApi = api.route("/data-table", dataTable);
  const timeEntryApi = api.route("/time-entry", timeEntry);
  const userApi = api.route("/user", user);
  const flagApi = api.route("/flag", flag);
  const labelApi = api.route("/label", label);
  const milestoneApi = api.route("/milestone", milestone);
  const taskTemplateApi = api.route("/task-template", taskTemplate);
  const notificationApi = api.route("/notification", notification);
  const notificationPreferencesApi = api.route(
    "/notification-preferences",
    notificationPreferences,
  );
  const searchApi = api.route("/search", search);
  const genericWebhookIntegrationApi = api.route(
    "/generic-webhook-integration",
    genericWebhookIntegration,
  );
  const discordIntegrationApi = api.route(
    "/discord-integration",
    discordIntegration,
  );
  const slackIntegrationApi = api.route("/slack-integration", slackIntegration);
  const telegramIntegrationApi = api.route(
    "/telegram-integration",
    telegramIntegration,
  );
  const taskRelationApi = api.route("/task-relation", taskRelation);
  const externalLinkApi = api.route("/external-link", externalLink);
  const workflowRuleApi = api.route("/workflow-rule", workflowRule);
  const invitationApi = api.route("/invitation", invitation);
  const organizationApi = api.route("/organization", organization);
  const agentApi = api.route("/agent", agent);
  const organizationGithubApi = api.route(
    "/organization-github",
    organizationGithub,
  );

  app.route(
    "/",
    mcpWellKnownRoutes(
      (process.env.KANEO_API_URL || "http://localhost:1337").replace(
        /\/api\/?$/,
        "",
      ),
    ),
  );

  // User-scoped WebSocket endpoint — MUST be registered before /ws/:boardId
  // so the literal path "user" isn't consumed by the param route.
  api.get(
    "/ws/user",
    upgradeWebSocket(async (c) => {
      try {
        await authenticateApiRequest(c);
      } catch (error) {
        if (error instanceof HTTPException) {
          // Never log cookie values. Presence and names establish whether the
          // browser's authenticated upgrade reached the API with cookies at all.
          const cookieNames = (c.req.header("cookie") ?? "")
            .split(";")
            .map((part) => part.trim().split("=", 1)[0])
            .filter(Boolean);
          console.warn("WebSocket user auth rejected", {
            hasCookie: cookieNames.length > 0,
            cookieNames,
            origin: c.req.header("origin") ?? null,
            host: c.req.header("host") ?? null,
          });
          throw error;
        }
        console.error("API authentication failed:", error);
        throw new HTTPException(500, { message: "Internal Server Error" });
      }

      const userId = c.get("userId");
      let conn: ReturnType<typeof addUserConnection> | null = null;

      return {
        onOpen(_evt, ws) {
          if (userId) {
            conn = addUserConnection(userId, ws);
          }
        },
        onMessage(evt) {
          try {
            const raw =
              typeof evt.data === "string"
                ? evt.data
                : Buffer.isBuffer(evt.data)
                  ? evt.data.toString()
                  : null;
            if (raw) {
              const msg = JSON.parse(raw) as { type?: string };
              if (msg?.type === "ping") {
                // keepalive — no-op
              }
            }
          } catch {
            // Ignore malformed messages
          }
        },
        onClose() {
          if (conn && userId) {
            removeUserConnection(userId, conn);
          }
        },
      };
    }),
  );

  api.get(
    "/ws/:boardId",
    upgradeWebSocket(async (c) => {
      const boardId = c.req.param("boardId");

      try {
        await authenticateApiRequest(c);
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        console.error("API authentication failed:", error);
        throw new HTTPException(500, { message: "Internal Server Error" });
      }

      const userId = c.get("userId");

      if (boardId) {
        const [board] = await db
          .select({ organizationId: schema.boardTable.organizationId })
          .from(schema.boardTable)
          .where(eq(schema.boardTable.id, boardId))
          .limit(1);

        if (!board) {
          throw new HTTPException(401, { message: "Unauthorized" });
        }

        await validateOrganizationAccess(userId, board.organizationId);
        const privilege = await getResourcePrivilege({
          organizationId: board.organizationId,
          resourceType: "board",
          resourceId: boardId,
          userId,
        });
        if (!privilegeAllows(privilege, "view")) {
          throw new HTTPException(404, { message: "Board not found" });
        }
      }

      const windowId = c.req.query("windowId");
      const initiatorId = windowId ? `${userId}:${windowId}` : userId;
      let conn: ReturnType<typeof addConnection> | null = null;

      return {
        onOpen(_evt, ws) {
          if (boardId) {
            conn = addConnection(boardId, ws, userId, initiatorId);
          }
        },
        onMessage(evt) {
          // Respond to client keepalive pings (sent every 30s to prevent
          // Cloudflare from closing idle connections at 100s timeout)
          try {
            const raw =
              typeof evt.data === "string"
                ? evt.data
                : Buffer.isBuffer(evt.data)
                  ? evt.data.toString()
                  : null;
            if (raw) {
              const msg = JSON.parse(raw) as { type?: string };
              if (msg?.type === "ping") {
                // No-op: receiving the ping is enough to satisfy Cloudflare.
                // A pong response is optional but helps confirm liveness.
              }
            }
          } catch {
            // Ignore malformed messages
          }
        },
        onClose() {
          if (conn && boardId) {
            removeConnection(boardId, conn);
          }
        },
      };
    }),
  );

  app.route("/api", api);

  return {
    app,
    api,
    injectWebSocket,
    activityApi,
    columnApi,
    commentApi,
    dataTableApi,
    configApi,
    discordIntegrationApi,
    externalLinkApi,
    genericWebhookIntegrationApi,
    invitationApi,
    invitationPublicApi,
    flagApi,
    labelApi,
    milestoneApi,
    taskTemplateApi,
    notificationApi,
    notificationPreferencesApi,
    boardApi,
    projectApi,
    publicBoardApi,
    publicTicketEmbedApi,
    repoApi,
    resourceGrantApi,
    searchApi,
    slackIntegrationApi,
    taskApi,
    taskRelationApi,
    telegramIntegrationApi,
    timeEntryApi,
    userApi,
    workflowRuleApi,
    organizationApi,
    organizationGithubApi,
    githubDelegationApi,
    accountAuthenticationApi,
    oauthApi,
  };
}

export async function runStartupTasks() {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  await prepareDatabaseStartup({
    waitForDatabase: async () => {
      await waitForDatabase({
        query: async () => {
          await getDatabase().execute(sql`SELECT 1`);
        },
      });
    },
    runStartupMigrations: async () => {
      await migrateOrganizationUserEmail();
      await migrateSessionColumn();

      console.log("🔄 Migrating database...");
      await migrate(getDatabase(), {
        migrationsFolder: `${currentDir}/../drizzle`,
      });
      console.log("✅ Database migrated successfully!");
    },
  });

  // After Drizzle migrations: apikey table must exist so we can align columns
  // with Better Auth (reference_id + nullable user_id).
  await migrateApiKeyReferenceId();

  await migrateNotificationPreferencesSchema();
  // GitHub/Gitea are first-class Repos now; never recreate legacy board/task
  // integrations during startup.
  await migrateColumns();
  await seedDefaultOrganizationRoles();

  initializePlugins();
  initializeScheduler();
  await initializeWebSocketAdapter();
  await registerRepoSyncBroadcast();
  await registerProjectSyncBroadcast();
}

export async function startServer(
  injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"],
  port = 1337,
) {
  try {
    await runStartupTasks();
  } catch (error) {
    console.error("❌ Database migration failed!", error);
    process.exit(1);
  }

  let shuttingDown = false;

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    () => {
      console.log(
        `⚡ API is running at ${process.env.KANEO_API_URL || "http://localhost:1337"}`,
      );
    },
  );

  injectWebSocket(server);

  const gracefulShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("🛑 Shutting down gracefully...");
    shutdownScheduler();
    await shutdownWebSocketAdapter();
    server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void gracefulShutdown();
  });

  process.on("SIGINT", () => {
    void gracefulShutdown();
  });
}

const createdApp = createApp();
const {
  app,
  injectWebSocket,
  activityApi,
  agentApi,
  aiApi,
  columnApi,
  commentApi,
  dataTableApi,
  configApi,
  discordIntegrationApi,
  externalLinkApi,
  genericWebhookIntegrationApi,
  invitationApi,
  invitationPublicApi,
  flagApi,
  labelApi,
  milestoneApi,
  notificationApi,
  notificationPreferencesApi,
  boardApi,
  projectApi,
  publicBoardApi,
  repoApi,
  resourceGrantApi,
  searchApi,
  slackIntegrationApi,
  taskApi,
  taskRelationApi,
  telegramIntegrationApi,
  timeEntryApi,
  userApi,
  workflowRuleApi,
  organizationApi,
  oauthApi,
} = createdApp;

const isMainModule =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  void startServer(injectWebSocket);
}

export type AppType =
  | typeof agentApi
  | typeof configApi
  | typeof boardApi
  | typeof projectApi
  | typeof taskApi
  | typeof repoApi
  | typeof columnApi
  | typeof activityApi
  | typeof aiApi
  | typeof commentApi
  | typeof dataTableApi
  | typeof timeEntryApi
  | typeof flagApi
  | typeof labelApi
  | typeof milestoneApi
  | typeof notificationApi
  | typeof notificationPreferencesApi
  | typeof searchApi
  | typeof genericWebhookIntegrationApi
  | typeof discordIntegrationApi
  | typeof slackIntegrationApi
  | typeof telegramIntegrationApi
  | typeof taskRelationApi
  | typeof externalLinkApi
  | typeof workflowRuleApi
  | typeof invitationApi
  | typeof organizationApi
  | typeof publicBoardApi
  | typeof invitationPublicApi
  | typeof oauthApi;

export default app;
