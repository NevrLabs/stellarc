import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type TransferOwnershipRequest = {
  organizationId: string;
  newOwnerMemberId: string;
  currentOwnerMemberId: string;
};

// better-auth 1.6.9 has no dedicated transfer-ownership endpoint, so we
// perform two sequential updateMemberRole calls:
//
//   1. promote the new owner (allowed because the current user is owner)
//   2. demote the old owner to admin (now safe: the organization still has
//      another owner, so the "you cannot leave the organization as the only
//      owner" check passes)
//
// Order matters: if we demoted first, step 2 would 403 because no owner
// would be left. If step 2 fails, the organization ends up with two owners —
// recoverable by re-running the demote.
function useTransferOrganizationOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      newOwnerMemberId,
      currentOwnerMemberId,
    }: TransferOwnershipRequest) => {
      const promote = await authClient.organization.updateMemberRole({
        memberId: newOwnerMemberId,
        organizationId: organizationId,
        role: "owner",
      });
      if (promote.error) {
        throw new Error(promote.error.message || "Failed to promote new owner");
      }

      const demote = await authClient.organization.updateMemberRole({
        memberId: currentOwnerMemberId,
        organizationId: organizationId,
        role: "admin",
      });
      if (demote.error) {
        throw new Error(
          demote.error.message || "Failed to demote previous owner",
        );
      }

      return demote.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["organization", "full", variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["organization-members", variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["organization-member", "active"],
      });
      queryClient.invalidateQueries({
        queryKey: ["organization-capabilities", variables.organizationId],
      });
      queryClient.invalidateQueries({ queryKey: ["active-organization"] });
    },
  });
}

export default useTransferOrganizationOwnership;
