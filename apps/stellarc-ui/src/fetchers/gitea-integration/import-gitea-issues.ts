import { client } from "@kaneo/libs";

async function importGiteaIssues(boardId: string) {
  const response = await client["gitea-integration"]["import-issues"].$post({
    json: { boardId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default importGiteaIssues;
