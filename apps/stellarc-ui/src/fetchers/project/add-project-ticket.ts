import { client } from "@kaneo/libs";
import type { ProjectTicket } from "./get-project-tickets";

async function addProjectTicket({
  id,
  taskId,
  rank,
}: {
  id: string;
  taskId: string;
  rank?: number;
}) {
  const response = await client.project[":id"].tickets.$post({
    param: { id },
    json: { taskId, ...(rank === undefined ? {} : { rank }) },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<ProjectTicket>;
}

export default addProjectTicket;
