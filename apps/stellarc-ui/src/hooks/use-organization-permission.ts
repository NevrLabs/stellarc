import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetActiveOrganizationMember } from "@/hooks/queries/organization-members/use-active-organization-member";
import { authClient } from "@/lib/auth-client";

export type PermissionLevel = "owner" | "admin" | "member";

// Capabilities are named permission bundles checked against the SERVER via
// better-auth's `/organization/has-permission` endpoint. Going through the
// server is what makes custom organization roles work in the UI — the local
// `checkRolePermission` only knows about the four static roles compiled
// into the auth client, so it would silently return false for any custom
// role that grants the permission.
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

  // One query that fans out to all capability checks in parallel and caches
  // the resulting map by (organizationId, role). Refetches when either changes
  // — e.g., when the admin edits the role's permissions in the Roles UI and
  // we invalidate this key.
  const {
    data: capabilities,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["organization-capabilities", organizationId, role],
    enabled: Boolean(organizationId && role),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CapabilityMap> => {
      const entries = Object.entries(CAPABILITIES) as Array<
        [Capability, Record<string, string[]>]
      >;
      const results = await Promise.all(
        entries.map(async ([key, permissions]) => {
          try {
            const res = await authClient.organization.hasPermission({
              organizationId: organizationId,
              permissions,
            });
            return [key, res.data?.success === true] as const;
          } catch (error) {
            console.error(`hasPermission check failed for ${key}:`, error);
            return [key, false] as const;
          }
        }),
      );
      const map = emptyCapabilityMap();
      for (const [key, value] of results) {
        map[key] = value;
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
      // Escape hatch for ad-hoc permission checks (uncached). Prefer adding
      // a capability above.
      hasPermission: async (permissions: Record<string, string[]>) => {
        try {
          const res = await authClient.organization.hasPermission({
            organizationId: organizationId,
            permissions,
          });
          return res.data?.success === true;
        } catch (error) {
          console.error("hasPermission check failed:", error);
          return false;
        }
      },
    };
  }, [can, organizationId]);

  return {
    ...helpers,
    organization: activeOrganization,
    member: activeMember,
    role,
    isOwner: role === "owner",
    isAdmin: role === "owner" || role === "admin",
    // True while the first capability fetch is in flight. Useful for hiding
    // action UI during the initial render instead of flashing it on then
    // off when the server check resolves.
    isCheckingPermissions:
      Boolean(organizationId && role) && (isLoading || !capabilities),
    isRefetchingPermissions: isFetching,
  };
}
