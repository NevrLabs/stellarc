import { client } from "@kaneo/libs";

async function getTasks(boardId: string) {
  const response = await client.task.tasks[":boardId"].$get({
    param: { boardId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const json = await response.json();

  return json.data;
}

export default getTasks;
