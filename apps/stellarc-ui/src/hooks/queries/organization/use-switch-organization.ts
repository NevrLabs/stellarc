import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type IdentityMutation, identitySend } from "@/lib/identity-client";
import type { OrganizationPublic } from "@/lib/identity-collections";

// §3 POST /api/identity/active-org: membership-authorized session switch.
// The frozen switcher component keeps calling this hook-shaped flow through
// the authClient import at its call site; this hook is the identity-native
// path for new consumers and for the switcher once the component is next
// touched by an owning slice.
function useSwitchOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const result = await identitySend<
        IdentityMutation<{ organization: OrganizationPublic }>
      >("/active-org", "POST", { organizationId });
      return result.data.organization;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["identity"] });
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export default useSwitchOrganization;
