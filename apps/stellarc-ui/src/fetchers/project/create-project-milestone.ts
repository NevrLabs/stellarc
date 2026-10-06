import { client } from "@kaneo/libs";
export default async function createProjectMilestone({
  projectId,
  name,
  description,
  targetDate,
  rank,
}: {
  projectId: string;
  name: string;
  description?: string | null;
  targetDate?: string | null;
  rank?: number;
}) {
  const response = await client.project[":id"].milestones.$post({
    param: { id: projectId },
    json: {
      name,
      description: description ?? null,
      targetDate: targetDate ?? null,
      rank,
    },
  });
  if (!response.ok) throw new Error(await response.text());
  // stellarc wraps mutations in Mutation<T> = {data, txid}; the frozen
  // fork client reads the bare resource — unwrap at the adapter seam.
  const payload = await response.json();
  return payload.data;
}
