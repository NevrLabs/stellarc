import { client } from "@kaneo/libs";

async function upsertWorkflowRule(
  boardId: string,
  data: { integrationType: string; eventType: string; columnId: string },
) {
  const response = await client["workflow-rule"][":boardId"].$put({
    param: { boardId },
    json: data,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default upsertWorkflowRule;
