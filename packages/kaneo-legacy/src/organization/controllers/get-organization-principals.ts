import { eq } from "drizzle-orm";
import db from "../../database";
import { organizationMemberTable, userTable } from "../../database/schema";

export type PrincipalKind = "user" | "agent";

export type OrganizationPrincipal = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  kind: PrincipalKind;
};

/**
 * List the organization's member principals with an explicit `kind`.
 *
 * Better Auth's organization `listMembers` hard-codes its user projection to
 * {id,name,email,image}, so `user.role` — the only record of agent-ness — never
 * reaches the client and cannot be recovered via additionalFields. Clients that
 * need to tell agents apart from humans (e.g. the assignee picker's
 * Users/Agents/Teams grouping) must use this endpoint instead.
 */
async function getOrganizationPrincipals(
  organizationId: string,
): Promise<OrganizationPrincipal[]> {
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      role: userTable.role,
    })
    .from(organizationMemberTable)
    .innerJoin(userTable, eq(organizationMemberTable.userId, userTable.id))
    .where(eq(organizationMemberTable.organizationId, organizationId));

  return rows.map(({ role, ...user }) => ({
    ...user,
    kind: role === "agent" ? "agent" : "user",
  }));
}

export default getOrganizationPrincipals;
