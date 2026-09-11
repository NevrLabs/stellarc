import { client } from "@kaneo/libs";

/**
 * KFL-339: is the CURRENT user subscribed to this ticket's notifications?
 *
 * Gated on READ access server-side, not `task:update` — following is a personal
 * subscription, so a read-only member must still be able to follow.
 */
async function getTaskFollowing(taskId: string) {
  const response = await client.task.following[":id"].$get({
    param: { id: taskId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default getTaskFollowing;
