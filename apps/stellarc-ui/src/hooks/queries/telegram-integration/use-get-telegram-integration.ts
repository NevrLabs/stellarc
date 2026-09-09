import { useQuery } from "@tanstack/react-query";
import getTelegramIntegration from "@/fetchers/telegram-integration/get-telegram-integration";

function useGetTelegramIntegration(boardId: string) {
  return useQuery({
    queryKey: ["telegram-integration", boardId],
    queryFn: () => getTelegramIntegration(boardId),
    enabled: Boolean(boardId),
  });
}

export default useGetTelegramIntegration;
