import { client } from "@kaneo/libs";

async function getGithubIntegration(boardId: string) {
  const response = await client["github-integration"].board[":boardId"].$get({
    param: { boardId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default getGithubIntegration;
