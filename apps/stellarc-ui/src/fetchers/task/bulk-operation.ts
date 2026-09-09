import { client } from "@kaneo/libs";

type BulkOperationType =
  | "updateStatus"
  | "updatePriority"
  | "updateAssignee"
  | "updateTeam"
  | "delete"
  | "addLabel"
  | "removeLabel"
  | "updateDueDate"
  /**
   * #226: archival is orthogonal to status. Bulk archive used to be sent as
   * `updateStatus: "archived"`, which now fails validation because "archived"
   * is not a status. These operations write `archived_at` and take no value.
   */
  | "archive"
  | "unarchive";

async function bulkOperation({
  taskIds,
  operation,
  value,
}: {
  taskIds: string[];
  operation: BulkOperationType;
  value?: string | null;
}) {
  const response = await client.task.bulk.$patch({
    json: { taskIds, operation, value },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default bulkOperation;
