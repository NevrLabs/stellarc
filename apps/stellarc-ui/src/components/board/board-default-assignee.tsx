import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import PrincipalPickerList, {
  type PrincipalPickerOption,
} from "@/components/principal-picker-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useGetOrganizationPrincipals } from "@/hooks/queries/organization-members/use-get-organization-principals";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { authClient } from "@/lib/auth-client";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getInitials } from "@/lib/get-initials";
import {
  buildPrincipalPickerOptions,
  resolvePrincipalSelection,
} from "@/lib/principal-picker-options";
import { toast } from "@/lib/toast";

type Board = {
  id: string;
  organizationId?: string;
  defaultAssigneeId?: string | null;
  defaultAssigneeTeamId?: string | null;
};

type Props = {
  board?: Board | null;
  canEdit: boolean;
  onUpdate: (updates: {
    defaultAssigneeId?: string | null;
    defaultAssigneeTeamId?: string | null;
  }) => Promise<unknown>;
  onDone: () => Promise<unknown>;
};

export function BoardDefaultAssignee({
  board,
  canEdit,
  onUpdate,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const organizationId = board?.organizationId ?? "";
  // KFL-160: principals carry `kind`, so agents land in the Agents group.
  const { data: principals } = useGetOrganizationPrincipals(organizationId);
  const teams = useQuery({
    queryKey: ["organization-teams", organizationId, "default-assignee"],
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

  const options = useMemo<PrincipalPickerOption[]>(
    () => buildPrincipalPickerOptions(principals, teams.data),
    [principals, teams.data],
  );

  const selectedMember = principals?.find(
    (p) => p.id === board?.defaultAssigneeId,
  );
  const selectedTeam = teams.data?.find(
    (t) => t.id === board?.defaultAssigneeTeamId,
  );

  const assign = useCallback(
    async (option?: PrincipalPickerOption) => {
      try {
        await onUpdate({
          defaultAssigneeId:
            option && option.type !== "team" ? option.value : null,
          defaultAssigneeTeamId: option?.type === "team" ? option.value : null,
        });
        await onDone();
        setOpen(false);
        toast.success(
          option ? "Default assignee set" : "Default assignee cleared",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update default assignee",
        );
      }
    },
    [onUpdate, onDone],
  );

  if (!board) return null;

  const isTeam = Boolean(board.defaultAssigneeTeamId);
  const isUser = Boolean(board.defaultAssigneeId);
  const label = selectedMember?.name ?? selectedTeam?.name ?? "No default";
  const tone = getAvatarTone(
    board.defaultAssigneeId ?? "",
    selectedMember?.email,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canEdit}
          className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
        >
          {isTeam ? (
            <div className="flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-full border border-border/30 bg-muted">
              <Users className="h-2.5 w-2.5" />
            </div>
          ) : isUser ? (
            <Avatar className={`h-[16px] w-[16px] ${tone}`}>
              <AvatarImage
                src={selectedMember?.image ?? ""}
                alt={selectedMember?.name ?? ""}
              />
              <AvatarFallback className="bg-transparent text-[9px] font-medium border border-border/30 flex-shrink-0 h-[16px] w-[16px]">
                {getInitials(selectedMember?.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-[16px] h-[16px] rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
              <span className="text-[8px] font-medium text-muted-foreground">
                ?
              </span>
            </div>
          )}
          <span className="text-xs font-semibold truncate max-w-[120px]">
            {label}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="end">
        <PrincipalPickerList
          clearLabel="No default"
          onSelect={(option) => assign(option)}
          options={options}
          selected={resolvePrincipalSelection(
            {
              userId: board.defaultAssigneeId,
              teamId: board.defaultAssigneeTeamId,
            },
            principals,
          )}
          searchAriaLabel="Search default assignee"
        />
      </PopoverContent>
    </Popover>
  );
}

export default BoardDefaultAssignee;
