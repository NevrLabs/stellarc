import { client } from "@kaneo/libs";

export type CreateTaskFlagRequest = {
  taskId: string;
  flagTypeId: string;
  targetUserId?: string | null;
  targetTeamId?: string | null;
  note?: string | null;
};

/**
 * The API requires EXACTLY ONE of targetUserId / targetTeamId. Sending both or
 * neither is a 400, so we refuse locally rather than round-trip a bad request.
 */
async function createTaskFlag({
  taskId,
  flagTypeId,
  targetUserId,
  targetTeamId,
  note,
}: CreateTaskFlagRequest) {
  const hasUser = Boolean(targetUserId);
  const hasTeam = Boolean(targetTeamId);

  if (hasUser === hasTeam) {
    throw new Error(
      "A flag needs exactly one target: either a user or a team, not both.",
    );
  }

  const response = await client.flag.task[":taskId"].$post({
    param: { taskId },
    json: {
      flagTypeId,
      ...(hasUser ? { targetUserId } : {}),
      ...(hasTeam ? { targetTeamId } : {}),
      ...(note ? { note } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default createTaskFlag;
