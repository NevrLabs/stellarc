import { useMutation, useQueryClient } from "@tanstack/react-query";
import createGiteaIntegration, {
  type CreateGiteaIntegrationRequest,
} from "@/fetchers/gitea-integration/create-gitea-integration";
import deleteGiteaIntegration from "@/fetchers/gitea-integration/delete-gitea-integration";
import verifyGiteaAccess, {
  type VerifyGiteaAccessRequest,
} from "@/fetchers/gitea-integration/verify-gitea-access";

export function useCreateGiteaIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      data,
    }: {
      boardId: string;
      data: CreateGiteaIntegrationRequest;
    }) => createGiteaIntegration(boardId, data),
    onSuccess: (_, { boardId }) => {
      queryClient.invalidateQueries({
        queryKey: ["gitea-integration", boardId],
      });
    },
  });
}

export function useDeleteGiteaIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => deleteGiteaIntegration(boardId),
    onSuccess: (_, boardId) => {
      queryClient.invalidateQueries({
        queryKey: ["gitea-integration", boardId],
      });
    },
  });
}

export function useVerifyGiteaAccess() {
  return useMutation({
    mutationFn: (data: VerifyGiteaAccessRequest) => verifyGiteaAccess(data),
  });
}
