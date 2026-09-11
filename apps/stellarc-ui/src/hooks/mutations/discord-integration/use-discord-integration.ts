import { useMutation, useQueryClient } from "@tanstack/react-query";
import createDiscordIntegration, {
  type CreateDiscordIntegrationRequest,
} from "@/fetchers/discord-integration/create-discord-integration";
import deleteDiscordIntegration from "@/fetchers/discord-integration/delete-discord-integration";
import updateDiscordIntegration, {
  type UpdateDiscordIntegrationRequest,
} from "@/fetchers/discord-integration/update-discord-integration";

export function useCreateDiscordIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      data,
    }: {
      boardId: string;
      data: CreateDiscordIntegrationRequest;
    }) => createDiscordIntegration(boardId, data),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["discord-integration", boardId],
      });
    },
  });
}

export function useUpdateDiscordIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      json,
    }: {
      boardId: string;
      json: UpdateDiscordIntegrationRequest;
    }) => updateDiscordIntegration(boardId, json),
    onSuccess: (_, { boardId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["discord-integration", boardId],
      });
    },
  });
}

export function useDeleteDiscordIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => deleteDiscordIntegration(boardId),
    onSuccess: (_, boardId) => {
      void queryClient.invalidateQueries({
        queryKey: ["discord-integration", boardId],
      });
    },
  });
}
