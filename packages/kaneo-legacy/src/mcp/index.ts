import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { auth } from "../auth";
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

const apiUrl = (process.env.KANEO_API_URL || "http://localhost:1337").replace(
  /\/api\/?$/,
  "",
);

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

// The /api/mcp JSON-RPC transport now runs on effect/ai's McpServer
// (packages/kaneo/src/mcp, NEVR-185). This file keeps only the OAuth consent
// surface it shares nothing with: /mcp/register, /mcp/authorize*,
// /mcp/token, and the well-knowns.

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
