import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../auth";
import db from "../database";
import { organizationGithubInstallationTable } from "../database/schema";
import { getGithubApp } from "../plugins/github/utils/github-app";

const MAX_STATE_AGE_MS = 5 * 60 * 1000;

type InstallState = {
  organizationId: string;
  userId: string;
  issuedAt: number;
};

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value)
    throw new HTTPException(503, {
      message: "Install callback is not configured",
    });
  return value;
}

export function createInstallState(input: InstallState): string {
  const payload = Buffer.from(JSON.stringify(input)).toString("base64url");
  const signature = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function parseInstallState(
  value: string,
  now = Date.now(),
): InstallState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature)
    throw new HTTPException(400, { message: "Invalid install state" });
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HTTPException(400, { message: "Invalid install state" });
  }
  let state: InstallState;
  try {
    state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new HTTPException(400, { message: "Invalid install state" });
  }
  if (
    typeof state.organizationId !== "string" ||
    typeof state.userId !== "string" ||
    typeof state.issuedAt !== "number" ||
    state.issuedAt > now ||
    now - state.issuedAt > MAX_STATE_AGE_MS
  )
    throw new HTTPException(400, { message: "Expired install state" });
  return state;
}

export async function saveOrganizationInstallation(
  organizationId: string,
  installationId: number,
) {
  const app = getGithubApp();
  if (!app)
    throw new HTTPException(503, { message: "GitHub App is not configured" });
  const { data: installation } = await app.octokit.rest.apps.getInstallation({
    installation_id: installationId,
  });
  if (!installation.account)
    throw new HTTPException(400, {
      message: "GitHub installation has no account",
    });
  const account = installation.account as {
    id: number;
    login: string;
    type?: string;
    avatar_url?: string;
  };
  const [saved] = await db
    .insert(organizationGithubInstallationTable)
    .values({
      organizationId,
      installationId,
      accountId: account.id,
      accountLogin: account.login,
      accountType: account.type ?? "Unknown",
      accountAvatarUrl: account.avatar_url ?? null,
      repositorySelection: installation.repository_selection,
      permissions: installation.permissions,
    })
    .onConflictDoUpdate({
      target: [
        organizationGithubInstallationTable.organizationId,
        organizationGithubInstallationTable.installationId,
      ],
      set: {
        accountLogin: account.login,
        accountType: account.type ?? "Unknown",
        accountAvatarUrl: account.avatar_url ?? null,
        repositorySelection: installation.repository_selection,
        permissions: installation.permissions,
        updatedAt: new Date(),
      },
    })
    .returning();
  return saved;
}

function connectionsRedirect(
  organizationId: string,
  result: "connected" | "failed",
) {
  const url = new URL(
    "/dashboard/settings/organization/connections",
    process.env.KANEO_CLIENT_URL || "http://localhost:5173",
  );
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set("github-install", result);
  return Response.redirect(url.toString(), 303);
}

export async function handleOrganizationGithubInstallCallback(c: Context) {
  const installationId = Number(c.req.query("installation_id"));
  const stateValue = c.req.query("state");
  if (!Number.isSafeInteger(installationId) || !stateValue) {
    throw new HTTPException(400, {
      message: "Missing GitHub installation callback data",
    });
  }
  const state = parseInstallState(stateValue);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || session.user.id !== state.userId)
    return connectionsRedirect(state.organizationId, "failed");
  try {
    await saveOrganizationInstallation(state.organizationId, installationId);
    return connectionsRedirect(state.organizationId, "connected");
  } catch {
    return connectionsRedirect(state.organizationId, "failed");
  }
}

export function buildOrganizationGithubInstallUrl(
  organizationId: string,
  userId: string,
) {
  const appName = process.env.GITHUB_APP_NAME;
  if (!appName)
    throw new HTTPException(503, { message: "GitHub App is not configured" });
  const url = new URL(`https://github.com/apps/${appName}/installations/new`);
  url.searchParams.set(
    "state",
    createInstallState({ organizationId, userId, issuedAt: Date.now() }),
  );
  return url.toString();
}
