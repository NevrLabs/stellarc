import { useMutation, useQueryClient } from "@tanstack/react-query";
import createGenericWebhookIntegration, {
  type CreateGenericWebhookIntegrationRequest,
} from "@/fetchers/generic-webhook-integration/create-generic-webhook-integration";
import deleteGenericWebhookIntegration from "@/fetchers/generic-webhook-integration/delete-generic-webhook-integration";
import updateGenericWebhookIntegration, {
  type UpdateGenericWebhookIntegrationRequest,
} from "@/fetchers/generic-webhook-integration/update-generic-webhook-integration";

export function useCreateGenericWebhookIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      data,
    }: {
      boardId: string;
      data: CreateGenericWebhookIntegrationRequest;
    }) => createGenericWebhookIntegration(boardId, data),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["generic-webhook-integration", boardId],
      });
    },
  });
}

export function useUpdateGenericWebhookIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      json,
    }: {
      boardId: string;
      json: UpdateGenericWebhookIntegrationRequest;
    }) => updateGenericWebhookIntegration(boardId, json),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["generic-webhook-integration", boardId],
      });
    },
  });
}

export function useDeleteGenericWebhookIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => deleteGenericWebhookIntegration(boardId),
    onSuccess: (_, boardId) => {
      void queryClient.invalidateQueries({
        queryKey: ["generic-webhook-integration", boardId],
      });
    },
  });
}
