import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteAgent from "@/fetchers/agent/delete-agent";
import { invalidateAgentMembershipQueries } from "./invalidate-agent-membership-queries";

export function useDeleteAgent(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAgent,
    onSuccess: () =>
      // #123: an agent is also a member, so the Members page and every member
      // list have to be refreshed too — not just the `agents` query.
      invalidateAgentMembershipQueries(queryClient, organizationId),
  });
}

export default useDeleteAgent;
