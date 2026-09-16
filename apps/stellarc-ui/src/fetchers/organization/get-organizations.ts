import { type IdentityMutation, identityGet } from "@/lib/identity-client";
import type { OrganizationPublic } from "@/lib/identity-collections";

async function getOrganizations() {
  const { organizations } = await identityGet<{
    organizations: OrganizationPublic[];
  }>("/organizations");
  return organizations;
}

export default getOrganizations;
export type { IdentityMutation };
