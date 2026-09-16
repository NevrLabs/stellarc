import { useMutation } from "@tanstack/react-query";
import deleteOrganization from "@/fetchers/organization/delete-organization";

type DeleteOrganizationRequest = {
  organizationId: string;
};

// §2/§3: the identity runtime has no org-delete in this slice; the server
// answers 405 and this hook surfaces that as a typed error instead of
// silently pretending to delete.
function useDeleteOrganization() {
  return useMutation({
    mutationFn: async ({ organizationId }: DeleteOrganizationRequest) =>
      deleteOrganization({ id: organizationId }),
  });
}

export default useDeleteOrganization;
