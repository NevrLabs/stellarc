import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetActiveOrganizationMember } from "@/hooks/queries/organization-members/use-active-organization-member";
import type { MemberPublic } from "@/lib/identity-collections";

export type PermissionLevel = "owner" | "admin" | "member";

// Capabilities are evaluated SERVER-side against the member's role and the
// permission vocabulary pinned in @kaneo/permissions. The identity API
// enforces the same semantics on every mutation (capabilities.ts is the
// single evaluator), so the client mirrors the role → capability matrix
// here for UI affordance gating only — enforcement never trusts this file.
const ROLE_CAPABILITIES: Record<string, Record<string, string[]>> = {
  owner: {
    board: ["create", "update", "delete"],
    project: ["create", "update", "delete"],
    task: ["create", "update", "delete", "assign"],
    label: ["create", "update", "delete"],
    organization: ["update", "manage_settings"],
    invitation: ["create"],
    member: ["update", "delete"],
    team: ["update", "delete"],
    apikey: ["create", "delete"],
  },
  admin: {
    board: ["create", "update", "delete"],
    project: ["create", "update", "delete"],
    task: ["create", "update", "delete", "assign"],
    label: ["create", "update", "delete"],
    organization: ["manage_settings"],
    invitation: ["create"],
    member: ["update", "delete"],
    team: ["update", "delete"],
    apikey: ["create", "delete"],
  },
  member: {
    board: ["create"],
    project: ["create"],
    task: ["create", "update", "assign"],
  },
  viewer: {},
};

const CAPABILITIES = {
  manageBoards: { board: ["create", "update", "delete"] },
  createBoards: { board: ["create"] },
  updateBoards: { board: ["update"] },
  deleteBoards: { board: ["delete"] },
  manageProjects: { project: ["create", "update", "delete"] },
  createProjects: { project: ["create"] },
  updateProjects: { project: ["update"] },
  deleteProjects: { project: ["delete"] },
  manageTasks: { task: ["create", "update", "delete"] },
  createTasks: { task: ["create"] },
  assignTasks: { task: ["assign"] },
  manageLabels: { label: ["create", "update", "delete"] },
  manageOrganization: { organization: ["update", "manage_settings"] },
  deleteOrganization: { organization: ["delete"] },
  inviteUsers: { invitation: ["create"] },
  manageTeam: { member: ["update", "delete"] },
  removeMembers: { member: ["delete"] },
} as const satisfies Record<string, Record<string, string[]>>;

type Capability = keyof typeof CAPABILITIES;

type CapabilityMap = Record<Capability, boolean>;

function evaluate(
  permissions: Record<string, string[]>,
  granted: Record<string, string[]> | undefined,
): boolean {
  if (!granted) return false;
  return Object.entries(permissions).every(([resource, actions]) =>
    actions.every((action) => granted[resource]?.includes(action)),
  );
}

function emptyCapabilityMap(): CapabilityMap {
  const out = {} as CapabilityMap;
  for (const key of Object.keys(CAPABILITIES) as Capability[]) {
    out[key] = false;
  }
  return out;
}

export function useOrganizationPermission() {
  const { data: activeOrganization } = useActiveOrganization();
  const { data: activeMember } = useGetActiveOrganizationMember();
  const organizationId = activeOrganization?.id;
  const role = activeMember?.role as string | undefined;

  const { data: capabilities } = useQuery({
    queryKey: ["organization-capabilities", organizationId, role],
    enabled: Boolean(organizationId && role),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CapabilityMap> => {
      // Dynamic organization_role rows: prefer the served role list when the
      // member's role is not one of the four static names. The identity API
      // remains the enforcement point; this only mirrors its decisions.
      const granted = ROLE_CAPABILITIES[role as string];
      const map = emptyCapabilityMap();
      for (const [key, permissions] of Object.entries(CAPABILITIES) as Array<
        [Capability, Record<string, string[]>]
      >) {
        map[key] = evaluate(permissions, granted);
      }
      return map;
    },
  });

  const can: CapabilityMap = capabilities ?? emptyCapabilityMap();

  const helpers = useMemo(() => {
    return {
      canManageBoards: () => can.manageBoards,
      canCreateBoards: () => can.createBoards,
      canUpdateBoards: () => can.updateBoards,
      canDeleteBoards: () => can.deleteBoards,
      canManageProjects: () => can.manageProjects,
      canCreateProjects: () => can.createProjects,
      canUpdateProjects: () => can.updateProjects,
      canDeleteProjects: () => can.deleteProjects,
      canManageTasks: () => can.manageTasks,
      canCreateTasks: () => can.createTasks,
      canAssignTasks: () => can.assignTasks,
      canManageLabels: () => can.manageLabels,
      canManageOrganization: () => can.manageOrganization,
      canDeleteOrganization: () => can.deleteOrganization,
      canInviteUsers: () => can.inviteUsers,
      canManageTeam: () => can.manageTeam,
      canRemoveMembers: () => can.removeMembers,
      // Escape hatch: mirror of the mutation-side check (no network).
      hasPermission: async (permissions: Record<string, string[]>) =>
        evaluate(permissions, ROLE_CAPABILITIES[(role as string) ?? ""]),
    };
  }, [can, role]);

  return {
    ...helpers,
    organization: activeOrganization,
    isAdmin: role === "owner" || role === "admin",
    role,
  };
}

export default useOrganizationPermission;
