import { useQuery } from "@tanstack/react-query";
import getGenericWebhookIntegration from "@/fetchers/generic-webhook-integration/get-generic-webhook-integration";

function useGetGenericWebhookIntegration(boardId: string) {
  return useQuery({
    queryKey: ["generic-webhook-integration", boardId],
    queryFn: () => getGenericWebhookIntegration(boardId),
    enabled: Boolean(boardId),
  });
}

export default useGetGenericWebhookIntegration;
