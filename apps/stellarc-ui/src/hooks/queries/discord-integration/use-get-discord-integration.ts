import { useQuery } from "@tanstack/react-query";
import getDiscordIntegration from "@/fetchers/discord-integration/get-discord-integration";

function useGetDiscordIntegration(boardId: string) {
  return useQuery({
    queryKey: ["discord-integration", boardId],
    queryFn: () => getDiscordIntegration(boardId),
    enabled: Boolean(boardId),
  });
}

export default useGetDiscordIntegration;
