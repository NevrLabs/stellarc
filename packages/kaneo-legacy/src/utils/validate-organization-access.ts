import { and, eq, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

export async function validateOrganizationAccess(
  userId: string,
  organizationId: string,
  apiKeyId?: string,
): Promise<void> {
  if (apiKeyId) {
    const apiKey = await db
      .select()
      .from(schema.apikeyTable)
      .where(
        and(
          eq(schema.apikeyTable.id, apiKeyId),
          or(
            eq(schema.apikeyTable.referenceId, userId),
            eq(schema.apikeyTable.userId, userId),
          ),
          eq(schema.apikeyTable.enabled, true),
        ),
      )
      .limit(1);

    if (apiKey.length === 0) {
      throw new HTTPException(403, {
        message: "Invalid API key for this organization",
      });
    }

    try {
      const metadata = JSON.parse(apiKey[0].metadata ?? "null") as {
        type?: string;
        organizationId?: string;
      } | null;
      if (
        metadata?.type === "agent" &&
        metadata.organizationId !== organizationId
      ) {
        throw new HTTPException(403, {
          message: "Agent is not authorized for this organization",
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      // Legacy API keys may contain arbitrary metadata.
    }
  }

  const [user] = await db
    .select({ role: schema.userTable.role })
    .from(schema.userTable)
    .where(eq(schema.userTable.id, userId))
    .limit(1);

  if (user?.role === "admin") {
    return;
  }

  const membership = await db
    .select()
    .from(schema.organizationMemberTable)
    .where(
      and(
        eq(schema.organizationMemberTable.userId, userId),
        eq(schema.organizationMemberTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (membership.length === 0) {
    throw new HTTPException(403, {
      message: "You don't have access to this organization",
    });
  }
}
