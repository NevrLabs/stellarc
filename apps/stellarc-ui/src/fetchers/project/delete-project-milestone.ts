import { client } from "@kaneo/libs";
export default async function deleteProjectMilestone({
  projectId,
  milestoneId,
}: {
  projectId: string;
  milestoneId: string;
}) {
  const response = await client.project[":id"].milestones[
    ":milestoneId"
  ].$delete({ param: { id: projectId, milestoneId } });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
