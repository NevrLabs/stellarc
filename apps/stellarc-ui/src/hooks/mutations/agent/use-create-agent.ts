import { useMutation, useQueryClient } from "@tanstack/react-query";
import createAgent from "@/fetchers/agent/create-agent";
import { invalidateAgentMembershipQueries } from "./invalidate-agent-membership-queries";

export function useCreateAgent(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAgent,
    onSuccess: () =>
      // #123: a new agent is a new member, so the Members page and member
      // lists must refresh alongside the `agents` query.
      invalidateAgentMembershipQueries(queryClient, organizationId),
  });
}

export default useCreateAgent;
