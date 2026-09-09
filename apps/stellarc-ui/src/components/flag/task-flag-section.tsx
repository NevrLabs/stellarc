import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PrincipalOption } from "@/components/principal-selector";
import { useGetOrganizationPrincipals } from "@/hooks/queries/organization-members/use-get-organization-principals";
import { authClient } from "@/lib/auth-client";
import TaskFlagPicker from "./task-flag-picker";

type TaskFlagSectionProps = {
  taskId: string;
  boardId: string;
  organizationId: string;
};

/**
 * #107: the task-detail flag surface. This is a single topbar control that
 * opens a milestone-style popover; there is no separate flag modal and no
 * bespoke user/team dropdown — targets come from the same member/team
 * selector used by board visibility settings.
 */
export function TaskFlagSection({
  taskId,
  boardId,
  organizationId,
}: TaskFlagSectionProps) {
  // KFL-160: principals carry an explicit kind ("user" | "agent"), which
  // listMembers strips, so the flag target picker can group agents apart.
  const { data: principalData, isPending: membersPending } =
    useGetOrganizationPrincipals(organizationId);

  const { data: teams = [], isPending: teamsPending } = useQuery({
    queryKey: ["organization-teams", organizationId, "task-flags"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error) {
        throw new Error(result.error.message || "Failed to load teams");
      }
      return result.data ?? [];
    },
  });

  const principals: PrincipalOption[] = useMemo(
    () => [
      ...(principalData ?? []).map((principal) => ({
        id: principal.id,
        kind:
          principal.kind === "agent" ? ("agent" as const) : ("member" as const),
        name: principal.name || principal.email,
        detail: principal.email,
      })),
      ...teams.map((team: { id: string; name: string }) => ({
        id: team.id,
        kind: "team" as const,
        name: team.name,
        detail: "Team",
      })),
    ],
    [principalData, teams],
  );

  return (
    <div data-testid="task-flag-section" className="flex min-w-0 items-center">
      <TaskFlagPicker
        taskId={taskId}
        boardId={boardId}
        principals={principals}
        principalsLoading={membersPending || teamsPending}
      />
    </div>
  );
}

export default TaskFlagSection;
