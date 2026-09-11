import { useQuery } from "@tanstack/react-query";
import getSlackIntegration from "@/fetchers/slack-integration/get-slack-integration";

function useGetSlackIntegration(boardId: string) {
  return useQuery({
    queryKey: ["slack-integration", boardId],
    queryFn: () => getSlackIntegration(boardId),
    enabled: Boolean(boardId),
  });
}

export default useGetSlackIntegration;
