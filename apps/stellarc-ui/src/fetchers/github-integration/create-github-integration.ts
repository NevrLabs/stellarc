import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono";

export type CreateGithubIntegrationRequest = InferRequestType<
  (typeof client)["github-integration"]["board"][":boardId"]["$post"]
>["json"];

async function createGithubIntegration(
  boardId: string,
  data: CreateGithubIntegrationRequest,
) {
  const response = await client["github-integration"].board[":boardId"].$post({
    param: { boardId },
    json: data,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const result = await response.json();
  return result;
}

export default createGithubIntegration;
