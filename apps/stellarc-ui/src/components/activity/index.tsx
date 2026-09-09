import { Calendar, CircleAlert, Flag, History, UserRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getFlagColor, getFlagIcon } from "@/components/flag/flag-icon";
import useGetTaskFlags from "@/hooks/queries/flag/use-get-task-flags";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetOrganizationMembers from "@/hooks/queries/organization-members/use-get-organization-members";
import { getAvatarTone } from "@/lib/avatar-tone";
import { formatDateMedium, formatRelativeTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel, getStatusLabel } from "@/lib/i18n/domain";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/preview-card";
import { TimelineContent, TimelineItem } from "../ui/timeline";
import CommentCard from "./comment-card";
import {
  type ActivityGroup,
  isCollapsedRun,
  isNoOpRun,
} from "./compact-activities";
import UnflagControl from "./unflag-control";
import { isCommentActivity } from "./utils";

export type ActivityItem = {
  type: string;
  content: string | null;
  eventData?: unknown;
  editHistory?: Array<{ content: string; editedAt: string; userId: string }>;
  id: string;
  createdAt: string;
  userId: string | null;
  taskId: string;
  externalUserName?: string | null;
  externalUserAvatar?: string | null;
  externalSource?: string | null;
  externalUrl?: string | null;
};

function getEventDataRecord(
  eventData: unknown,
): Record<string, unknown> | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }

  return eventData as Record<string, unknown>;
}

type OrganizationMember = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
};

function getActivityTypeIcon(type: string) {
  const iconClass = "h-4 w-4";
  switch (type) {
    case "status_changed":
      return <History className={iconClass} />;
    case "priority_changed":
      return <CircleAlert className={iconClass} />;
    case "due_date_changed":
      return <Calendar className={iconClass} />;
    case "assignee_changed":
    case "unassigned":
      return <UserRound className={iconClass} />;
    case "flag_raised":
    case "flag_resolved":
      // Colour/icon for the specific flag type is rendered in the chip; the
      // gutter keeps a neutral marker so the row still scans as an activity.
      return <Flag className={iconClass} />;
    default:
      return <History className={iconClass} />;
  }
}

/**
 * #107: a flag entry has to say who it was raised FOR, not just its type.
 * targetTeamId has no member lookup, so fall back to the stored team name.
 */
function resolveTargetName(
  eventData: Record<string, unknown> | null | undefined,
  organizationMembers: OrganizationMember[] | undefined,
) {
  if (typeof eventData?.targetUserId === "string") {
    const member = organizationMembers?.find(
      (organizationMember) =>
        organizationMember.user?.id === eventData.targetUserId,
    );
    return member?.user?.name || member?.user?.email || null;
  }
  if (typeof eventData?.targetTeamName === "string") {
    return eventData.targetTeamName;
  }
  return null;
}

function formatActivityDateText(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateMedium(parsed);
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) return value;
  const [, month, day, year] = slashMatch;
  const fromSlashDate = new Date(`${year}-${month}-${day}T00:00:00`);
  if (Number.isNaN(fromSlashDate.getTime())) return value;
  return formatDateMedium(fromSlashDate);
}

function toDisplayCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function findUserByName(users: OrganizationMember[] | undefined, name: string) {
  if (!users) return null;
  const matches = users.filter(
    (member) =>
      member.user?.name?.toLowerCase().trim() === name.toLowerCase().trim(),
  );

  if (matches.length !== 1) return null;
  return matches[0];
}

