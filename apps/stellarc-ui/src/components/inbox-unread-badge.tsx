import { useTranslation } from "react-i18next";
import useGetUnreadNotificationCount from "@/hooks/queries/notification/use-get-unread-notification-count";

/**
 * Unread-count badge for the sidebar Inbox entry (#58).
 *
 * Self-contained on purpose: the sidebar is being overhauled separately, so
 * this mounts with a single line inside the existing Inbox menu button.
 * Renders nothing at all when there is nothing unread — no "0" badge.
 */
function InboxUnreadBadge() {
  const { t } = useTranslation();
  const { data } = useGetUnreadNotificationCount();
  const unreadCount = data?.count ?? 0;

  if (unreadCount === 0) return null;

  return (
    <span
      aria-label={t("inbox:unreadCount", { count: unreadCount })}
      role="status"
      className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-sidebar-primary px-1 font-semibold text-[10px] text-sidebar-primary-foreground leading-none"
      data-testid="inbox-unread-badge"
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}

export default InboxUnreadBadge;
