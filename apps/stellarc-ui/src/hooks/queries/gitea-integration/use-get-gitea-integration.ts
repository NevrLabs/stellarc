import { useQuery } from "@tanstack/react-query";
import getGiteaIntegration from "@/fetchers/gitea-integration/get-gitea-integration";

function useGetGiteaIntegration(boardId: string) {
  return useQuery({
    queryKey: ["gitea-integration", boardId],
    queryFn: () => getGiteaIntegration(boardId),
    enabled: !!boardId,
  });
}

export default useGetGiteaIntegration;
