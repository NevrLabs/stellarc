import { authClient } from "@/lib/auth-client";

const getOrganizations = async () => {
  const { data, error } = await authClient.organization.list();

  if (error) {
    throw new Error(error.message || "Failed to fetch organizations");
  }

  return data || [];
};

export default getOrganizations;
