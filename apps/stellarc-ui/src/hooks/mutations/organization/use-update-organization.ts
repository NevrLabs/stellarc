import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type UpdateOrganizationRequest = {
  organizationId: string;
  name?: string;
  description?: string;
  slug?: string;
  logo?: string;
  metadata?: Record<string, unknown>;
  reposEnabled?: boolean;
  tablesEnabled?: boolean;
};

function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      name,
      description,
      slug,
      logo,
      metadata,
      reposEnabled,
      tablesEnabled,
    }: UpdateOrganizationRequest) => {
      const updateData: {
        name?: string;
        description?: string;
        slug?: string;
        logo?: string;
        metadata?: Record<string, unknown>;
        reposEnabled?: boolean;
        tablesEnabled?: boolean;
      } = {};

      if (name !== undefined) {
        updateData.name = name;
      }

      if (slug !== undefined) {
        updateData.slug = slug;
      }

      if (description !== undefined) {
        updateData.description = description;
      }

      if (logo !== undefined) {
        updateData.logo = logo;
      }

      if (metadata !== undefined) {
        updateData.metadata = metadata;
      }
      if (reposEnabled !== undefined) {
        updateData.reposEnabled = reposEnabled;
      }
      if (tablesEnabled !== undefined) {
        updateData.tablesEnabled = tablesEnabled;
      }

      const { data, error } = await authClient.organization.update({
        data: updateData,
        organizationId: organizationId,
      });

      if (error) {
        throw new Error(error.message || "Failed to update organization");
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["organization", "full", variables.organizationId],
      });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["active-organization"] });
    },
  });
}

export default useUpdateOrganization;
