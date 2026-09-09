import { client } from "@kaneo/libs";

async function deleteGiteaIntegration(boardId: string) {
  const response = await client["gitea-integration"].board[":boardId"].$delete({
    param: { boardId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default deleteGiteaIntegration;
