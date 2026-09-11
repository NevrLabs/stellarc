import { useQuery } from "@tanstack/react-query";
import getAgents from "@/fetchers/agent/get-agents";

function useGetAgents(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["agents", organizationId] as const,
    queryFn: () => getAgents(organizationId as string),
    enabled: !!organizationId,
  });
}

export default useGetAgents;
