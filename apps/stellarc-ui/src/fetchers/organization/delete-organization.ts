import { IdentityApiError, identitySend } from "@/lib/identity-client";

type DeleteOrganizationRequest = {
  id: string;
};

// §2: runtime does not delete organizations in this slice (no owned
// cross-slice cascade policy). Surfaced as a typed error so the frozen UI's
// delete affordance degrades loudly instead of silently no-opping.
async function deleteOrganization({ id }: DeleteOrganizationRequest) {
  try {
    await identitySend(orgPath(id), "DELETE");
  } catch (error) {
    if (error instanceof IdentityApiError && error.status === 405) {
      throw new Error("Organization deletion is not available");
    }
    throw error;
  }
}

export default deleteOrganization;
