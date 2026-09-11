import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  CheckCheck,
  ChevronDown,
  Flag,
  Inbox as InboxIcon,
  LayoutDashboard,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import {
  getNotificationContent,
  getNotificationTitle,
} from "@/components/notification/notification-dropdown";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
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
import useClearNotifications from "@/hooks/mutations/notification/use-clear-notifications";
import useDeleteNotification from "@/hooks/mutations/notification/use-delete-notification";
import useMarkAllNotificationsAsRead from "@/hooks/mutations/notification/use-mark-all-notifications-as-read";
import useMarkNotificationAsRead from "@/hooks/mutations/notification/use-mark-notification-as-read";
import useGetNotifications from "@/hooks/queries/notification/use-get-notifications";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { formatRelativeTime } from "@/lib/format";
import {
  groupInboxNotifications,
  isFlaggedNotification,
} from "@/lib/group-inbox-notifications";
import type { Notification } from "@/types/notification";

type InboxSearch = {
  taskId?: string;
  boardId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/inbox",
)({
  component: InboxComponent,
  validateSearch: (search: Record<string, unknown>): InboxSearch => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    boardId: typeof search.boardId === "string" ? search.boardId : undefined,
  }),
});

function getEventDataRecord(
  eventData: unknown,
): Record<string, unknown> | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }
  return eventData as Record<string, unknown>;
}

/** Flag name + colour for a raised-flag notification (resolved live by the API
 *  from the task's active flag). Colour falls back to the destructive token. */
function getFlagMeta(notification: Notification): {
  name: string | null;
  color: string | null;
} {
  const data = getEventDataRecord(notification.eventData);
  return {
    name: typeof data?.flagTypeName === "string" ? data.flagTypeName : null,
    color: typeof data?.flagTypeColor === "string" ? data.flagTypeColor : null,
  };
}

/**
 * User Inbox (#58): every update on tasks related to the signed-in user,
 * across boards.
 *
 * The bell dropdown is going away with the sidebar overhaul, so the Inbox is
 * now the full surface: same item rendering (title/content resolution comes
 * from the dropdown module so the two never drift), read/unread affordance,
 * mark-as-read on click, mark-all-read and clear-all.
 */
