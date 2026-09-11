import { authClient } from "@/lib/auth-client";

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
  logo,
  slug,
}: UpdateOrganizationRequest) => {
  const metadata = description ? { description } : undefined;

  const { data, error } = await authClient.organization.update({
    organizationId: id,
    data: {
      name,
      slug,
      logo,
      metadata,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to update organization");
  }

  return data;
};

export default updateOrganization;
