import { client } from "@kaneo/libs";

async function removeProjectTicket({
  id,
  taskId,
}: {
  id: string;
  taskId: string;
}) {
  const response = await client.project[":id"].tickets[":taskId"].$delete({
    param: { id, taskId },
  });
  if (!response.ok) throw new Error(await response.text());
  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}

export default removeProjectTicket;