export function InboxComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationSlug } = Route.useParams();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const { taskId: openTaskId, boardId: openBoardId } = Route.useSearch();
  const { data, isLoading } = useGetNotifications();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [collapsedBoards, setCollapsedBoards] = useState<Set<string>>(
    new Set(),
  );

  const { mutate: markAsRead } = useMarkNotificationAsRead();
  const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();
  const { mutate: clearAll } = useClearNotifications();
  // KFL-329: granular clearing — one notification, or one board group — on top
  // of the existing blunt clear-all. Both call DELETE /notification/:id.
  const { mutate: deleteNotifications } = useDeleteNotification();

  const notifications: Notification[] = data ?? [];
  // Flagged items are standing alerts, not "unread": they are excluded from the
  // unread count and get their own counter.
  const unreadCount = notifications.filter(
    (n) => !n.isRead && !isFlaggedNotification(n),
  ).length;
  const flaggedCount = notifications.filter(isFlaggedNotification).length;
  const boardGroups = groupInboxNotifications(notifications);

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // A raised flag can't be dismissed from the inbox; the user resolves it
      // by opening the ticket and unflagging. Only non-flagged items mark read.
      if (!notification.isRead && !isFlaggedNotification(notification)) {
        markAsRead(notification.id);
      }

      const eventData = getEventDataRecord(notification.eventData);
      const boardId =
        typeof eventData?.boardId === "string" ? eventData.boardId : null;
      const taskId = notification.resourceId ?? null;

      if (notification.resourceType === "task" && boardId && taskId) {
        // Open the ticket drawer OVER the inbox — stay on this route, just set
        // the search param the mounted TaskDetailsSheet reacts to.
        navigate({ to: ".", search: { taskId, boardId } });
      }
    },
    [markAsRead, navigate],
  );

  const handleCloseTaskSheet = useCallback(() => {
    navigate({ to: ".", search: {} });
  }, [navigate]);

  const handleClearAll = () => {
    clearAll();
    setShowClearDialog(false);
  };

  return (
    <OrganizationLayout title={t("inbox:title")}>
      <PageTitle title={t("inbox:title")} />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
          <h1 className="font-medium text-sm">{t("inbox:title")}</h1>
          <span className="text-muted-foreground text-xs">
            {t("inbox:count", { count: notifications.length })}
          </span>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-info/15 px-1.5 py-0.5 font-medium text-info text-xs">
              {t("inbox:unreadCount", { count: unreadCount })}
            </span>
          ) : null}
          {flaggedCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive text-xs">
              <Flag className="size-3" aria-hidden />
              {t("inbox:flaggedCount", { count: flaggedCount })}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {unreadCount > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => markAllAsRead()}
              >
                <CheckCheck className="size-3.5" />
                {t("common:actions.markAllRead")}
              </Button>
            ) : null}
            {notifications.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => setShowClearDialog(true)}
              >
                <Trash2 className="size-3.5" />
                {t("notifications:clearAll")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("inbox:loading")}
            </p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-10 text-center">
              <InboxIcon className="mb-1 size-5 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">
                {t("notifications:emptyTitle")}
              </p>
              <p className="text-muted-foreground/60 text-xs">
                {t("notifications:emptySubtitle")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {boardGroups.map((board) => {
                const collapsed = collapsedBoards.has(board.key);
                return (
                  <section
                    key={board.key}
                    className="overflow-hidden rounded-lg border border-border/80 bg-card"
                  >
                    <div className="flex items-center">
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        onClick={() =>
                          setCollapsedBoards((current) => {
                            const next = new Set(current);
                            if (next.has(board.key)) next.delete(board.key);
                            else next.add(board.key);
                            return next;
                          })
                        }
                        className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 text-left hover:bg-muted/40"
                      >
                        <LayoutDashboard className="size-4 text-muted-foreground" />
                        <span className="font-medium text-sm">
                          {board.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {board.tickets.length} tickets
                        </span>
                        <div className="ml-auto flex items-center gap-1.5">
                          {board.flaggedCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive text-xs">
                              <Flag className="size-3" aria-hidden />
                              {t("inbox:flaggedCount", {
                                count: board.flaggedCount,
                              })}
                            </span>
                          ) : null}
                          {board.unreadCount > 0 ? (
                            <span className="rounded-full bg-info/15 px-1.5 py-0.5 font-medium text-info text-xs">
                              {t("inbox:unreadCount", {
                                count: board.unreadCount,
                              })}
                            </span>
                          ) : null}
                        </div>
                        <ChevronDown
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            collapsed && "-rotate-90",
                          )}
                        />
                      </button>
                      {/* Group clear sits OUTSIDE the disclosure button: nesting
                        it would be invalid HTML and every clear would also
                        collapse the board. */}
                      <button
                        type="button"
                        aria-label={t("inbox:clearGroup")}
                        title={t("inbox:clearGroup")}
                        onClick={() =>
                          deleteNotifications(
                            board.tickets.flatMap((ticket) =>
                              ticket.notifications.map(
                                (notification) => notification.id,
                              ),
                            ),
                          )
                        }
                        className="mr-2 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {collapsed ? null : (
                      <div className="border-t border-border/70">
                        {board.tickets.map((ticket) => (
                          <div
                            key={ticket.key}
                            className="border-border/60 border-b last:border-b-0"
                          >
                            <div className="flex items-center gap-2 bg-muted/20 px-3 py-2 text-sm">
                              {/* Status icon (not text) — same glyph the board
                                  uses, far faster to scan. Keyed on the status
                                  slug; the column name is the tooltip. */}
                              {ticket.statusSlug ? (
                                <span
                                  className="inline-flex size-4 shrink-0 items-center justify-center"
                                  title={
                                    ticket.statusName ??
                                    ticket.statusSlug ??
                                    undefined
                                  }
                                >
                                  {getColumnIcon(
                                    ticket.statusSlug,
                                    ticket.statusIsFinal,
                                    ticket.statusIcon,
                                  )}
                                </span>
                              ) : null}
                              <span className="font-medium">
                                {ticket.number ? `#${ticket.number} · ` : ""}
                                {ticket.title}
                              </span>
                              {ticket.flaggedCount > 0 ? (
                                <span
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 font-medium text-[10px] text-destructive"
                                  title={t("inbox:flaggedCount", {
                                    count: ticket.flaggedCount,
                                  })}
                                >
                                  <Flag className="size-3" aria-hidden />
                                </span>
                              ) : null}
                              <span className="ml-auto text-muted-foreground text-xs">
                                {ticket.notifications.length} events
                              </span>
                            </div>
                            <ul className="divide-y divide-border/50">
                              {ticket.notifications.map((notification) => {
                                const content = getNotificationContent(
                                  notification,
                                  t,
                                );
                                const flagged =
                                  isFlaggedNotification(notification);
                                const flagMeta = flagged
                                  ? getFlagMeta(notification)
                                  : null;
                                const flagColor = flagMeta?.color ?? undefined;
                                return (
                                  <li
                                    className="flex items-center border-l-2 border-l-transparent"
                                    // Flagged rows tint + accent in the flag's
                                    // own colour (not a fixed red), and the left
                                    // accent is always a 2px slot so unflagged
                                    // rows stay aligned — no lopsided outline.
                                    style={
                                      flagged && flagColor
                                        ? {
                                            backgroundColor: `${flagColor}14`,
                                            borderLeftColor: flagColor,
                                          }
                                        : undefined
                                    }
                                    key={notification.id}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleNotificationClick(notification)
                                      }
                                      className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                                    >
                                      {flagged ? (
                                        <Flag
                                          aria-hidden
                                          className="mt-0.5 size-3.5 shrink-0"
                                          style={
                                            flagColor
                                              ? { color: flagColor }
                                              : undefined
                                          }
                                        />
                                      ) : (
                                        <span
                                          aria-hidden
                                          className={cn(
                                            "mt-1.5 size-1.5 shrink-0 rounded-full",
                                            notification.isRead
                                              ? "bg-transparent"
                                              : "bg-info",
                                          )}
                                        />
                                      )}
                                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="flex min-w-0 items-center gap-1.5">
                                          {/* Flag notifications lead with a
                                              coloured chip naming the flag type
                                              (Blocked, Need Help, …). */}
                                          {flagged && flagMeta?.name ? (
                                            <span
                                              className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-[10px] uppercase tracking-wide"
                                              style={{
                                                color: flagColor ?? undefined,
                                                backgroundColor: flagColor
                                                  ? `${flagColor}22`
                                                  : undefined,
                                              }}
                                            >
                                              <Flag
                                                className="size-2.5"
                                                aria-hidden
                                              />
                                              {flagMeta.name}
                                            </span>
                                          ) : null}
                                          <span
                                            className={cn(
                                              "truncate",
                                              flagged
                                                ? "font-medium text-foreground"
                                                : notification.isRead
                                                  ? "text-muted-foreground"
                                                  : "font-medium text-foreground",
                                            )}
                                          >
                                            {getNotificationTitle(
                                              notification,
                                              t,
                                            )}
                                          </span>
                                        </span>
                                        {content ? (
                                          <span className="truncate text-muted-foreground text-xs">
                                            {content}
                                          </span>
                                        ) : null}
                                      </div>
                                    </button>
                                    {/* Timestamp + action live at the row level
                                        (items-center) so they align with each
                                        other, instead of top-aligning inside
                                        the multi-line title button. */}
                                    <span className="mr-3 flex shrink-0 items-center gap-3">
                                      <span className="whitespace-nowrap text-muted-foreground text-xs">
                                        {formatRelativeTime(
                                          notification.createdAt,
                                        )}
                                      </span>
                                      {/* Flagged items can't be marked read: the
                                          button opens the ticket so the user can
                                          unflag it. */}
                                      {flagged ? (
                                        <Button
                                          className="shrink-0 gap-1.5 text-xs"
                                          onClick={() =>
                                            handleNotificationClick(
                                              notification,
                                            )
                                          }
                                          size="sm"
                                          variant="outline"
                                        >
                                          <Flag className="size-3.5" />
                                          {t("inbox:unflagAction")}
                                        </Button>
                                      ) : notification.isRead ? null : (
                                        <Button
                                          className="shrink-0 gap-1.5 text-xs"
                                          onClick={() =>
                                            markAsRead(notification.id)
                                          }
                                          size="sm"
                                          variant="outline"
                                        >
                                          <Check className="size-3.5" />
                                          {t("inbox:markAsRead")}
                                        </Button>
                                      )}
                                      <button
                                        type="button"
                                        aria-label={t("inbox:dismiss")}
                                        title={t("inbox:dismiss")}
                                        onClick={() =>
                                          deleteNotifications([notification.id])
                                        }
                                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-destructive"
                                      >
                                        <X className="size-3.5" />
                                      </button>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
            <AlertDialogClose>
              <Button variant="outline" size="sm">
                {t("common:actions.cancel")}
              </Button>
            </AlertDialogClose>
            <AlertDialogClose onClick={handleClearAll}>
              <Button variant="destructive" size="sm">
                {t("common:actions.clearAll")}
              </Button>
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ticket drawer opens over the inbox — never leaves this route. */}
      {openTaskId && openBoardId ? (
        <TaskDetailsSheet
          taskId={openTaskId}
          boardId={openBoardId}
          organizationId={organizationId}
          onClose={handleCloseTaskSheet}
        />
      ) : null}
    </OrganizationLayout>
  );
}
