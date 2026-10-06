import { count, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { isInstanceAdmin } from "../utils/is-instance-admin";

const admin = new Hono<{
  Variables: {
    user: { role?: string | null } | null;
    userId: string;
  };
}>();

admin.use("*", async (c, next) => {
  if (!(await isInstanceAdmin(c))) {
    throw new HTTPException(403, {
      message: "Instance administrator required",
    });
  }
  await next();
});

admin.get("/status", async (c) => {
  const [userCount, organizationCount, installationCount] = await Promise.all([
    db.select({ value: count() }).from(schema.userTable),
    db.select({ value: count() }).from(schema.organizationTable),
    db
      .select({ value: count() })
      .from(schema.organizationGithubInstallationTable),
  ]);

  const githubApp = {
    configured: Boolean(
      process.env.GITHUB_APP_ID &&
        process.env.GITHUB_APP_NAME &&
        process.env.GITHUB_WEBHOOK_SECRET &&
        (process.env.GITHUB_PRIVATE_KEY ||
          process.env.GITHUB_PRIVATE_KEY_BASE64),
    ),
    appId: process.env.GITHUB_APP_ID || null,
    appName: process.env.GITHUB_APP_NAME || null,
    privateKeyConfigured: Boolean(
      process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY_BASE64,
    ),
    webhookSecretConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
    installationCount: installationCount[0]?.value ?? 0,
    source: "Environment variables",
  };

  return c.json({
    counts: {
      users: userCount[0]?.value ?? 0,
      organizations: organizationCount[0]?.value ?? 0,
      githubInstallations: installationCount[0]?.value ?? 0,
    },
    githubApp,
    authentication: {
      password: process.env.DISABLE_PASSWORD_REGISTRATION !== "true",
      emailOtp:
        process.env.DISABLE_EMAIL_OTP_SIGN_IN !== "true" &&
        Boolean(process.env.SMTP_HOST),
      guest: process.env.DISABLE_GUEST_ACCESS !== "true",
      github: Boolean(
        (process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID) &&
          (process.env.GITHUB_OAUTH_CLIENT_SECRET ||
            process.env.GITHUB_CLIENT_SECRET),
      ),
      google: Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      ),
      discord: Boolean(
        process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET,
      ),
      oidc: Boolean(
        process.env.CUSTOM_OAUTH_CLIENT_ID &&
          process.env.CUSTOM_OAUTH_CLIENT_SECRET,
      ),
      oidcDiscoveryUrl: process.env.CUSTOM_OAUTH_DISCOVERY_URL || null,
      source: "Environment variables",
    },
    instance: {
      apiUrl: process.env.KANEO_API_URL || "http://localhost:1337",
      clientUrl: process.env.KANEO_CLIENT_URL || "http://localhost:5173",
      registration: process.env.DISABLE_REGISTRATION !== "true",
      loginForm: process.env.DISABLE_LOGIN_FORM !== "true",
      cloudMode: process.env.KANEO_CLOUD === "true",
      databaseConfigured: Boolean(
        process.env.DATABASE_URL || process.env.POSTGRES_PASSWORD,
      ),
      redisConfigured: Boolean(
        process.env.REDIS_URL ||
          process.env.REDIS_SENTINELS ||
          process.env.REDIS_CLUSTER_NODES,
      ),
      objectStorageConfigured: Boolean(process.env.S3_BUCKET),
      source: "Environment variables",
    },
  });
});

admin.get("/organizations", async (c) => {
  const organizations = await db
    .select({
      id: schema.organizationTable.id,
      name: schema.organizationTable.name,
      slug: schema.organizationTable.slug,
      reposEnabled: schema.organizationTable.reposEnabled,
      createdAt: schema.organizationTable.createdAt,
      memberCount: sql<number>`count(distinct ${schema.organizationMemberTable.id})::int`,
      githubInstallationCount: sql<number>`count(distinct ${schema.organizationGithubInstallationTable.id})::int`,
    })
    .from(schema.organizationTable)
    .leftJoin(
      schema.organizationMemberTable,
      eq(
        schema.organizationMemberTable.organizationId,
        schema.organizationTable.id,
      ),
    )
    .leftJoin(
      schema.organizationGithubInstallationTable,
      eq(
        schema.organizationGithubInstallationTable.organizationId,
        schema.organizationTable.id,
      ),
    )
    .groupBy(schema.organizationTable.id)
    .orderBy(schema.organizationTable.name);

  return c.json(organizations);
});

export default admin;
