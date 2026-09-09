import { createFileRoute } from "@tanstack/react-router";
import { FolderGit2, Table2 } from "lucide-react";
import { useState } from "react";
import PageTitle from "@/components/page-title";
import { AiSettings } from "@/components/settings/ai-settings";
import { Switch } from "@/components/ui/switch";
import useUpdateOrganization from "@/hooks/mutations/organization/use-update-organization";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/features",
)({ component: RouteComponent });

function RouteComponent() {
  const { data: organization, refetch: refetchOrganization } =
    useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const { mutateAsync: updateOrganization } = useUpdateOrganization();
  const reposEnabled = Boolean(
    (
      organization as
        | (typeof organization & { reposEnabled?: boolean })
        | undefined
    )?.reposEnabled,
  );
  const tablesEnabled = Boolean(
    (
      organization as
        | (typeof organization & { tablesEnabled?: boolean })
        | undefined
    )?.tablesEnabled,
  );
  const [pendingFeature, setPendingFeature] = useState<
    "repos" | "tables" | null
  >(null);

  const updateRepos = async (checked: boolean) => {
    if (!organization?.id) return;
    setPendingFeature("repos");
    try {
      await updateOrganization({
        organizationId: organization.id,
        reposEnabled: checked,
      });
      await refetchOrganization();
      toast.success(checked ? "Repos enabled" : "Repos disabled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update feature",
      );
    } finally {
      setPendingFeature(null);
    }
  };

  const updateTables = async (checked: boolean) => {
    if (!organization?.id) return;
    setPendingFeature("tables");
    try {
      await updateOrganization({
        organizationId: organization.id,
        tablesEnabled: checked,
      });
      await refetchOrganization();
      toast.success(checked ? "Tables enabled" : "Tables disabled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update feature",
      );
    } finally {
      setPendingFeature(null);
    }
  };

  return (
    <>
      <PageTitle title="Organization features" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Features</h1>
          <p className="text-muted-foreground">
            Enable organization-wide product features that are still being
            rolled out.
          </p>
        </div>
        <section className="rounded-xl border border-border bg-background">
          <div className="flex items-start justify-between gap-6 px-4 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 text-muted-foreground">
                <FolderGit2 aria-hidden="true" className="size-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">Repos</h2>
                  <span className="rounded-full border border-border/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Beta
                  </span>
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Dedicated repository browsing, issue and pull-request
                  management. Per-board GitHub and Gitea sync remains available
                  when this is disabled.
                </p>
              </div>
            </div>
            <Switch
              aria-label="Enable Repos"
              checked={reposEnabled}
              disabled={!canManageOrganization() || pendingFeature !== null}
              onCheckedChange={updateRepos}
            />
          </div>
          <div className="border-border border-t" />
          <div className="flex items-start justify-between gap-6 px-4 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 text-muted-foreground">
                <Table2 aria-hidden="true" className="size-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">Tables</h2>
                  <span className="rounded-full border border-border/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Alpha
                  </span>
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Experimental standalone tables with editable text fields and
                  rows. Disabled by default while the resource model is still
                  evolving.
                </p>
              </div>
            </div>
            <Switch
              aria-label="Enable Tables"
              checked={tablesEnabled}
              disabled={!canManageOrganization() || pendingFeature !== null}
              onCheckedChange={updateTables}
            />
          </div>
        </section>
        <AiSettings />
      </div>
    </>
  );
}
