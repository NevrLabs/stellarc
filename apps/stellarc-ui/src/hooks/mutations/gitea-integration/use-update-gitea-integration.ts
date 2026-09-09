import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateGiteaIntegration, {
  type UpdateGiteaIntegrationRequest,
} from "@/fetchers/gitea-integration/update-gitea-integration";

export function useUpdateGiteaIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      json,
    }: {
      boardId: string;
      json: UpdateGiteaIntegrationRequest;
    }) => updateGiteaIntegration(boardId, json),
    onSuccess: (_, { boardId }) => {
      queryClient.invalidateQueries({
        queryKey: ["gitea-integration", boardId],
      });
    },
  });
}
