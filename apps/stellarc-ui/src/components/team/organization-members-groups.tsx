import { Bot, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentManager } from "@/components/settings/agent-manager";
import type {
  OrganizationMember,
  OrganizationMemberInvitation,
} from "@/types/organization-member";
import MembersTable from "./members-table";

type Props = {
  organizationId: string;
  invitations: OrganizationMemberInvitation[];
  users: OrganizationMember[];
  canManageAgents: boolean;
};

export function OrganizationMembersGroups({
  organizationId,
  invitations,
  users,
  canManageAgents,
}: Props) {
  const { t } = useTranslation();
  /*
   * Agents are first-class members: a human user and an agent user are
   * identical as far as membership goes, so they belong in the SAME table with
   * the same role column. They used to be filtered out here and surfaced only
   * as API keys further down, which made them look like credentials rather
   * than members.
   *
   * The agent section below stays, but it is now purely credential management
   * (issue/revoke keys) — not the only place an agent is visible.
   */
  const people = users;

  return (
    <div className="space-y-8">
      <section aria-labelledby="people-heading" className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Users className="size-4 text-muted-foreground" />
          <h2 id="people-heading" className="text-sm font-semibold">
            {t("team:members.people")}
          </h2>
        </div>
        <MembersTable
          organizationId={organizationId}
          users={people}
          invitations={invitations}
        />
      </section>

      <section
        aria-labelledby="agents-heading"
        className="space-y-3 border-t pt-6"
      >
        <div className="flex items-center gap-2 px-1">
          <Bot className="size-4 text-muted-foreground" />
          <h2 id="agents-heading" className="text-sm font-semibold">
            {t("team:members.agents")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("team:members.agentsCredentialsHint")}
          </span>
        </div>
        {canManageAgents ? (
          <AgentManager />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            {t("team:members.agentsManagedByAdmins")}
          </p>
        )}
      </section>
    </div>
  );
}
