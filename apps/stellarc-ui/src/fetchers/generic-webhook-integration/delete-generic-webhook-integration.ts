import { getApiUrl } from "@/fetchers/get-api-url";

async function deleteGenericWebhookIntegration(boardId: string) {
  const response = await fetch(
    getApiUrl(`/generic-webhook-integration/board/${boardSlug}`),
    {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default deleteGenericWebhookIntegration;
