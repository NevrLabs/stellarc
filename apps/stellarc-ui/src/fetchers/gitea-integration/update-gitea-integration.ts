import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono";

export type UpdateGiteaIntegrationRequest = InferRequestType<
  (typeof client)["gitea-integration"]["board"][":boardId"]["$patch"]
>["json"];

async function updateGiteaIntegration(
  boardId: string,
  json: UpdateGiteaIntegrationRequest,
) {
  const response = await client["gitea-integration"].board[":boardId"].$patch({
    param: { boardId },
    json,
  });

  if (!response.ok) {
    const error = await response
      .clone()
      .json()
      .catch(async () => ({
        message: (await response.text()) || "Request failed",
      }));
    throw new Error(
      typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Request failed",
    );
  }

  return response.json();
}

export default updateGiteaIntegration;
