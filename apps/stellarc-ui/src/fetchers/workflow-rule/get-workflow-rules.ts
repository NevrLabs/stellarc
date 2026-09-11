import { client } from "@kaneo/libs";

async function getWorkflowRules(boardId: string) {
  const response = await client["workflow-rule"][":boardId"].$get({
    param: { boardId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default getWorkflowRules;
