import { useQuery } from "@tanstack/react-query";
import { identityGet } from "@/lib/identity-client";
import type { InvitationPublic } from "@/lib/identity-collections";

function useGetUserInvitations() {
  return useQuery({
    queryKey: ["invitations", "user"],
    queryFn: () => identityGet<InvitationPublic[]>("/invitations/pending"),
  });
}

export default useGetUserInvitations;
