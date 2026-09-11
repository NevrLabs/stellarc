import { client } from "@kaneo/libs";

/**
 * Hard-deletes a trashed task (#53). Irreversible - the API also purges the
 * task's S3 attachments - so callers must confirm first.
 */
async function permanentlyDeleteTask(taskId: string) {
  const response = await client.task.trash[":id"].$delete({
    param: { id: taskId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default permanentlyDeleteTask;
