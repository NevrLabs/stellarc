import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import * as v from "valibot";
import { auth } from "../auth";
import db from "../database";
import {
  githubDelegationStateTable,
  githubUserGrantTable,
} from "../database/schema";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";
const PROVIDER_ID = "github-delegation";
const STATE_TTL_MS = 10 * 60 * 1000;
// Refresh this far ahead of expiry so a token can't lapse mid-request.
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

const delegationStatusSchema = v.object({
  connected: v.boolean(),
  githubLogin: v.nullable(v.string()),
  scope: v.nullable(v.string()),
  accessTokenExpiresAt: v.nullable(v.string()),
  refreshTokenExpiresAt: v.nullable(v.string()),
});

/**
 * Delegation prefers the GitHub App's user-authorization client. Only tokens
 * minted by the App render GitHub's "with <App>" provenance on comments, which
 * is the whole point of delegating: a human author plus visible Kaneo origin.
 * The sign-in OAuth App is a compatibility fallback for installations that have
 * not configured App client credentials; it yields a human author with no
 * provenance line.
 */
function configuredClient(): {
  clientId: string;
  clientSecret: string;
  isGitHubApp: boolean;
} {
  const appClientId = process.env.GITHUB_APP_CLIENT_ID?.trim();
  const appClientSecret = process.env.GITHUB_APP_CLIENT_SECRET?.trim();
  if (appClientId && appClientSecret) {
    return {
      clientId: appClientId,
      clientSecret: appClientSecret,
      isGitHubApp: true,
    };
  }
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new HTTPException(503, {
      message: "GitHub user delegation is not configured",
    });
  }
  return { clientId, clientSecret, isGitHubApp: false };
}

function callbackUrl(): string {
  // KANEO_API_URL may or may not already include the /api prefix depending on
  // how the deployment terminates routing, so normalise instead of assuming.
  const apiUrl = (process.env.KANEO_API_URL || "http://localhost:1337").replace(
    /\/$/,
    "",
  );
  const base = apiUrl.endsWith("/api") ? apiUrl : `${apiUrl}/api`;
  return `${base}/github-delegation/callback`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getExpiry(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(Date.now() + value * 1000)
    : null;
}

export async function revokeGitHubDelegationToken(accessToken: string) {
  const { clientId, clientSecret } = configuredClient();
  const response = await fetch(
    `${GITHUB_API_URL}/applications/${encodeURIComponent(clientId)}/token`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "User-Agent": "Kaneo",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ access_token: accessToken }),
    },
  );
  if (response.status === 204 || response.status === 404) return;
  throw new HTTPException(502, {
    message: `GitHub token revocation failed (${response.status})`,
  });
}

function clientRedirect(result: "connected" | "denied" | "failed"): Response {
  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";
  const url = new URL(clientUrl);
  url.searchParams.set("github-delegation", result);
  return Response.redirect(url.toString(), 303);
}

async function currentSession(request: Request) {
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user || !result.session) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return result;
}

/** Refresh an expiring GitHub OAuth App user token when GitHub issued one. */
export async function refreshGitHubDelegationGrant(userId: string) {
  const [grant] = await db
    .select()
    .from(githubUserGrantTable)
    .where(
      and(
        eq(githubUserGrantTable.userId, userId),
        eq(githubUserGrantTable.providerId, PROVIDER_ID),
      ),
    )
    .limit(1);
  if (!grant?.refreshToken) {
    throw new HTTPException(409, {
      message: "This GitHub grant is not refreshable",
    });
  }

  const { clientId, clientSecret } = configuredClient();
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: grant.refreshToken,
    }),
  });
  const tokens = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof tokens.access_token !== "string") {
    throw new HTTPException(502, { message: "GitHub token refresh failed" });
  }
  const [updated] = await db
    .update(githubUserGrantTable)
    .set({
      accessToken: tokens.access_token,
      refreshToken:
        typeof tokens.refresh_token === "string"
          ? tokens.refresh_token
          : grant.refreshToken,
      accessTokenExpiresAt: getExpiry(tokens.expires_in),
      refreshTokenExpiresAt: getExpiry(tokens.refresh_token_expires_in),
      scope: typeof tokens.scope === "string" ? tokens.scope : grant.scope,
      updatedAt: new Date(),
    })
    .where(eq(githubUserGrantTable.id, grant.id))
    .returning();
  return updated;
}

