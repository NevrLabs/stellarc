import { client } from "@kaneo/libs";

async function getUnreadNotificationCount() {
  const response = await client.notification["unread-count"].$get();

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getUnreadNotificationCount;
