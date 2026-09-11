import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getApiUrl } from "@/fetchers/get-api-url";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { authClient } from "@/lib/auth-client";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

type ResourceType = "board" | "repo";

type Grant = {
  id: string;
  userId: string | null;
  teamId: string | null;
  privilege: "view" | "edit" | "manage";
};

type AccessEntry = {
  key: string;
  kind: "member" | "team";
  name: string;
  detail: string;
  image?: string | null;
  userId?: string;
  email?: string | null;
};

type BoardAccessAvatarsProps = {
  organizationId: string;
  resourceId: string;
  resourceType?: ResourceType;
  className?: string;
  maxVisible?: number;
};

/**
 * Avatar cluster for the topbar showing who and which teams can reach this
 * board. With no resource grants every organization member has access (same
 * rule the resource-grant editor states), so we fall back to the member list.
 *
 * Board sockets publish a deduplicated viewer roster. Repo pages do not yet
 * have an equivalent socket, so their access list remains roster-only.
 */
export default function BoardAccessAvatars({
  organizationId,
  resourceId,
  resourceType = "board",
  className,
  maxVisible = 4,
}: BoardAccessAvatarsProps) {
  const { t } = useTranslation();
  // NOTE: this hook resolves to `{ members, total }` — an object, not an array.
  const { data: organizationMembers } =
    useGetActiveOrganizationMembers(organizationId);
  const members = organizationMembers?.members ?? [];
  const { data: presentUserIds = [] } = useQuery<string[]>({
    queryKey: ["board-presence", resourceId],
    queryFn: () => [],
    enabled: false,
  });

  const { data: grants = [] } = useQuery<Grant[]>({
    queryKey: ["resource-grants", organizationId, resourceType, resourceId],
    enabled: Boolean(organizationId && resourceId),
    queryFn: async () => {
      const response = await fetch(
        getApiUrl(
          `resource-grant/${organizationId}/${resourceType}/${resourceId}`,
        ),
        { credentials: "include" },
      );
      if (!response.ok) return [];
      return response.json();
    },
    retry: false,
  });

  const hasTeamGrant = grants.some((grant) => Boolean(grant.teamId));
  const { data: teams = [] } = useQuery({
    queryKey: ["organization-teams", organizationId, "board-access"],
    enabled: Boolean(organizationId) && hasTeamGrant,
    retry: false,
    queryFn: async () => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error) return [];
      return result.data ?? [];
    },
  });

  const grantedUserIds = grants
    .map((grant) => grant.userId)
    .filter((id): id is string => Boolean(id));

  const memberEntries: AccessEntry[] = (
    grantedUserIds.length > 0
      ? members.filter((member) => grantedUserIds.includes(member.userId))
      : members
  ).map((member) => ({
    key: `member-${member.userId}`,
    kind: "member" as const,
    name: member.user?.name || member.user?.email || t("common:unknown"),
    detail: member.role ?? "",
    image: member.user?.image ?? null,
    userId: member.userId,
    email: member.user?.email ?? null,
  }));

  const teamEntries: AccessEntry[] = grants
    .filter((grant) => Boolean(grant.teamId))
    .map((grant) => {
      const team = teams.find((item) => item.id === grant.teamId);
      return {
        key: `team-${grant.teamId}`,
        kind: "team" as const,
        name: team?.name ?? t("tasks:access.team"),
        detail: grant.privilege,
      };
    });

  const entries = [...teamEntries, ...memberEntries];

  if (entries.length === 0) return null;

  const visible = entries.slice(0, maxVisible);
  const overflow = entries.length - visible.length;

  return (
    <TooltipProvider>
      {/*
        #91: the avatar stack is a dropdown trigger. The stack alone can only
        show a handful of faces and hides the access TYPE entirely; the menu
        lists every user and team with the privilege each one holds.
      */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              data-testid="board-access-trigger"
              aria-label={t("tasks:access.title")}
              className="cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              <fieldset
                data-testid="board-access-avatars"
                data-slot="board-access-avatars"
                aria-label={t("tasks:access.title")}
                className={cn(
                  "m-0 flex min-w-0 items-center border-0 p-0",
                  className,
                )}
              >
                {visible.map((entry) => (
                  <Tooltip key={entry.key}>
                    <TooltipTrigger
                      render={
                        <span
                          data-testid={`board-access-avatar-${entry.key}`}
                          className="relative -ml-1.5 inline-flex first:ml-0"
                        >
                          <Avatar
                            className={cn(
                              "size-6 border border-background ring-1 ring-border",
                              entry.kind === "member" &&
                                getAvatarTone(entry.userId, entry.email),
                            )}
                          >
                            {entry.kind === "member" && entry.image ? (
                              <AvatarImage src={entry.image} alt={entry.name} />
                            ) : null}
                            <AvatarFallback
                              className={cn(
                                "text-[10px]",
                                entry.kind === "member" && "bg-transparent",
                              )}
                            >
                              {entry.kind === "team" ? (
                                <Users className="size-3" aria-hidden="true" />
                              ) : (
                                getInitials(entry.name)
                              )}
                            </AvatarFallback>
                          </Avatar>
                          {entry.userId &&
                          presentUserIds.includes(entry.userId) ? (
                            <span
                              title={t("tasks:access.viewing")}
                              className="absolute right-0 bottom-0 size-2 rounded-full border border-background bg-success"
                            />
                          ) : null}
                        </span>
                      }
                    />
                    <TooltipContent>
                      <span className="text-[10px]">
                        {entry.detail
                          ? `${entry.name} · ${entry.detail}`
                          : entry.name}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {overflow > 0 && (
                  <span
                    data-testid="board-access-avatar-overflow"
                    className="-ml-1.5 flex size-6 items-center justify-center rounded-full border border-background bg-muted text-[10px] font-medium text-muted-foreground ring-1 ring-border"
                  >
                    +{overflow}
                  </span>
                )}
              </fieldset>
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-64 p-0">
          <div className="border-border border-b px-3 py-2">
            <p className="font-medium text-xs">{t("tasks:access.title")}</p>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {entries.map((entry) => (
              <li
                key={entry.key}
                data-testid={`board-access-row-${entry.key}`}
                className="flex items-center gap-2 px-3 py-1.5"
              >
                <Avatar
                  className={cn(
                    "size-5 shrink-0",
                    entry.kind === "member" &&
                      getAvatarTone(entry.userId, entry.email),
                  )}
                >
                  {entry.kind === "member" && entry.image ? (
                    <AvatarImage src={entry.image} alt={entry.name} />
                  ) : null}
                  <AvatarFallback
                    className={cn(
                      "text-[9px]",
                      entry.kind === "member" && "bg-transparent",
                    )}
                  >
                    {entry.kind === "team" ? (
                      <Users className="size-2.5" aria-hidden="true" />
                    ) : (
                      getInitials(entry.name)
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {entry.name}
                </span>
                {entry.userId && presentUserIds.includes(entry.userId) ? (
                  <span className="text-[10px] text-success-foreground">
                    {t("tasks:access.viewing")}
                  </span>
                ) : null}
                {/* The access type is the point of the list — always shown. */}
                <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground capitalize">
                  {entry.detail || t("tasks:access.member")}
                </span>
              </li>
            ))}
          </ul>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
