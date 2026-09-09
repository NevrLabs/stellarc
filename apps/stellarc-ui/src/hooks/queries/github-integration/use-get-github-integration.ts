import { useQuery } from "@tanstack/react-query";
import getGithubIntegration from "@/fetchers/github-integration/get-github-integration";

function useGetGithubIntegration(boardId: string) {
  return useQuery({
    queryKey: ["github-integration", boardId],
    queryFn: () => getGithubIntegration(boardId),
    enabled: !!boardId,
  });
}

export default useGetGithubIntegration;
