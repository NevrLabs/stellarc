import { useMutation, useQueryClient } from "@tanstack/react-query";
import i18n from "i18next";
import deleteNotificationOrganizationRule from "@/fetchers/notification-preferences/delete-notification-organization-rule";
import updateNotificationPreferences, {
  type UpdateNotificationPreferencesRequest,
} from "@/fetchers/notification-preferences/update-notification-preferences";
import upsertNotificationOrganizationRule, {
  type UpsertNotificationOrganizationRuleRequest,
} from "@/fetchers/notification-preferences/upsert-notification-organization-rule";
import { toast } from "@/lib/toast";

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (json: UpdateNotificationPreferencesRequest) =>
      updateNotificationPreferences(json),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
      toast.success(i18n.t("settings:notificationsPage.toastPreferencesSaved"));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : i18n.t("settings:notificationsPage.toastPreferencesSaveFailed"),
      );
    },
  });
}

export function useUpsertNotificationOrganizationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      json,
    }: {
      organizationId: string;
      json: UpsertNotificationOrganizationRuleRequest;
    }) => upsertNotificationOrganizationRule(organizationId, json),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
      toast.success(i18n.t("settings:notificationsPage.toastRuleSavedGeneric"));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : i18n.t("settings:notificationsPage.toastRuleSaveFailed", {}),
      );
    },
  });
}

export function useDeleteNotificationOrganizationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (organizationId: string) =>
      deleteNotificationOrganizationRule(organizationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
      toast.success(
        i18n.t("settings:notificationsPage.toastRuleRemovedGeneric"),
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : i18n.t("settings:notificationsPage.toastRuleRemoveFailed", {}),
      );
    },
  });
}
