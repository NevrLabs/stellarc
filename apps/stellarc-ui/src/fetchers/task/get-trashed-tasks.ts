import { client } from "@kaneo/libs";

/**
 * Recycle bin listing (#53): soft-deleted tasks for a whole organization.
 * The API returns the board name and who deleted the row, so the UI can group
 * without a second round trip.
 */
async function getTrashedTasks(organizationId: string) {
  const response = await client.task.trash.organization[":organizationId"].$get(
    {
      param: { organizationId },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default getTrashedTasks;
