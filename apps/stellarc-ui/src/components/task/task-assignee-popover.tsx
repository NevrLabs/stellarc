import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PrincipalPickerList, {
  type PrincipalPickerOption,
} from "@/components/principal-picker-list";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import { useGetOrganizationPrincipals } from "@/hooks/queries/organization-members/use-get-organization-principals";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { authClient } from "@/lib/auth-client";
import {
  buildPrincipalPickerOptions,
  resolvePrincipalSelection,
} from "@/lib/principal-picker-options";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type Props = { task: Task; organizationId: string; children: React.ReactNode };
type Assignment = PrincipalPickerOption;

export default function TaskAssigneePopover({
  task,
  organizationId,
  children,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync } = useUpdateTaskAssignee();
  // KFL-160: principals (not listMembers) so agents can be grouped separately.
  const { data: principals } = useGetOrganizationPrincipals(organizationId);
  const teams = useQuery({
    queryKey: ["organization-teams", organizationId],
    enabled: open && Boolean(organizationId),
    queryFn: async () => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error)
        throw new Error(result.error.message || "Failed to load teams");
      return result.data ?? [];
    },
  });
  const canAssign = useOrganizationPermission().canAssignTasks();
  const options = useMemo<Assignment[]>(
    () => buildPrincipalPickerOptions(principals, teams.data),
    [principals, teams.data],
  );

  const assign = useCallback(
    async (assignment?: Assignment) => {
      try {
        await mutateAsync({
          ...task,
          userId:
            assignment && assignment.type !== "team" ? assignment.value : null,
          teamId: assignment?.type === "team" ? assignment.value : null,
        });
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.assignee.updateError"),
        );
      }
    },
    [mutateAsync, task, t],
  );

  if (!canAssign) return <>{children}</>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <PrincipalPickerList
          clearLabel={t("tasks:popover.assignee.unassigned")}
          onSelect={(option) => assign(option)}
          options={options}
          selected={resolvePrincipalSelection(task, principals)}
          searchAriaLabel="Search assignees"
        />
      </PopoverContent>
    </Popover>
  );
}
