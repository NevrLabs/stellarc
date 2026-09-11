import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import { OrganizationMembersGroups } from "@/components/team/organization-members-groups";
import { Button } from "@/components/ui/button";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetFullOrganization from "@/hooks/queries/organization/use-get-full-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { cn } from "@/lib/cn";
import { TeamsManagement } from "../../settings/organization/teams";

type MembersTab = "members" | "teams";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/members",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): { tab: MembersTab } => ({
    tab: search.tab === "teams" ? "teams" : "members",
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { organizationSlug } = Route.useParams();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { data: fullOrganization } = useGetFullOrganization({ organizationId });
  const { canInviteUsers, isAdmin } = useOrganizationPermission();
  const canInvite = Boolean(canInviteUsers());
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [createTeamSignal, setCreateTeamSignal] = useState(0);
  const [activeTab, setActiveTab] = useState<MembersTab>(tab);
  const isTeams = activeTab === "teams";

  useEffect(() => setActiveTab(tab), [tab]);

  const selectTab = (nextTab: MembersTab) => {
    // Commit the cheap local view switch before router/auth revalidation. The
    // URL update remains shareable and back/forward-safe, but no longer blocks
    // visible feedback behind a session request.
    flushSync(() => setActiveTab(nextTab));
    void navigate({
      to: "/dashboard/organization/$organizationSlug/members",
      params: { organizationSlug },
      search: { tab: nextTab },
      replace: true,
    });
  };

  return (
    <>
      <PageTitle title={t("team:members.pageTitle")} />
      <OrganizationLayout
        title={t("team:members.pageTitle")}
        headerNavigation={
          <div
            className="ml-2 inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5"
            role="tablist"
            aria-label="Organization people"
          >
            {(["members", "teams"] as const).map((item) => (
              <Button
                key={item}
                role="tab"
                aria-selected={activeTab === item}
                variant="ghost"
                size="xs"
                className={cn(
                  "h-6 shrink-0 rounded-md px-2 text-xs font-medium capitalize transition-colors",
                  activeTab === item
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => selectTab(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        }
        headerActions={
          isTeams && isAdmin ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setCreateTeamSignal((value) => value + 1)}
              className="gap-1"
            >
              <Plus className="size-3" /> New team
            </Button>
          ) : canInvite ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setIsInviteOpen(true)}
              className="gap-1"
            >
              <UserPlus className="w-3 h-3" />
              {t("team:members.inviteMember")}
            </Button>
          ) : null
        }
      >
        {/*
          Content container: both tabs used to render flush against the panel
          edge with no gutter and stretch across ultrawide viewports. One
          shared max-width + padding keeps People, Agents and Teams on the
          same grid as every other settings surface.
        */}
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
          {isTeams ? (
            <TeamsManagement createTeamSignal={createTeamSignal} />
          ) : (
            <OrganizationMembersGroups
              organizationId={organizationId}
              users={fullOrganization?.members ?? []}
              invitations={fullOrganization?.invitations ?? []}
              canManageAgents={isAdmin}
            />
          )}
        </div>

        <InviteTeamMemberModal
          open={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
        />
      </OrganizationLayout>
    </>
  );
}
