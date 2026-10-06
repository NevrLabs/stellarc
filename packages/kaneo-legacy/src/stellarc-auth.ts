import { APIError } from "better-auth/api";
import { auth } from "./auth";
import { userTable } from "./database/schema";
import db from "./database";
import { eq } from "drizzle-orm";
import { verifyApiKey } from "./utils/verify-api-key";

/**
 * Principal resolution for the Effect-native Stellarc modules. Same rules as
 * authenticateApiRequest (bearer api-key → bearer session → x-api-key →
 * cookie session), without a Hono Context.
 */
export type StellarcPrincipal = {
  userId: string;
  userRole: string | null;
  apiKey: {
    id: string;
    permissions: Record<string, string[]> | null;
    metadata: Record<string, unknown> | null;
  } | null;
};

async function session(headers: Headers) {
  try {
    return await auth.api.getSession({ headers });
  } catch (error) {
    if (error instanceof APIError) return null;
    throw error;
  }
}

async function roleOf(userId: string) {
  const [row] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return row?.role ?? null;
}

async function fromKey(raw: string): Promise<StellarcPrincipal | null> {
  const result = await verifyApiKey(raw);
  if (!result?.valid || !result.key) return null;
  return {
    userId: result.key.userId,
    userRole: await roleOf(result.key.userId),
    apiKey: {
      id: result.key.id,
      permissions: result.key.permissions,
      metadata: result.key.metadata,
    },
  };
}

/** Returns null when unauthenticated; "malformed" for a bad bearer header. */
export async function resolvePrincipal(
  headers: Headers,
): Promise<StellarcPrincipal | null | "malformed"> {
  const authz = headers.get("authorization");
  let token: string | null = null;
  if (authz && /^Bearer\b/i.test(authz)) {
    const m = authz.match(/^Bearer\s+(\S+)$/i);
    if (!m) return "malformed";
    token = m[1];
  }
  const apiKeyHeader = headers.get("x-api-key")?.trim();
  if (!token && apiKeyHeader) return fromKey(apiKeyHeader);
  if (token) {
    const viaKey = await fromKey(token);
    if (viaKey) return viaKey;
    const bearerOnly = new Headers(headers);
    bearerOnly.delete("cookie");
    const s = await session(bearerOnly);
    return s?.user
      ? {
          userId: s.user.id,
          userRole: (s.user as { role?: string | null }).role ?? null,
          apiKey: null,
        }
      : null;
  }
  const s = await session(headers);
  return s?.user
    ? {
        userId: s.user.id,
        userRole: (s.user as { role?: string | null }).role ?? null,
        apiKey: null,
      }
    : null;
}
