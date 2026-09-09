import { useMutation, useQueryClient } from "@tanstack/react-query";
import createGithubIntegration, {
  type CreateGithubIntegrationRequest,
} from "@/fetchers/github-integration/create-github-integration";
import deleteGithubIntegration from "@/fetchers/github-integration/delete-github-integration";
import verifyGithubInstallation, {
  type VerifyGithubInstallationRequest,
} from "@/fetchers/github-integration/verify-github-installation";

export function useCreateGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      data,
    }: {
      boardId: string;
      data: CreateGithubIntegrationRequest;
    }) => createGithubIntegration(boardId, data),
    onSuccess: (_, { boardId }) => {
      queryClient.invalidateQueries({
        queryKey: ["github-integration", boardId],
      });
    },
  });
}

export function useDeleteGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => deleteGithubIntegration(boardId),
    onSuccess: (_, boardId) => {
      queryClient.invalidateQueries({
        queryKey: ["github-integration", boardId],
      });
    },
  });
}

export function useVerifyGithubInstallation() {
  return useMutation({
    mutationFn: (data: VerifyGithubInstallationRequest) =>
      verifyGithubInstallation(data),
  });
}
