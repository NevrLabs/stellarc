import { client } from "@kaneo/libs";
import type Task from "@/types/task";

type UpdateTaskAssigneePayload = Pick<Task, "userId" | "teamId">;

async function updateTaskAssignee(
  taskId: string,
  task: UpdateTaskAssigneePayload,
) {
  const response = await client.task.assignee[":id"].$put({
    param: { id: taskId },
    json: {
      // Unassigning must send null, NOT "". assignee_id/team_assignee_id are
      // FK columns, so an empty string reaches Postgres as a literal id that
      // matches no user/team and the UPDATE fails — a 500 on every assign and
      // unassign from the UI, while a direct API call with null succeeded.
      userId: task.userId ?? null,
      teamId: task.teamId ?? null,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default updateTaskAssignee;
