import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import PageTitle from "@/components/page-title";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiUrl } from "@/fetchers/get-api-url";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/visibility",
)({ component: RouteComponent });

type Privilege = "none" | "view" | "edit" | "manage";

type VisibilityDefaults = {
  defaultResourcePrivilege: Privilege;
};

const PRIVILEGE_LABELS: Record<Privilege, string> = {
  none: "Hidden",
  view: "View",
  edit: "Edit",
  manage: "Manage",
};

const PRIVILEGE_DESCRIPTIONS: Record<Privilege, string> = {
  none: "Members cannot see resources unless individually granted access.",
  view: "Members can open and read resources, but not change anything.",
  edit: "Members can work inside resources but not administer them.",
  manage: "Members can administer resources, including their settings.",
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(getApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Request failed");
  return response.json();
}

function RouteComponent() {
  const { data: organization } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const queryClient = useQueryClient();
  const organizationId = organization?.id ?? "";
  const queryKey = ["organization-visibility-defaults", organizationId];
  const basePath = `organization/${organizationId}/visibility-defaults`;

  const defaults = useQuery<VisibilityDefaults>({
    queryKey,
    enabled: Boolean(organizationId),
    queryFn: () => request(basePath),
  });

  const save = useMutation({
    mutationFn: (defaultResourcePrivilege: Privilege) =>
      request(basePath, {
        method: "PUT",
        body: JSON.stringify({ defaultResourcePrivilege }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Default visibility updated");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update default visibility",
      ),
  });

  const data = defaults.data;
  const editable = canManageOrganization() && !save.isPending && Boolean(data);

  return (
    <>
      <PageTitle title="Organization visibility" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Visibility</h1>
          <p className="text-muted-foreground">
            Default access organization members get to boards, repositories, and
            tables. Each resource can override this from its own visibility
            settings, explicit user or team grants add access on top, and owners
            and admins always keep full access.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-background">
          <div className="flex items-start justify-between gap-6 px-4 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 text-muted-foreground">
                <Eye aria-hidden="true" className="size-4" />
              </div>
              <div className="space-y-1">
                <h2 className="font-medium">Organization-wide default</h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  {data
                    ? PRIVILEGE_DESCRIPTIONS[data.defaultResourcePrivilege]
                    : defaults.isError
                      ? "Could not load visibility defaults."
                      : "Loading visibility defaults…"}
                </p>
              </div>
            </div>
            <div className="w-36">
              <Label className="sr-only" htmlFor="org-default-privilege">
                Organization-wide default access
              </Label>
              <Select
                value={data?.defaultResourcePrivilege ?? "manage"}
                onValueChange={(value) => save.mutate(value as Privilege)}
                disabled={!editable}
              >
                <SelectTrigger
                  id="org-default-privilege"
                  aria-label="Organization-wide default access"
                >
                  <SelectValue>
                    {data
                      ? PRIVILEGE_LABELS[data.defaultResourcePrivilege]
                      : ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIVILEGE_LABELS) as Privilege[]).map(
                    (privilege) => (
                      <SelectItem key={privilege} value={privilege}>
                        {PRIVILEGE_LABELS[privilege]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
