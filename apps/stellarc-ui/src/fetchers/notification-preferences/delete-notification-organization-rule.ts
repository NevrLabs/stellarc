import { getApiUrl } from "@/fetchers/get-api-url";
import type { NotificationPreferences } from "./get-notification-preferences";

async function deleteNotificationOrganizationRule(
  organizationId: string,
): Promise<NotificationPreferences> {
  const response = await fetch(
    getApiUrl(`/notification-preferences/organizations/${organizationId}`),
    {
      credentials: "include",
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as NotificationPreferences;
}

export default deleteNotificationOrganizationRule;
