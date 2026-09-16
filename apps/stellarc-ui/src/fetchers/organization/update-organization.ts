import {
  type IdentityMutation,
  identitySend,
  orgPath,
} from "@/lib/identity-client";
import type { OrganizationPublic } from "@/lib/identity-collections";

type UpdateOrganizationRequest = {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  slug?: string;
};

const updateOrganization = async ({
  id,
  name,
  description,
  slug,
}: UpdateOrganizationRequest) => {
  const result = await identitySend<IdentityMutation<OrganizationPublic>>(
    orgPath(id),
    "PATCH",
    {
      name,
      ...(slug !== undefined ? { slug } : {}),
      ...(description !== undefined ? { description } : {}),
    },
  );
  return result.data;
};

export default updateOrganization;
