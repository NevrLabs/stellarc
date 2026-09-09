import { client } from "@kaneo/libs";

export type ProjectMilestone = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  rank: number;
  completedAt: string | null;
  completedBy: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
  progress: { completed: number; eligible: number; percent: number | null };
};

async function getProjectMilestones({
  projectId,
}: {
  projectId: string;
}): Promise<ProjectMilestone[]> {
  const response = await client.project[":id"].milestones.$get({
    param: { id: projectId },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<ProjectMilestone[]>;
}
export default getProjectMilestones;
