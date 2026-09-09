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
  return response.json() as Promise<{ ok: boolean }>;
}

export default removeProjectTicket;
