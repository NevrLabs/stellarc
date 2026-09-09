import { getApiUrl } from "@/fetchers/get-api-url";

async function deleteNotification(notificationId: string): Promise<void> {
  const response = await fetch(getApiUrl(`/notification/${notificationId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export default deleteNotification;