/**
 * Returns a usable delegated access token for the user, refreshing it first
 * when it is expired or about to expire.
 *
 * GitHub App user tokens live only 8 hours. Callers previously read
 * `accessToken` straight from the table, so once that window elapsed every
 * delegated action failed and silently fell back to the bot — exactly the
 * mislabelling delegation exists to prevent.
 *
 * Returns null when there is no grant, or when refresh is impossible (no
 * refresh token, or GitHub rejected it). A null result means "no delegation
 * available", which callers handle as the unauthenticated case.
 */
export async function getUsableDelegatedToken(
  userId: string,
): Promise<string | null> {
  const [grant] = await db
    .select()
    .from(githubUserGrantTable)
    .where(
      and(
        eq(githubUserGrantTable.userId, userId),
        eq(githubUserGrantTable.providerId, PROVIDER_ID),
      ),
    )
    .limit(1);
  if (!grant?.accessToken) return null;

  // Refresh slightly early so a token cannot expire mid-request.
  const expiresAt = grant.accessTokenExpiresAt?.getTime();
  const needsRefresh =
    expiresAt !== undefined && expiresAt - Date.now() <= TOKEN_REFRESH_SKEW_MS;
  if (!needsRefresh) return grant.accessToken;

  if (!grant.refreshToken) return null;
  try {
    const refreshed = await refreshGitHubDelegationGrant(userId);
    return refreshed?.accessToken ?? null;
  } catch (error) {
    console.error("GitHub delegated token refresh failed", error);
    return null;
  }
}

