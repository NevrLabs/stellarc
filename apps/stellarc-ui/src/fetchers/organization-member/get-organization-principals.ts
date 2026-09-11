import { getApiUrl } from "@/fetchers/get-api-url";

export type PrincipalKind = "user" | "agent";

export type OrganizationPrincipal = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  kind: PrincipalKind;
};

/**
 * KFL-160: Better Auth's `organization.listMembers` hard-codes its user
 * projection to {id,name,email,image}, so `user.role` — the only record of
 * agent-ness — never reaches the client. The assignee picker's
 * Users/Agents/Teams grouping needs that discriminator, so it reads the
 * dedicated principals endpoint instead of listMembers.
 */
async function getOrganizationPrincipals(organizationId: string) {
  const response = await fetch(
    getApiUrl(`/organization/${encodeURIComponent(organizationId)}/principals`),
    { credentials: "include" },
  );

  if (!response.ok) throw new Error(await response.text());

  return (await response.json()) as OrganizationPrincipal[];
}

export default getOrganizationPrincipals;
