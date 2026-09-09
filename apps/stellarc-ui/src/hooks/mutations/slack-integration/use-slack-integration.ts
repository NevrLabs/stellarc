import { useMutation, useQueryClient } from "@tanstack/react-query";
import createSlackIntegration, {
  type CreateSlackIntegrationRequest,
} from "@/fetchers/slack-integration/create-slack-integration";
import deleteSlackIntegration from "@/fetchers/slack-integration/delete-slack-integration";
import updateSlackIntegration, {
  type UpdateSlackIntegrationRequest,
} from "@/fetchers/slack-integration/update-slack-integration";

export function useCreateSlackIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      data,
    }: {
      boardId: string;
      data: CreateSlackIntegrationRequest;
    }) => createSlackIntegration(boardId, data),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["slack-integration", boardId],
      });
    },
  });
}

export function useUpdateSlackIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      json,
    }: {
      boardId: string;
      json: UpdateSlackIntegrationRequest;
    }) => updateSlackIntegration(boardId, json),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["slack-integration", boardId],
      });
    },
  });
}

export function useDeleteSlackIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => deleteSlackIntegration(boardId),
    onSuccess: (_, boardId) => {
      void queryClient.invalidateQueries({
        queryKey: ["slack-integration", boardId],
      });
    },
  });
}
