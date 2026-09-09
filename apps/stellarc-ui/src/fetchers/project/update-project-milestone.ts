import { client } from "@kaneo/libs";
export default async function updateProjectMilestone({
  projectId,
  milestoneId,
  name,
  description,
  targetDate,
  rank,
}: {
  projectId: string;
  milestoneId: string;
  name?: string;
  description?: string | null;
  targetDate?: string | null;
  rank?: number;
}) {
  const response = await client.project[":id"].milestones[":milestoneId"].$put({
    param: { id: projectId, milestoneId },
    json: { name, description, targetDate, rank },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
