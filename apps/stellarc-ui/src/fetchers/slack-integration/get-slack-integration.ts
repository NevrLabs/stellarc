import { getApiUrl } from "@/fetchers/get-api-url";

export type SlackIntegration = {
  id: string;
  boardId: string;
  channelName: string | null;
  webhookConfigured: boolean;
  maskedWebhookUrl: string;
  events: {
    taskCreated: boolean;
    taskStatusChanged: boolean;
    taskPriorityChanged: boolean;
    taskTitleChanged: boolean;
    taskDescriptionChanged: boolean;
    taskCommentCreated: boolean;
  };
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
} | null;

async function getSlackIntegration(boardId: string) {
  const response = await fetch(
    getApiUrl(`/slack-integration/board/${boardSlug}`),
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as SlackIntegration;
}

export default getSlackIntegration;
