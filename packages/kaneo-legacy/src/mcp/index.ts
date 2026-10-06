import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { auth } from "../auth";
import { verifyApiKey } from "../utils/verify-api-key";
import {
  beginMcpAuthorization,
  decideMcpAuthorizationRequest,
  getMcpAuthorizationRequest,
  registerMcpClient,
} from "./controllers/oauth-consent";
import { exchangeCode } from "./oauth";
import {
  authorizationDecisionResponseSchema,
  authorizationDecisionSchema,
  authorizationQuerySchema,
  authorizationRequestParamSchema,
  authorizationRequestResponseSchema,
  clientRegistrationResponseSchema,
  clientRegistrationSchema,
  oauthErrorSchema,
} from "./schemas";
import { registerMcpTools } from "./tools";

const apiUrl = (process.env.KANEO_API_URL || "http://localhost:1337").replace(
  /\/api\/?$/,
  "",
);

type McpSession = {
  transport: WebStandardStreamableHTTPServerTransport;
  userId: string;
};

export function isMcpSessionOwner(
  session: Pick<McpSession, "userId"> | undefined,
  userId: string,
): boolean {
  return session?.userId === userId;
}

const sessions = new Map<string, McpSession>();

function createMcpServerForUser(token: string, userId?: string): McpServer {
  const server = new McpServer({
    name: "kaneo-mcp",
    version: "1.0.0",
  });
  // userId keys the permission guards; without it the task tools cannot
  // check organization roles (#38).
  registerMcpTools(server, apiUrl, token, userId);
  return server;
}

/**
 * Resolve the caller of an MCP request.
 *
 * Two principal types reach this endpoint and BOTH must work:
 *
 *   - humans, via an OAuth/session bearer token from the consent flow
 *   - agents, via a `kaneo_agent_*` API key
 *
 * Agents used to 401 here. `/api/mcp` is deliberately skipped by the global
 * `authenticateApiRequest` middleware (it runs its own OAuth flow), and this
 * function only ever tried `auth.api.getSession`, which does not resolve API
 * keys. So an agent holding a perfectly valid key could not list or call a
 * single tool — it could not even discover what actions were available to it.
 *
 * Agent keys are accepted from `Authorization: Bearer` AND the `x-api-key`
 * header that the rest of the API documents, so agents authenticate the same
 * way everywhere instead of MCP being a special case.
 *
 * Authorization is unchanged: the returned userId keys the same permission
 * guards as any other caller (#38), so an agent still only gets what its role
 * and key permissions allow.
 */
export async function validateBearerToken(
  req: Request,
): Promise<{ userId: string; token: string } | null> {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const apiKeyHeader = req.headers.get("x-api-key")?.trim();

  // An API key may arrive as either header; try the key path first because
  // getSession cannot resolve keys and would reject them outright.
  for (const candidate of [bearer, apiKeyHeader]) {
    if (!candidate) continue;
    const result = await verifyApiKey(candidate);
    if (result?.valid && result.key) {
      return { userId: result.key.userId, token: candidate };
    }
  }

  if (!bearer) return null;

  const headers = new Headers();
  headers.set("authorization", `Bearer ${bearer}`);
  const session = await auth.api.getSession({ headers });

  if (!session?.user?.id) return null;
  return { userId: session.user.id, token: bearer };
}

const mcp = new Hono();

mcp.post(
  "/mcp/register",
  describeRoute({
    operationId: "registerMcpOAuthClient",
    tags: ["MCP"],
    description: "Register a public OAuth client for the MCP endpoint",
    security: [],
    responses: {
      200: {
        description: "Registered OAuth client",
        content: {
          "application/json": {
            schema: resolver(clientRegistrationResponseSchema),
          },
        },
      },
      400: {
        description: "Invalid client metadata",
        content: {
          "application/json": { schema: resolver(oauthErrorSchema) },
        },
      },
    },
  }),
  validator("json", clientRegistrationSchema),
  (c) => c.json(registerMcpClient(c.req.valid("json"))),
);

mcp.get(
  "/mcp/authorize",
  describeRoute({
    operationId: "authorizeMcpOAuthClient",
    tags: ["MCP"],
    description: "Start an explicit MCP OAuth consent request",
    security: [],
    responses: {
      302: { description: "Redirect to the Kaneo consent page" },
      400: {
        description: "Invalid authorization request",
        content: {
          "application/json": { schema: resolver(oauthErrorSchema) },
        },
      },
    },
  }),
  validator("query", authorizationQuerySchema),
  (c) => c.redirect(beginMcpAuthorization(c.req.valid("query"))),
);

mcp.get(
  "/mcp/authorize/request/:requestId",
  describeRoute({
    operationId: "getMcpAuthorizationRequest",
    tags: ["MCP"],
    description: "Get display details for an MCP OAuth consent request",
    security: [],
    responses: {
      200: {
        description: "Authorization request details",
        content: {
          "application/json": {
            schema: resolver(authorizationRequestResponseSchema),
          },
        },
      },
      400: {
        description: "Invalid OAuth client",
        content: {
          "application/json": { schema: resolver(oauthErrorSchema) },
        },
      },
      404: {
        description: "Unknown or expired authorization request",
        content: {
          "application/json": { schema: resolver(oauthErrorSchema) },
        },
      },
    },
  }),
  validator("param", authorizationRequestParamSchema),
  (c) => {
    const { requestId } = c.req.valid("param");
    return c.json(getMcpAuthorizationRequest(requestId));
  },
);