function UserHoverName({
  user,
  fallbackName,
}: {
  user: OrganizationMember | null;
  fallbackName: string;
}) {
  if (!user?.user) {
    return <span className="font-medium text-foreground">{fallbackName}</span>;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer font-medium text-foreground transition-colors hover:text-primary">
          {user.user.name}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-52 p-3">
        <div className="flex items-center gap-3">
          <Avatar
            className={`h-8 w-8 ${getAvatarTone(user.user.id, user.user.email)}`}
          >
            <AvatarImage
              src={user.user.image ?? ""}
              alt={user.user.name || ""}
            />
            <AvatarFallback className="bg-transparent text-xs font-medium">
              {getInitials(user.user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-none">
              {user.user.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {user.user.email}
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function ActorAvatar({
  user,
  fallbackName,
}: {
  user: OrganizationMember | null;
  fallbackName: string;
}) {
  return (
    <Avatar
      className={`size-6 ${getAvatarTone(user?.user?.id, user?.user?.email)}`}
    >
      <AvatarImage src={user?.user?.image ?? ""} alt={fallbackName} />
      <AvatarFallback className="bg-transparent text-[11px] font-medium">
        {getInitials(fallbackName)}
      </AvatarFallback>
    </Avatar>
  );
}

function renderActivityContent({
  activity,
  organizationMembers,
  t,
}: {
  activity: ActivityItem;
  organizationMembers: OrganizationMember[] | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const content = activity.content || "";
  const eventData = getEventDataRecord(activity.eventData);

  if (activity.type === "priority_changed") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedPriority", {
            from: getPriorityLabel(String(eventData.oldPriority ?? "")),
            to: getPriorityLabel(String(eventData.newPriority ?? "")),
          })}
        </span>
      );
    }

    const match = content.match(
      /changed priority from "?(.+?)"? to "?(.+?)"?$/i,
    );
    if (!match) {
      return <span className="text-sm text-muted-foreground">{content}</span>;
    }

    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:changedPriority", {
          from: getPriorityLabel(match[1]),
          to: getPriorityLabel(match[2]),
        })}
      </span>
    );
  }

  if (activity.type === "status_changed") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedStatus", {
            from: getStatusLabel(String(eventData.oldStatus ?? "")),
            to: getStatusLabel(String(eventData.newStatus ?? "")),
          })}
        </span>
      );
    }

    const match = content.match(/changed status from "?(.+?)"? to "?(.+?)"?$/i);
    if (!match) {
      return <span className="text-sm text-muted-foreground">{content}</span>;
    }

    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:changedStatus", {
          from: getStatusLabel(match[1]),
          to: getStatusLabel(match[2]),
        })}
      </span>
    );
  }

  if (activity.type === "due_date_changed") {
    if (eventData) {
      const oldDueDate = eventData.oldDueDate
        ? formatActivityDateText(String(eventData.oldDueDate))
        : null;
      const newDueDate = eventData.newDueDate
        ? formatActivityDateText(String(eventData.newDueDate))
        : null;

      return (
        <span className="text-sm text-muted-foreground">
          {newDueDate
            ? oldDueDate
              ? t("activity:changedDueDate", {
                  from: oldDueDate,
                  to: newDueDate,
                })
              : t("activity:setDueDate", { date: newDueDate })
            : t("activity:clearedDueDate")}
        </span>
      );
    }

    const changeMatch = content.match(/changed due date from (.+) to (.+)$/i);
    if (changeMatch) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedDueDate", {
            from: formatActivityDateText(changeMatch[1]),
            to: formatActivityDateText(changeMatch[2]),
          })}
        </span>
      );
    }

    const setMatch = content.match(/set due date to (.+)$/i);
    if (setMatch) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:setDueDate", {
            date: formatActivityDateText(setMatch[1]),
          })}
        </span>
      );
    }

    if (content.includes("cleared the due date")) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:clearedDueDate")}
        </span>
      );
    }

    return <span className="text-sm text-muted-foreground">{content}</span>;
  }

  if (activity.type === "unassigned") {
    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:unassigned")}
      </span>
    );
  }

  if (activity.type === "assignee_changed") {
    if (eventData) {
      if (eventData.isSelfAssigned) {
        return (
          <span className="text-sm text-muted-foreground">
            {t("activity:assignedToSelf")}
          </span>
        );
      }

      const targetId = String(eventData.newAssigneeId ?? "");
      const targetName = String(eventData.newAssignee ?? "");
      const targetUser =
        organizationMembers?.find((member) => member.user?.id === targetId) ||
        null;

      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:assignedTo", {
            name: targetUser?.user?.name ?? targetName,
          })}
        </span>
      );
    }

    if (content.includes("themselves")) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:assignedToSelf")}
        </span>
      );
    }

    const tokenMatch = content.match(
      /assigned the task to \[\[user:([^|\]]+)\|([^\]]+)\]\]/,
    );
    if (tokenMatch) {
      const [, targetId, targetName] = tokenMatch;
      const targetUser =
        organizationMembers?.find((member) => member.user?.id === targetId) ||
        null;

      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:assignedTo", {
            name: targetUser?.user?.name ?? targetName,
          })}
        </span>
      );
    }

    const legacyMatch = content.match(/assigned the task to (.+)$/i);
    if (legacyMatch) {
      const targetName = legacyMatch[1];
      const targetUser = findUserByName(organizationMembers, targetName);
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:assignedTo", {
            name: targetUser?.user?.name ?? targetName,
          })}
        </span>
      );
    }
  }

  if (activity.type === "title_changed") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedTitle", {
            from: String(eventData.oldTitle ?? ""),
            to: String(eventData.newTitle ?? ""),
          })}
        </span>
      );
    }

    const legacyMatch = content.match(/changed title from "(.+)" to "(.+)"$/i);
    if (legacyMatch) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedTitle", {
            from: legacyMatch[1],
            to: legacyMatch[2],
          })}
        </span>
      );
    }
  }

  if (activity.type === "moved") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:moved", {
            from: String(eventData.fromBoardName ?? ""),
            to: String(eventData.toBoardName ?? ""),
          })}
        </span>
      );
    }
  }

  if (activity.type === "created") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:created")}
        </span>
      );
    }
  }

  if (activity.type === "flag_raised" || activity.type === "flag_resolved") {
    // #107: the feed should read "flagged Blocked for Ada", with the flag
    // type's own colour and icon, not a colourless "Flags: Blocked".
    const FlagTypeIcon = getFlagIcon(
      typeof eventData?.flagTypeIcon === "string"
        ? eventData.flagTypeIcon
        : null,
    );
    const flagColor = getFlagColor(
      typeof eventData?.flagTypeColor === "string"
        ? eventData.flagTypeColor
        : null,
    );
    const flagTypeName = String(eventData?.flagTypeName ?? "");
    const targetName = resolveTargetName(eventData, organizationMembers);

    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <span>
          {activity.type === "flag_raised"
            ? t("activity:flagRaised")
            : t("activity:flagResolved")}
        </span>
        {/* Entries written before flag_resolved carried the type name have no
            name/colour to show. Rendering the chip anyway produced an empty
            red box, so fall back to the plain verb for those legacy rows. */}
        {flagTypeName && (
          <span
            data-testid="activity-flag-chip"
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium text-xs"
            style={{
              color: flagColor,
              borderColor: flagColor,
              backgroundColor: `${flagColor}1f`,
            }}
          >
            <FlagTypeIcon className="size-3" />
            {flagTypeName}
          </span>
        )}
        {targetName && (
          <span data-testid="activity-flag-target">
            {t("activity:flagTarget", { target: targetName })}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="text-sm text-muted-foreground">
      {content || toDisplayCase(activity.type)}
    </span>
  );
}

function Activity({
  activity,
  step,
  showConnector = false,
  group,
}: {
  activity: ActivityItem;
  step: number;
  showConnector?: boolean;
  /**
   * #116: when several consecutive status changes were folded together, this
   * carries the whole run so the row can show the net delta and expand to the
   * individual steps.
   */
  group?: ActivityGroup<ActivityItem>;
}) {
  const { t } = useTranslation();
  const [runExpanded, setRunExpanded] = useState(false);
  const { data: organization } = useActiveOrganization();
  const { data: organizationMembers } = useGetOrganizationMembers({
    organizationId: organization?.id,
  });
  const eventData = getEventDataRecord(activity.eventData);

  // A flag_raised row keeps its unflag control only while that flag is still
  // active; once resolved the row is history and the feed already carries a
  // matching flag_resolved entry.
  const { data: taskFlags = [] } = useGetTaskFlags(activity.taskId);
  const isFlagResolved =
    typeof eventData?.flagId === "string" &&
    !(taskFlags as { id: string; resolvedAt: string | null }[]).some(
      (flag) => flag.id === eventData.flagId && !flag.resolvedAt,
    );

  const user = activity.userId
    ? organizationMembers?.find(
        (organizationMember) => organizationMember.user?.id === activity.userId,
      )
    : null;

  const isExternalComment = Boolean(activity.externalSource);
  const actorName = user?.user?.name || t("common:people.someone");

  if (isCommentActivity(activity)) {
    const commentUser = isExternalComment
      ? {
          id: undefined,
          name: activity.externalUserName ?? t("activity:githubUser"),
          email: undefined,
          image: activity.externalUserAvatar ?? undefined,
        }
      : {
          id: user?.user?.id,
          name: user?.user?.name,
          email: user?.user?.email,
          image: user?.user?.image,
        };

    return (
      <TimelineItem className="m-0! flex-row items-start py-2!" step={step}>
        <TimelineContent className="min-w-0 flex-1">
          <CommentCard
            commentId={activity.id}
            taskId={activity.taskId}
            content={activity.content || ""}
            user={commentUser}
            createdAt={activity.createdAt}
            editHistory={activity.editHistory}
            externalSource={activity.externalSource}
            externalUrl={activity.externalUrl}
          />
        </TimelineContent>
      </TimelineItem>
    );
  }

  const activityIcon = getActivityTypeIcon(activity.type);

  return (
    <TimelineItem
      className="relative m-0! flex-row items-center gap-3 py-2.5!"
      step={step}
    >
      {showConnector && (
        <span
          className="-translate-x-1/2 absolute top-10 bottom-0 left-3 w-px bg-[color-mix(in_srgb,var(--foreground)_18%,transparent)] dark:bg-[color-mix(in_srgb,var(--foreground)_26%,transparent)]"
          data-testid="activity-connector"
        />
      )}
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/80">
        {activityIcon}
      </span>
      <ActorAvatar user={user || null} fallbackName={actorName} />
      <TimelineContent className="min-w-0 flex-1 text-sm text-foreground">
        {/*
          #167 rejection round 3: the timestamp used to follow the note inside
          one wrapping inline flow, so a wider/narrower note physically moved
          the datetime. The event and its time are now one line; the note is a
          separate second row and cannot affect timestamp placement.
        */}
        <div className="inline-flex max-w-full items-baseline gap-1.5 leading-6">
          <span className="whitespace-nowrap">
            <UserHoverName user={user || null} fallbackName={actorName} />{" "}
            {/*
              #116: a folded run reports the NET delta ("moved this from To Do to
              Done") instead of five near-identical lines. A run that returned to
              where it started says so rather than claiming a move.
            */}
            {group && isCollapsedRun(group) ? (
              <>
                {isNoOpRun(group)
                  ? t("activity:statusRunNoOp", {
                      status: toDisplayCase(group.toStatus ?? ""),
                      count: group.entries.length,
                    })
                  : t("activity:statusRun", {
                      from: toDisplayCase(group.fromStatus ?? ""),
                      to: toDisplayCase(group.toStatus ?? ""),
                    })}{" "}
                <button
                  type="button"
                  data-testid="activity-run-toggle"
                  aria-expanded={runExpanded}
                  onClick={() => setRunExpanded((open) => !open)}
                  className="text-muted-foreground/70 text-xs underline-offset-2 hover:underline"
                >
                  {t("activity:statusRunSteps", {
                    count: group.entries.length,
                  })}
                </button>
              </>
            ) : (
              renderActivityContent({
                activity,
                organizationMembers: organizationMembers as
                  | OrganizationMember[]
                  | undefined,
                t,
              })
            )}
          </span>
          <span
            className="shrink-0 whitespace-nowrap text-muted-foreground/70 text-xs"
            data-testid="activity-time"
          >
            {formatRelativeTime(activity.createdAt)}
          </span>
        </div>
        {activity.type === "flag_raised" &&
          typeof eventData?.note === "string" &&
          eventData.note.trim() && (
            <div className="mt-1">
              <span
                className="inline-flex max-w-full rounded-md border border-border/70 bg-muted/35 px-2.5 py-1 text-xs leading-5"
                data-testid="activity-flag-note"
              >
                <span className="me-1.5 font-medium text-muted-foreground">
                  {t("flags:dialog.note")}:
                </span>
                <span className="text-foreground/90">
                  {eventData.note.trim()}
                </span>
              </span>
            </div>
          )}
        {activity.type === "flag_resolved" &&
          typeof activity.eventData?.resolveNote === "string" &&
          activity.eventData.resolveNote.trim() && (
            <div className="mt-1">
              <span
                className="inline-flex max-w-full rounded-md border border-border/70 bg-muted/35 px-2.5 py-1 text-xs leading-5"
                data-testid="activity-flag-resolve-note"
              >
                <span className="me-1.5 font-medium text-muted-foreground">
                  {t("flags:dialog.note")}:
                </span>
                <span className="text-foreground/90">
                  {activity.eventData.resolveNote.trim()}
                </span>
              </span>
            </div>
          )}
        {/* #107: the unflag action sits on its OWN row beneath the flag it
            resolves, with a mandatory Notes field — not inline in the
            sentence. Only rendered while the flag is still active. */}
        {activity.type === "flag_raised" &&
          typeof eventData?.flagId === "string" &&
          !isFlagResolved && (
            <UnflagControl flagId={eventData.flagId} taskId={activity.taskId} />
          )}
        {/* #116: the folded steps, in order, when the run is expanded. */}
        {group && isCollapsedRun(group) && runExpanded && (
          <ol
            data-testid="activity-run-steps"
            className="mt-1 space-y-0.5 border-border/60 border-l pl-3 text-muted-foreground/80 text-xs"
          >
            {group.entries.map((entry) => {
              const data = getEventDataRecord(entry.eventData);
              return (
                <li key={entry.id}>
                  {toDisplayCase(String(data?.oldStatus ?? ""))}
                  {" \u2192 "}
                  {toDisplayCase(String(data?.newStatus ?? ""))}
                  <span className="ml-2 whitespace-nowrap text-muted-foreground/60">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </TimelineContent>
    </TimelineItem>
  );
}

export default Activity;
