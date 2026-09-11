import { useNavigate } from "@tanstack/react-router";
import { Bell, ChevronDown, X } from "lucide-react";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { KbdSequence } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import useClearNotifications from "@/hooks/mutations/notification/use-clear-notifications";
import useDeleteNotification from "@/hooks/mutations/notification/use-delete-notification";
import useMarkAllNotificationsAsRead from "@/hooks/mutations/notification/use-mark-all-notifications-as-read";
import useMarkNotificationAsRead from "@/hooks/mutations/notification/use-mark-notification-as-read";
import useGetNotifications from "@/hooks/queries/notification/use-get-notifications";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import { getPriorityLabel, getStatusLabel } from "@/lib/i18n/domain";
import type { Notification } from "@/types/notification";

export type NotificationDropdownRef = {
  toggle: () => void;
};

export type NotificationGroup = {
  key: string;
  taskTitle: string | null;
  taskNumber: number | null;
  notifications: Notification[];
  latestCreatedAt: string;
  unreadCount: number;
};

function getEventDataRecord(
  eventData: unknown,
): Record<string, unknown> | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }

  return eventData as Record<string, unknown>;
}

export function groupNotifications(
  notifications: Notification[],
): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup & { firstIndex: number }>();
  notifications.forEach((notification, index) => {
    const isTask =
      notification.resourceType === "task" && Boolean(notification.resourceId);
    const key = isTask
      ? `task:${notification.resourceId}`
      : `notification:${notification.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.notifications.push(notification);
      existing.unreadCount += notification.isRead ? 0 : 1;
      if (
        Date.parse(notification.createdAt) >
        Date.parse(existing.latestCreatedAt)
      )
        existing.latestCreatedAt = notification.createdAt;
      return;
    }
    const eventData = getEventDataRecord(notification.eventData);
    groups.set(key, {
      key,
      taskTitle:
        isTask && typeof eventData?.taskTitle === "string"
          ? eventData.taskTitle
          : null,
      taskNumber:
        isTask && typeof eventData?.taskNumber === "number"
          ? eventData.taskNumber
          : null,
      notifications: [notification],
      latestCreatedAt: notification.createdAt,
      unreadCount: notification.isRead ? 0 : 1,
      firstIndex: index,
    });
  });
  return [...groups.values()]
    .map(({ firstIndex: _firstIndex, ...group }) => ({
      ...group,
      notifications: [...group.notifications].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    }))
    .sort(
      (a, b) => Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt),
    );
}

function getReminderLeadTime(
  eventData: Record<string, unknown>,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const minutes = Number(eventData.leadTimeMinutes ?? 1440);
  if (minutes % 1440 === 0) {
    return t("notifications:reminderLeadTime.days", {
      count: minutes / 1440,
    });
  }
  if (minutes % 60 === 0) {
    return t("notifications:reminderLeadTime.hours", {
      count: minutes / 60,
    });
  }
  return t("notifications:reminderLeadTime.minutes", { count: minutes });
}

export function getNotificationTitle(
  notification: Notification,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const eventData = getEventDataRecord(notification.eventData);
  if (eventData) {
    switch (notification.type) {
      case "task_created":
        return t("notifications:events.task_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "organization_created":
        return t("notifications:events.organization_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_status_changed":
        return t("notifications:events.task_status_changed.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_title_changed":
      case "task_description_changed":
      case "task_priority_changed":
      case "task_due_date_changed":
      case "task_flag_raised":
      case "task_flag_resolved":
      case "task_unassigned":
      case "task_moved":
      case "task_label_assigned":
      case "task_label_unassigned":
        return t(`notifications:events.${notification.type}.title`, {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_assignee_changed":
        return t("notifications:events.task_assignee_changed.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "time_entry_created":
        return t("notifications:events.time_entry_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_mention":
        return t("notifications:events.task_mention.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_comment":
        return t("notifications:events.task_comment.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "due_date_reminder":
        return t("notifications:events.due_date_reminder.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_overdue":
        return t("notifications:events.task_overdue.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      default:
        break;
    }
  }

  return notification.title ?? notification.type;
}

export function getNotificationContent(
  notification: Notification,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const eventData = getEventDataRecord(notification.eventData);
  if (eventData) {
    switch (notification.type) {
      case "task_created":
        return t("notifications:events.task_created.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "organization_created":
        return t("notifications:events.organization_created.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "task_status_changed":
        return t("notifications:events.task_status_changed.content", {
          ...eventData,
          oldStatus: getStatusLabel(String(eventData.oldStatus ?? "")),
          newStatus: getStatusLabel(String(eventData.newStatus ?? "")),
          defaultValue: notification.content ?? "",
        });
      case "task_title_changed":
      case "task_description_changed":
      case "task_priority_changed":
      case "task_due_date_changed":
      case "task_flag_raised":
      case "task_flag_resolved":
      case "task_unassigned":
      case "task_moved":
      case "task_label_assigned":
      case "task_label_unassigned":
        return t(`notifications:events.${notification.type}.content`, {
          ...eventData,
          oldPriority: getPriorityLabel(String(eventData.oldPriority ?? "")),
          newPriority: getPriorityLabel(String(eventData.newPriority ?? "")),
          defaultValue: notification.content ?? "",
        });
      case "task_assignee_changed":
        return t("notifications:events.task_assignee_changed.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "time_entry_created":
        return eventData.taskTitle
          ? t("notifications:events.time_entry_created.contentWithTask", {
              ...eventData,
              defaultValue: notification.content ?? "",
            })
          : t("notifications:events.time_entry_created.contentWithoutTask", {
              ...eventData,
              defaultValue: notification.content ?? "",
            });
      case "task_mention":
        return t("notifications:events.task_mention.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "task_comment":
        return t("notifications:events.task_comment.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "due_date_reminder":
        return t("notifications:events.due_date_reminder.content", {
          ...eventData,
          leadTime: getReminderLeadTime(eventData, t),
          defaultValue: notification.content ?? "",
        });
      case "task_overdue":
        return t("notifications:events.task_overdue.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      default:
        break;
    }
  }

  return notification.content ?? "";
}

const NotificationDropdown = forwardRef<NotificationDropdownRef>(
  (_props, ref) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: notifications } = useGetNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const [showClearDialog, setShowClearDialog] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
      new Set(),
    );

    const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();
    const { mutate: clearAll } = useClearNotifications();
    const { mutate: deleteNotifications } = useDeleteNotification();
    const { mutate: markAsRead } = useMarkNotificationAsRead();

    const handleNotificationClick = useCallback(
      (notification: Notification) => {
        if (!notification.isRead) {
          markAsRead(notification.id);
        }

        const ed = getEventDataRecord(notification.eventData);
        const organizationId =
          typeof ed?.organizationId === "string" ? ed.organizationId : null;
        const boardId = typeof ed?.boardId === "string" ? ed.boardId : null;
        const taskId = notification.resourceId ?? null;

        if (
          notification.resourceType === "task" &&
          organizationId &&
          boardId &&
          taskId
        ) {
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
            params: {
              organizationSlug: organizationId,
              boardSlug: boardId,
              taskId,
            },
          });
        }
      },
      [markAsRead, navigate],
    );

    const unreadNotifications = notifications?.filter((n) => !n.isRead) || [];
    const hasNotifications = notifications && notifications.length > 0;
    const notificationGroups = groupNotifications(notifications ?? []);

    useImperativeHandle(ref, () => ({
      toggle: () => setIsOpen(!isOpen),
    }));

    const handleClearAll = () => {
      clearAll();
      setShowClearDialog(false);
    };

    useRegisterShortcuts({
      sequentialShortcuts: {
        [shortcuts.notification.prefix]: {
          [shortcuts.notification.open]: () => setIsOpen(!isOpen),
        },
      },
    });

    return (
      <>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadNotifications.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-sidebar transition-[scale,opacity] duration-200 ease-out starting:scale-75 starting:opacity-0 motion-reduce:starting:scale-100">
                        {unreadNotifications.length > 99
                          ? "99+"
                          : unreadNotifications.length}
                      </span>
                    )}
                    <span className="sr-only">
                      {t("navigation:notifications")}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p className="flex items-center gap-2">
                  <KbdSequence
                    keys={[
                      shortcuts.notification.prefix,
                      shortcuts.notification.open,
                    ]}
                    description={t("notifications:shortcuts.open")}
                  />
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenuContent align="end" className="w-88 p-0">
            <div className="overflow-hidden rounded-lg">
              <div className="flex h-10 items-center justify-between border-border/50 border-b pr-2 pl-3">
                <h3 className="font-medium text-sm">
                  {t("notifications:title")}
                </h3>
                {unreadNotifications.length > 0 && (
                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={() => markAllAsRead()}
                    className="min-h-0 w-auto cursor-pointer rounded-md px-1.5 py-1 text-muted-foreground text-xs sm:min-h-0 sm:text-xs data-highlighted:text-foreground"
                  >
                    {t("common:actions.markAllRead")}
                  </DropdownMenuItem>
                )}
              </div>

              <div className="relative max-h-80 overflow-y-auto p-1">
                {!hasNotifications ? (
                  <div className="flex flex-col items-center gap-1 py-10 text-center">
                    <Bell className="mb-1 size-5 text-muted-foreground/40" />
                    <p className="text-muted-foreground text-sm">
                      {t("notifications:emptyTitle")}
                    </p>
                    <p className="text-muted-foreground/60 text-xs">
                      {t("notifications:emptySubtitle")}
                    </p>
                  </div>
                ) : (
                  notificationGroups.flatMap((group) => {
                    const isTaskGroup = group.key.startsWith("task:");
                    const isExpanded = expandedGroups.has(group.key);
                    const clearButton = (
                      notificationIds: string[],
                      label: string,
                    ) => (
                      <button
                        type="button"
                        aria-label={label}
                        title={label}
                        className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          deleteNotifications(notificationIds);
                        }}
                      >
                        <X className="size-3.5" />
                      </button>
                    );
                    const rows = group.notifications.map((notification) => {
                      const content = getNotificationContent(notification, t);
                      return (
                        <DropdownMenuItem
                          key={notification.id}
                          onClick={() => handleNotificationClick(notification)}
                          className="group cursor-pointer items-start rounded-md px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "truncate text-sm transition-colors duration-150",
                                  notification.isRead
                                    ? "text-muted-foreground"
                                    : "font-medium text-foreground",
                                )}
                              >
                                {getNotificationTitle(notification, t)}
                              </span>
                              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">
                                {formatRelativeTime(notification.createdAt)}
                              </span>
                              {!notification.isRead && (
                                <span className="size-1.5 shrink-0 rounded-full bg-info" />
                              )}
                              {clearButton(
                                [notification.id],
                                t("common:actions.clear", {
                                  defaultValue: "Clear notification",
                                }),
                              )}
                            </div>
                            {content && (
                              <p
                                className={cn(
                                  "mt-0.5 line-clamp-1 text-xs transition-colors duration-150",
                                  notification.isRead
                                    ? "text-muted-foreground/60"
                                    : "text-muted-foreground",
                                )}
                              >
                                {content}
                              </p>
                            )}
                          </div>
                        </DropdownMenuItem>
                      );
                    });
                    if (!isTaskGroup) return rows;
                    const header = (
                      <div
                        key={`${group.key}:header`}
                        className="group flex w-full items-center rounded-md hover:bg-accent"
                      >
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                          onClick={() =>
                            setExpandedGroups((current) => {
                              const next = new Set(current);
                              if (next.has(group.key)) next.delete(group.key);
                              else next.add(group.key);
                              return next;
                            })
                          }
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-sm">
                                {group.taskNumber
                                  ? `#${group.taskNumber} · `
                                  : ""}
                                {group.taskTitle ??
                                  getNotificationTitle(
                                    group.notifications[0],
                                    t,
                                  )}
                              </span>
                              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">
                                {formatRelativeTime(group.latestCreatedAt)}
                              </span>
                            </div>
                            <p className="text-muted-foreground text-xs">
                              {group.notifications.length} events ·{" "}
                              {group.unreadCount} unread
                            </p>
                          </div>
                          <ChevronDown
                            className={cn(
                              "size-4 transition-transform",
                              isExpanded && "rotate-180",
                            )}
                          />
                        </button>
                        {clearButton(
                          group.notifications.map(({ id }) => id),
                          t("notifications:clearGroup", {
                            defaultValue: "Clear notification group",
                          }),
                        )}
                      </div>
                    );
                    return isExpanded ? [header, ...rows] : [header];
                  })
                )}
              </div>
              {hasNotifications && (
                <div className="border-border/50 border-t p-1">
                  <DropdownMenuItem
                    onClick={() => setShowClearDialog(true)}
                    className="min-h-0 cursor-pointer justify-center rounded-md px-2 py-1 text-muted-foreground/70 text-xs sm:min-h-0 sm:text-xs data-highlighted:text-destructive"
                  >
                    {t("notifications:clearAll")}
                  </DropdownMenuItem>
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("notifications:clearDialogTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("notifications:clearDialogDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" size="sm" />}>
                {t("common:actions.cancel")}
              </AlertDialogClose>
              <AlertDialogClose
                render={
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleClearAll}
                  />
                }
              >
                {t("common:actions.clearAll")}
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);

NotificationDropdown.displayName = "NotificationDropdown";

export default NotificationDropdown;
