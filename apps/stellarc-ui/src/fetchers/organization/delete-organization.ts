import { authClient } from "@/lib/auth-client";

type DeleteOrganizationRequest = {
  id: string;
};

const deleteOrganization = async ({ id }: DeleteOrganizationRequest) => {
  const { data, error } = await authClient.organization.delete({
    organizationId: id,
  });

  if (error) {
    throw new Error(error.message || "Failed to delete organization");
  }

  return data;
};

export default deleteOrganization;
