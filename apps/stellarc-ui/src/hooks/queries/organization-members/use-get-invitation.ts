import { useQuery } from "@tanstack/react-query";
import { identityGet } from "@/lib/identity-client";

type GetInvitationRequest = {
  invitationId: string;
};

function useGetInvitation({ invitationId }: GetInvitationRequest) {
  return useQuery({
    queryKey: ["invitation", invitationId],
    enabled: !!invitationId,
    queryFn: () =>
      identityGet<Record<string, unknown>>(
        `/invitations/${encodeURIComponent(invitationId)}/details`,
      ),
  });
}

export default useGetInvitation;
