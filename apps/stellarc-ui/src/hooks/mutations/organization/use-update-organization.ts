import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateOrganization from "@/fetchers/organization/update-organization";

type UpdateOrganizationRequest = {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  slug?: string;
};

function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      logo,
      slug,
    }: UpdateOrganizationRequest) =>
      updateOrganization({ id, name, description, logo, slug }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
      void queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
  });
}

export default useUpdateOrganization;
