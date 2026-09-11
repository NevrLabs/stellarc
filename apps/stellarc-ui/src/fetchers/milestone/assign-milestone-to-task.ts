import { client } from "@kaneo/libs";

export type AssignMilestoneToTaskRequest = {
  boardId: string;
  taskId: string;
  milestoneId: string | null;
};

/**
 * Assigning is board-scoped: the route lives under /board/:boardId/task/:taskId
 * and a null milestoneId unassigns the task's milestone.
 */
async function assignMilestoneToTask({
  boardId,
  taskId,
  milestoneId,
}: AssignMilestoneToTaskRequest) {
  const response = await client.milestone.board[":boardId"].task[
    ":taskId"
  ].$put({
    param: {
      boardId,
      taskId,
    },
    json: {
      milestoneId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default assignMilestoneToTask;
