import { client } from "@kaneo/libs";

/**
 * Restores a soft-deleted task (#53): clears deletedAt/deletedBy so the task
 * reappears on its board.
 */
async function restoreTask(taskId: string) {
  const response = await client.task.trash[":id"].restore.$post({
    param: { id: taskId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default restoreTask;
