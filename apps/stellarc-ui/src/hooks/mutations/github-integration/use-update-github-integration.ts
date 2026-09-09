import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateGithubIntegration, {
  type UpdateGithubIntegrationRequest,
} from "@/fetchers/github-integration/update-github-integration";

export function useUpdateGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      json,
    }: {
      boardId: string;
      json: UpdateGithubIntegrationRequest;
    }) => updateGithubIntegration(boardId, json),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["github-integration", boardId],
      });
    },
  });
}
