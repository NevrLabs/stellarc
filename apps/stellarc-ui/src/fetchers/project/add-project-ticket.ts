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
  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data as ProjectTicket;
}

export default addProjectTicket;
