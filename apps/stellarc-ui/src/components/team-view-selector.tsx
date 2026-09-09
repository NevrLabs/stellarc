import { useQuery } from "@tanstack/react-query";
import { ChevronDown, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { authClient } from "@/lib/auth-client";
import { useTeamViewStore } from "@/store/team-view";

type TeamOption = {
  id: string;
  name: string;
};

/**
 * #96: the sidebar top is a team-view selector, not an organization switcher.
 *
 * The organization switcher moved into the avatar menu at the bottom of the
 * sidebar; what sits at the top now is the scope the operator is looking at —
 * either every team ("All") or one specific team. "All" is represented by a
 * null `teamId` in the store, i.e. no team filter at all.
 */
export function TeamViewSelector() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const { teamId, teamName, setTeamView } = useTeamViewStore();
  const organizationId = organization?.id ?? "";

  const teams = useQuery({
    queryKey: ["organization-teams", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<TeamOption[]> => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error) {
        throw new Error(result.error.message || "Failed to load teams");
      }
      return (result.data ?? []).map((team: { id: string; name: string }) => ({
        id: team.id,
        name: team.name,
      }));
    },
  });

  const allLabel = t("navigation:teamView.all");
  const label = teamId ? (teamName ?? allLabel) : allLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className="group h-8 min-w-0 flex-1 rounded-md px-2 text-sidebar-foreground"
            size="default"
            tooltip={t("navigation:teamView.label")}
          />
        }
      >
        <UsersRound aria-hidden="true" className="size-3.5 shrink-0" />
        <span
          className="truncate text-sm font-medium text-foreground"
          data-testid="team-view-selector-value"
        >
          {label}
        </span>
        <ChevronDown className="ml-auto size-3.5 text-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={4}>
        <DropdownMenuItem
          className="h-7 text-sm"
          onClick={() => setTeamView(null, null)}
        >
          {allLabel}
        </DropdownMenuItem>
        {(teams.data ?? []).map((team: TeamOption) => (
          <DropdownMenuItem
            className="h-7 text-sm"
            key={team.id}
            onClick={() => setTeamView(team.id, team.name)}
          >
            {team.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default TeamViewSelector;
