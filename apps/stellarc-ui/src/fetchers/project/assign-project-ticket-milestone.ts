import { client } from "@kaneo/libs";
export default async function assignProjectTicketMilestone({
  projectId,
  taskId,
  projectMilestoneId,
}: {
  projectId: string;
  taskId: string;
  projectMilestoneId: string | null;
}) {
  const response = await client.project[":id"].tickets[":taskId"].$put({
    param: { id: projectId, taskId },
    json: { projectMilestoneId },
  });
  if (!response.ok) throw new Error(await response.text());
  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}
