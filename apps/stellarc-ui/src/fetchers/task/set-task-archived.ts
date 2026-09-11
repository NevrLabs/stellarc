import { client } from "@kaneo/libs";

/**
 * #226: archive / unarchive a task.
 *
 * Archival is ORTHOGONAL to status. It used to be written as
 * `status: "archived"`, which destroyed the ticket's real workflow state — and
 * since migration 0062 dropped `"archived"` from the valid status vocabulary,
 * that old write path now fails validation with:
 *
 *   Invalid status "archived". Valid statuses for this board: ...
 *
 * So archival goes through this dedicated endpoint, which only ever touches
 * `task.archived_at` and leaves `status` alone. Unarchiving needs no stored
 * "previous status" because the status was never disturbed.
 */
async function setTaskArchived(taskId: string, archived: boolean) {
  const response = await client.task.archived[":id"].$put({
    param: { id: taskId },
    json: { archived },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default setTaskArchived;
