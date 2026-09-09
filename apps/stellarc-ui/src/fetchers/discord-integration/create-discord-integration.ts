import { getApiUrl } from "@/fetchers/get-api-url";
import type { DiscordIntegration } from "./get-discord-integration";

export type CreateDiscordIntegrationRequest = {
  webhookUrl: string;
  channelName?: string;
  events?: {
    taskCreated?: boolean;
    taskStatusChanged?: boolean;
    taskPriorityChanged?: boolean;
    taskTitleChanged?: boolean;
    taskDescriptionChanged?: boolean;
    taskCommentCreated?: boolean;
  };
};

async function createDiscordIntegration(
  boardId: string,
  json: CreateDiscordIntegrationRequest,
) {
  const response = await fetch(
    getApiUrl(`/discord-integration/board/${boardSlug}`),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(json),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as DiscordIntegration;
}

export default createDiscordIntegration;
