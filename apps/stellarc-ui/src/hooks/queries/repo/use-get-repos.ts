import { useQuery } from "@tanstack/react-query";
import getRepos from "@/fetchers/repo/get-repos";

function useGetRepos({
  organizationId,
  enabled = true,
  teamId,
}: {
  organizationId: string;
  enabled?: boolean;
  teamId?: string | null;
}) {
  return useQuery({
    queryFn: () => getRepos(organizationId, teamId),
    queryKey: ["repos", organizationId, teamId ?? "all"],
    enabled: enabled && !!organizationId,
  });
}

export default useGetRepos;
