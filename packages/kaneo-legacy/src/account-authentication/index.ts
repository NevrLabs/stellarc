import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import db from "../database";
import { accountTable } from "../database/schema";

const PROVIDER_LABELS: Record<string, string> = {
  credential: "Email and password",
  github: "GitHub",
  google: "Google",
  discord: "Discord",
  custom: process.env.CUSTOM_OAUTH_DISPLAY_NAME?.trim() || "ZITADEL",
};

const configuredProviders = () =>
  [
    process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET
      ? "github"
      : null,
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? "google"
      : null,
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? "discord"
      : null,
    process.env.CUSTOM_OAUTH_CLIENT_ID && process.env.CUSTOM_OAUTH_CLIENT_SECRET
      ? "custom"
      : null,
  ].filter((providerId): providerId is string => Boolean(providerId));

const accountAuthentication = new Hono<{
  Variables: { userId: string };
}>().get(
  "/identities",
  describeRoute({
    operationId: "listLinkedAuthenticationIdentities",
    tags: ["Account"],
    description:
      "List linked sign-in identities without exposing credentials or tokens.",
    responses: { 200: { description: "Linked sign-in identities" } },
  }),
  async (c) => {
    const accounts = await db
      .select({
        id: accountTable.id,
        providerId: accountTable.providerId,
        accountId: accountTable.accountId,
        createdAt: accountTable.createdAt,
      })
      .from(accountTable)
      .where(eq(accountTable.userId, c.get("userId")));

    return c.json({
      identities: accounts.map((account) => ({
        id: account.id,
        providerId: account.providerId,
        providerName: PROVIDER_LABELS[account.providerId] ?? account.providerId,
        accountId: account.accountId,
        linkedAt: account.createdAt.toISOString(),
      })),
      providers: configuredProviders().map((providerId) => ({
        providerId,
        providerName: PROVIDER_LABELS[providerId] ?? providerId,
      })),
    });
  },
);

export default accountAuthentication;
