import { useMutation, useQueryClient } from "@tanstack/react-query";
import createTelegramIntegration, {
  type CreateTelegramIntegrationRequest,
} from "@/fetchers/telegram-integration/create-telegram-integration";
import deleteTelegramIntegration from "@/fetchers/telegram-integration/delete-telegram-integration";
import updateTelegramIntegration, {
  type UpdateTelegramIntegrationRequest,
} from "@/fetchers/telegram-integration/update-telegram-integration";

export function useCreateTelegramIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      data,
    }: {
      boardId: string;
      data: CreateTelegramIntegrationRequest;
    }) => createTelegramIntegration(boardId, data),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["telegram-integration", boardId],
      });
    },
  });
}

export function useUpdateTelegramIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      json,
    }: {
      boardId: string;
      json: UpdateTelegramIntegrationRequest;
    }) => updateTelegramIntegration(boardId, json),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["telegram-integration", boardId],
      });
    },
  });
}

export function useDeleteTelegramIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => deleteTelegramIntegration(boardId),
    onSuccess: (_, boardId) => {
      void queryClient.invalidateQueries({
        queryKey: ["telegram-integration", boardId],
      });
    },
  });
}