mcp.post(
  "/mcp/authorize/request/:requestId",
  describeRoute({
    operationId: "decideMcpAuthorizationRequest",
    tags: ["MCP"],
    description: "Approve or deny an MCP OAuth consent request",
    responses: {
      200: {
        description: "OAuth client redirect",
        content: {
          "application/json": {
            schema: resolver(authorizationDecisionResponseSchema),
          },
        },
      },
      400: {
        description: "Invalid request or OAuth client",
        content: {
          "application/json": { schema: resolver(oauthErrorSchema) },
        },
      },
      401: {
        description: "Authentication required",
        content: {
          "application/json": { schema: resolver(oauthErrorSchema) },
        },
      },
      403: {
        description: "Untrusted request origin",
        content: {
          "application/json": { schema: resolver(oauthErrorSchema) },
        },
      },
      404: {
        description: "Unknown or expired authorization request",
        content: {
          "application/json": { schema: resolver(oauthErrorSchema) },
        },
      },
    },
  }),
  validator("param", authorizationRequestParamSchema),
  validator("json", authorizationDecisionSchema),
  async (c) => {
    const { requestId } = c.req.valid("param");
    const redirect = await decideMcpAuthorizationRequest({
      requestId,
      decision: c.req.valid("json"),
      headers: c.req.raw.headers,
      origin: c.req.header("origin"),
    });
    return c.json({ redirect });
  },
);

mcp.post("/mcp/token", async (c) => {
  const contentType = c.req.header("content-type") || "";
  let params: Record<string, string>;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await c.req.text();
    params = Object.fromEntries(new URLSearchParams(body));
  } else {
    params = await c.req.json();
  }

  const { grant_type, code, client_id, code_verifier, redirect_uri } = params;

  if (grant_type !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }
  if (!code || !client_id || !code_verifier || !redirect_uri) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await exchangeCode(
    code,
    client_id,
    code_verifier,
    redirect_uri,
  );
  if (!result) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  return c.json({
    access_token: result.accessToken,
    token_type: "bearer",
    expires_in: result.expiresIn,
  });
});

mcp.get("/.well-known/oauth-protected-resource/api/mcp", (c) =>
  c.json({
    resource: `${apiUrl}/api/mcp`,
    authorization_servers: [`${apiUrl}/api`],
  }),
);

mcp.get("/.well-known/oauth-authorization-server/api", (c) =>
  c.json({
    issuer: `${apiUrl}/api`,
    authorization_endpoint: `${apiUrl}/api/mcp/authorize`,
    token_endpoint: `${apiUrl}/api/mcp/token`,
    registration_endpoint: `${apiUrl}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  }),
);

mcp.all("/mcp", async (c) => {
  const authResult = await validateBearerToken(c.req.raw);
  if (!authResult) {
    const prmUrl = `${apiUrl}/api/.well-known/oauth-protected-resource/api/mcp`;
    c.header("WWW-Authenticate", `Bearer resource_metadata="${prmUrl}"`);
    return c.json(
      {
        error: "invalid_token",
        error_description: "Missing or invalid token",
      },
      401,
    );
  }

  const sessionId = c.req.header("mcp-session-id");

  if (sessionId) {
    const existing = sessions.get(sessionId);
    // A mismatched owner is reported as missing rather than forbidden so the
    // response cannot confirm that someone else's session id is valid.
    if (isMcpSessionOwner(existing, authResult.userId)) {
      // The helper above is directly regression-tested with two principals;
      // only the creator can ever reach this transport invocation.
      if (!existing) throw new Error("Owned MCP session disappeared");
      return existing.transport.handleRequest(c.req.raw);
    }
    return c.json({ error: "Session not found" }, 404);
  }

  if (c.req.method !== "POST") {
    return c.json({ error: "Method not allowed" }, 405);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
    }
  };

  const server = createMcpServerForUser(authResult.token, authResult.userId);
  await server.connect(transport);
  const response = await transport.handleRequest(c.req.raw);

  if (transport.sessionId) {
    sessions.set(transport.sessionId, {
      transport,
      userId: authResult.userId,
    });
  }

  return response;
});

export default mcp;

export function mcpWellKnownRoutes(baseUrl: string) {
  const wellKnown = new Hono();

  wellKnown.get("/.well-known/oauth-protected-resource/api/mcp", (c) =>
    c.json({
      resource: `${baseUrl}/api/mcp`,
      authorization_servers: [`${baseUrl}/api`],
    }),
  );

  wellKnown.get("/.well-known/oauth-authorization-server/api", (c) =>
    c.json({
      issuer: `${baseUrl}/api`,
      authorization_endpoint: `${baseUrl}/api/mcp/authorize`,
      token_endpoint: `${baseUrl}/api/mcp/token`,
      registration_endpoint: `${baseUrl}/api/mcp/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    }),
  );

  return wellKnown;
}
