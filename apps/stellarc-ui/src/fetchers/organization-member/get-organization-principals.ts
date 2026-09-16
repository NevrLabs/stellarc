import { identityGet, orgPath } from "@/lib/identity-client";

export type PrincipalKind = "user" | "agent";

export type OrganizationPrincipal = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  kind: PrincipalKind;
};

/**
 * KFL-160: the assignee picker's Users/Agents/Teams grouping needs the
 * agent discriminator, which the members projection does not carry. Read the
 * org's principal projection (human + agent rows, §3 PrincipalPublic).
 */
async function getOrganizationPrincipals(organizationId: string) {
  const { principals } = await identityGet<{
    principals: OrganizationPrincipal[];
  }>(orgPath(organizationId, "principals"));
  return principals;
}

export default getOrganizationPrincipals;
