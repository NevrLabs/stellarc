import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export type OrganizationRole = {
  id: string;
  organizationId: string;
  role: string;
  permission: Record<string, string[]>;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
};

function parsePermission(raw: unknown): Record<string, string[]> {
  if (raw && typeof raw === "object") {
    return raw as Record<string, string[]>;
  }
  if (typeof raw !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string[]>;
    }
    return {};
  } catch {
    return {};
  }
}

function useOrganizationRoles(organizationId: string | undefined) {
  return useQuery<OrganizationRole[]>({
    queryKey: ["organization-roles", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      const result = await authClient.organization.listRoles({
        query: { organizationId: organizationId },
      });
      if (result.error) throw new Error(result.error.message);
      const roles = (result.data ?? []) as Array<{
        id: string;
        organizationId: string;
        role: string;
        permission: string;
        createdAt: Date | string;
        updatedAt?: Date | string | null;
      }>;

      return roles.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        role: r.role,
        permission: parsePermission(r.permission),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },
  });
}

export default useOrganizationRoles;
