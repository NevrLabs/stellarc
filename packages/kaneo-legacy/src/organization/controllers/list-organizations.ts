import { eq } from "drizzle-orm";
import db, { schema } from "../../database";

/**
 * Organizations the authenticated principal can access.
 *
 * Exists because the MCP `list_organizations` tool used to call the Better
 * Auth route `/api/auth/organization/list`, which only accepts user sessions —
 * agent/API keys got INVALID_API_KEY, so an agent could never discover the
 * organization id that every other org-scoped tool requires.
 *
 * Scoping rules mirror validateOrganizationAccess:
 * - an agent key carries `metadata.organizationId` and sees ONLY that org
 * - otherwise the key acts as its owning user: membership list
 */
export default async function listOrganizations(
  userId: string,
  apiKeyMetadata?: unknown,
) {
  const agentOrganizationId = parseAgentOrganizationId(apiKeyMetadata);
  if (agentOrganizationId) {
    return db
      .select({
        id: schema.organizationTable.id,
        name: schema.organizationTable.name,
        slug: schema.organizationTable.slug,
        logo: schema.organizationTable.logo,
      })
      .from(schema.organizationTable)
      .where(eq(schema.organizationTable.id, agentOrganizationId));
  }

  return db
    .select({
      id: schema.organizationTable.id,
      name: schema.organizationTable.name,
      slug: schema.organizationTable.slug,
      logo: schema.organizationTable.logo,
      role: schema.organizationMemberTable.role,
    })
    .from(schema.organizationMemberTable)
    .innerJoin(
      schema.organizationTable,
      eq(
        schema.organizationMemberTable.organizationId,
        schema.organizationTable.id,
      ),
    )
    .where(eq(schema.organizationMemberTable.userId, userId));
}

function parseAgentOrganizationId(metadata?: unknown): string | null {
  if (!metadata) return null;
  try {
    /*
      Better Auth may hand metadata back as a parsed object OR as the raw JSON
      string, depending on the code path. Accept both — the DB row stores a
      JSON string, verifyApiKey returns an object.
    */
    const parsed = (
      typeof metadata === "string" ? JSON.parse(metadata) : metadata
    ) as {
      type?: string;
      organizationId?: string;
    } | null;
    if (parsed?.type === "agent" && parsed.organizationId) {
      return parsed.organizationId;
    }
  } catch {
    // Legacy API keys may contain arbitrary metadata.
  }
  return null;
}
