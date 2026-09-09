import { client } from "@kaneo/libs";

/**
 * #265: remove a manually added resource link.
 *
 * `taskId` is required by the API: the permission gate resolves the task from
 * it, and the handler then verifies the link really belongs to that task, so a
 * forged id cannot reach another task's link. Integration-owned links are
 * rejected server-side — they are maintained by the sync, not by hand.
 */
async function deleteResourceLink({
  id,
  taskId,
}: {
  id: string;
  taskId: string;
}) {
  const response = await client["external-link"][":id"].$delete({
    param: { id },
    query: { taskId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default deleteResourceLink;
