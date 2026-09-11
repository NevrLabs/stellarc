import { useQuery } from "@tanstack/react-query";
import getAiSettings from "@/fetchers/ai/get-ai-settings";

function useGetAiSettings(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["ai-settings", organizationId] as const,
    queryFn: () => getAiSettings(organizationId as string),
    enabled: !!organizationId,
  });
}

export default useGetAiSettings;
