import { getApiUrl } from "@/fetchers/get-api-url";
import type { NotificationPreferences } from "./get-notification-preferences";

export type UpsertNotificationOrganizationRuleRequest = {
  isActive: boolean;
  emailEnabled: boolean;
  ntfyEnabled: boolean;
  gotifyEnabled: boolean;
  webhookEnabled: boolean;
  boardMode: "all" | "selected";
  selectedBoardIds?: string[];
};

async function upsertNotificationOrganizationRule(
  organizationId: string,
  json: UpsertNotificationOrganizationRuleRequest,
): Promise<NotificationPreferences> {
  const response = await fetch(
    getApiUrl(`/notification-preferences/organizations/${organizationId}`),
    {
      body: JSON.stringify(json),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as NotificationPreferences;
}

export default upsertNotificationOrganizationRule;
