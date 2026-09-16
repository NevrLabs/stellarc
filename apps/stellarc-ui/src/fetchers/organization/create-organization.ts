import { type IdentityMutation, identitySend } from "@/lib/identity-client";
import type { OrganizationPublic } from "@/lib/identity-collections";

type CreateOrganizationRequest = {
  name: string;
  slug: string;
  description?: string;
};

const createOrganization = async ({
  name,
  slug,
  description,
}: CreateOrganizationRequest) => {
  const result = await identitySend<IdentityMutation<OrganizationPublic>>(
    "/organizations",
    "POST",
    { name, slug, description },
  );
  return result.data;
};

export default createOrganization;
