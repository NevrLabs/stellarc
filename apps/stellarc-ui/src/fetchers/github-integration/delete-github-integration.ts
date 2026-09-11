import { client } from "@kaneo/libs";

async function deleteGithubIntegration(boardId: string) {
  const response = await client["github-integration"].board[":boardId"].$delete(
    {
      param: { boardId },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const result = await response.json();
  return result;
}

export default deleteGithubIntegration;
