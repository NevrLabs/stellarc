import { client } from "@kaneo/libs";

export type ProjectProgress = {
  completed: number;
  eligible: number;
  percent: number | null;
};

export type ProjectTicket = {
  id: string;
  boardId: string;
  boardSlug: string;
  boardName: string;
  number: number;
  key: string;
  title: string;
  status: string;
  priority: string | null;
  archivedAt: string | null;
  startDate: string | null;
  dueDate: string | null;
  projectMilestoneId: string | null;
  rank: number;
  addedAt: string;
  addedBy: string;
};

async function getProjectTickets({ id }: { id: string }) {
  const response = await client.project[":id"].tickets.$get({ param: { id } });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{
    tickets: ProjectTicket[];
    progress: ProjectProgress;
  }>;
}

export default getProjectTickets;
