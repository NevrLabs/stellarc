import { useMutation, useQueryClient } from "@tanstack/react-query";
import createOrganization from "@/fetchers/organization/create-organization";

type CreateOrganizationRequest = {
  name: string;
  slug: string;
  description?: string;
};

function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      slug,
      description,
    }: CreateOrganizationRequest) =>
      createOrganization({ name, slug, description }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export default useCreateOrganization;