export async function handleGitHubDelegationCallback(c: Context) {
  const providerError = c.req.query("error");
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (providerError || !state || !code) return clientRedirect("denied");

  let session: Awaited<ReturnType<typeof currentSession>>;
  try {
    session = await currentSession(c.req.raw);
  } catch {
    return clientRedirect("failed");
  }

  const [pending] = await db
    .delete(githubDelegationStateTable)
    .where(
      and(
        eq(githubDelegationStateTable.stateHash, sha256(state)),
        eq(githubDelegationStateTable.userId, session.user.id),
        eq(githubDelegationStateTable.sessionId, session.session.id),
        gt(githubDelegationStateTable.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!pending) return clientRedirect("failed");

  try {
    const { clientId, clientSecret } = configuredClient();
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      // URLSearchParams is form-encoded; declaring application/json made
      // GitHub reject the exchange and return an empty body.
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl(),
      }),
    });
    // Read as text first: GitHub returns an empty or form-encoded body on
    // malformed requests, and a bare .json() there throws an opaque
    // SyntaxError that hides the real cause.
    const rawToken = await tokenResponse.text();
    let tokens: Record<string, unknown> = {};
    try {
      tokens = rawToken
        ? (JSON.parse(rawToken) as Record<string, unknown>)
        : {};
    } catch {
      throw new Error(
        `GitHub token exchange returned a non-JSON body (${tokenResponse.status}): ${rawToken.slice(0, 200)}`,
      );
    }
    if (!tokenResponse.ok || typeof tokens.access_token !== "string") {
      throw new Error(
        `GitHub token exchange failed (${tokenResponse.status}): ${
          typeof tokens.error_description === "string"
            ? tokens.error_description
            : (tokens.error ?? "no access_token returned")
        }`,
      );
    }

    const identityResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokens.access_token}`,
        "User-Agent": "Kaneo",
      },
    });
    const identity = (await identityResponse.json()) as Record<string, unknown>;
    if (
      !identityResponse.ok ||
      typeof identity.id !== "number" ||
      typeof identity.login !== "string"
    ) {
      throw new Error("GitHub identity lookup failed");
    }

    await db
      .insert(githubUserGrantTable)
      .values({
        userId: session.user.id,
        providerId: PROVIDER_ID,
        githubUserId: String(identity.id),
        githubLogin: identity.login,
        accessToken: tokens.access_token,
        refreshToken:
          typeof tokens.refresh_token === "string"
            ? tokens.refresh_token
            : null,
        accessTokenExpiresAt: getExpiry(tokens.expires_in),
        refreshTokenExpiresAt: getExpiry(tokens.refresh_token_expires_in),
        scope: typeof tokens.scope === "string" ? tokens.scope : null,
      })
      .onConflictDoUpdate({
        target: [githubUserGrantTable.userId, githubUserGrantTable.providerId],
        set: {
          githubUserId: String(identity.id),
          githubLogin: identity.login,
          accessToken: tokens.access_token,
          refreshToken:
            typeof tokens.refresh_token === "string"
              ? tokens.refresh_token
              : null,
          accessTokenExpiresAt: getExpiry(tokens.expires_in),
          refreshTokenExpiresAt: getExpiry(tokens.refresh_token_expires_in),
          scope: typeof tokens.scope === "string" ? tokens.scope : null,
          updatedAt: new Date(),
        },
      });
    return clientRedirect("connected");
  } catch (error) {
    console.error("GitHub delegation callback failed", error);
    return clientRedirect("failed");
  }
}

const githubDelegation = new Hono<{
  Variables: { userId: string; session: { id: string } | null };
}>()
  .get(
    "/initiate",
    describeRoute({
      operationId: "initiateGitHubDelegation",
      tags: ["GitHub"],
      description:
        "Begin GitHub user-delegation authorization (repo write and user identity).",
      responses: {
        302: { description: "Redirect to GitHub" },
        503: { description: "GitHub delegation is not configured" },
      },
    }),
    async (c) => {
      const { clientId, isGitHubApp } = configuredClient();
      const userId = c.get("userId");
      const sessionId = c.get("session")?.id;
      if (!userId || !sessionId)
        throw new HTTPException(401, {
          message: "A browser session is required",
        });
      const state = randomBytes(32).toString("base64url");
      const now = new Date();
      await db
        .delete(githubDelegationStateTable)
        .where(eq(githubDelegationStateTable.userId, userId));
      await db.insert(githubDelegationStateTable).values({
        userId,
        sessionId,
        stateHash: sha256(state),
        expiresAt: new Date(now.getTime() + STATE_TTL_MS),
      });
      const url = new URL(GITHUB_AUTHORIZE_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", callbackUrl());
      // GitHub Apps derive permissions from the installation and ignore `scope`;
      // sending it would imply Kaneo requests classic OAuth scopes it cannot get.
      if (!isGitHubApp) {
        url.searchParams.set("scope", "repo read:user user:email");
      }
      url.searchParams.set("state", state);
      return c.redirect(url.toString(), 302);
    },
  )
  .get(
    "/status",
    describeRoute({
      operationId: "getGitHubDelegationStatus",
      tags: ["GitHub"],
      description:
        "Get GitHub user-delegation connection status without exposing tokens.",
      responses: {
        200: {
          description: "Delegation status",
          content: {
            "application/json": { schema: resolver(delegationStatusSchema) },
          },
        },
      },
    }),
    async (c) => {
      const [grant] = await db
        .select()
        .from(githubUserGrantTable)
        .where(
          and(
            eq(githubUserGrantTable.userId, c.get("userId")),
            eq(githubUserGrantTable.providerId, PROVIDER_ID),
          ),
        )
        .limit(1);
      return c.json({
        connected: Boolean(grant),
        githubLogin: grant?.githubLogin ?? null,
        scope: grant?.scope ?? null,
        accessTokenExpiresAt:
          grant?.accessTokenExpiresAt?.toISOString() ?? null,
        refreshTokenExpiresAt:
          grant?.refreshTokenExpiresAt?.toISOString() ?? null,
      });
    },
  )
  .post(
    "/refresh",
    describeRoute({
      operationId: "refreshGitHubDelegation",
      tags: ["GitHub"],
      description:
        "Refresh an expiring GitHub user-delegation token when GitHub supplied a refresh token.",
      responses: {
        204: { description: "Delegation refreshed" },
        409: { description: "Grant is not refreshable" },
      },
    }),
    async (c) => {
      await refreshGitHubDelegationGrant(c.get("userId"));
      return c.body(null, 204);
    },
  )
  .delete(
    "/disconnect",
    describeRoute({
      operationId: "disconnectGitHubDelegation",
      tags: ["GitHub"],
      description:
        "Disconnect GitHub user delegation and delete stored user tokens.",
      responses: { 204: { description: "Delegation removed" } },
    }),
    async (c) => {
      const condition = and(
        eq(githubUserGrantTable.userId, c.get("userId")),
        eq(githubUserGrantTable.providerId, PROVIDER_ID),
      );
      const [grant] = await db
        .select({ accessToken: githubUserGrantTable.accessToken })
        .from(githubUserGrantTable)
        .where(condition)
        .limit(1);
      if (grant?.accessToken) {
        await revokeGitHubDelegationToken(grant.accessToken);
      }
      await db.delete(githubUserGrantTable).where(condition);
      return c.body(null, 204);
    },
  );

export default githubDelegation;
