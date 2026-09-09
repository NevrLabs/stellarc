import { client } from "@kaneo/libs";

/**
 * KFL-339: follow / unfollow a ticket. Idempotent on both sides, so a
 * double-click can never produce a duplicate subscription or a 4xx.
 */
async function setTaskFollowing(taskId: string, following: boolean) {
  const response = await client.task.following[":id"].$put({
    param: { id: taskId },
    json: { following },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default setTaskFollowing;
