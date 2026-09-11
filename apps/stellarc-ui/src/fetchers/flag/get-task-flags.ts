import { client } from "@kaneo/libs";

export type TaskFlag = {
  id: string;
  taskId: string;
  flagTypeId: string;
  flagTypeName: string;
  flagTypeColor: string | null;
  flagTypeIcon: string | null;
  flaggedBy: string | null;
  flaggedByName: string | null;
  targetUserId: string | null;
  targetUserName: string | null;
  targetTeamId: string | null;
  targetTeamName: string | null;
  note: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  createdAt: string | null;
};

export type GetTaskFlagsRequest = {
  taskId: string;
  includeResolved?: boolean;
};

async function getTaskFlags({ taskId, includeResolved }: GetTaskFlagsRequest) {
  const response = await client.flag.task[":taskId"].$get({
    param: { taskId },
    query: includeResolved ? { includeResolved: "true" } : {},
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as TaskFlag[];
}

export default getTaskFlags;
