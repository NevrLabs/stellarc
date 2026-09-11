import { client } from "@kaneo/libs";
export default async function reopenProjectMilestone({
  projectId,
  milestoneId,
}: {
  projectId: string;
  milestoneId: string;
}) {
  const response = await client.project[":id"].milestones[
    ":milestoneId"
  ].reopen.$put({ param: { id: projectId, milestoneId } });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
