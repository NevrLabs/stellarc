import { useMutation } from "@tanstack/react-query";

type TransferOrganizationOwnershipRequest = {
  organizationId: string;
  userId: string;
};

// §1 UNASSIGNED/§5 baseline-scope rule: ownership transfer has no identity
// route in this slice. The hook exists so the frozen UI compiles, and always
// rejects rather than silently repointing to an unimplemented path.
function useTransferOrganizationOwnership() {
  return useMutation({
    mutationFn: async (_: TransferOrganizationOwnershipRequest) => {
      throw new Error("Ownership transfer is not available");
    },
  });
}

export default useTransferOrganizationOwnership;
