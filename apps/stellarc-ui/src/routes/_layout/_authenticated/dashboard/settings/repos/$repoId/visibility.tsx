import { createFileRoute, useParams } from "@tanstack/react-router";
import BoardIconPicker from "@/components/common/board-icon-picker";
import PageTitle from "@/components/page-title";
import RepoAvatar from "@/components/repo/repo-avatar";
import { ResourceGrantEditor } from "@/components/resource-grant-editor";
import { Button } from "@/components/ui/button";
import useUpdateRepo from "@/hooks/mutations/repo/use-update-repo";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/repos/$repoId/visibility",
)({ component: RepoVisibility });

function RepoVisibility() {
  const { repoId } = useParams({ strict: false });
  const { data: organization } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const canEdit = canManageOrganization();
  const { data: repos = [] } = useGetRepos({
    organizationId: organization?.id ?? "",
  });
  const repo = repos.find((candidate) => candidate.id === repoId);
  const { mutateAsync: updateRepo, isPending } = useUpdateRepo({
    organizationId: organization?.id ?? "",
  });

  const saveIcon = async (icon: string | null) => {
    if (!repo) return;
    try {
      await updateRepo({ id: repo.id, config: { icon } });
      toast.success(icon ? "Repository icon updated" : "Repository icon reset");
    } catch {
      toast.error("Failed to update repository icon");
    }
  };

  return (
    <>
      <PageTitle title="Repository visibility" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Repository visibility</h1>
          <p className="text-muted-foreground">
            Choose which organization members and teams can access this
            repository.
          </p>
        </div>
        {repo ? (
          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-medium">Repository icon</h2>
              <p className="text-sm text-muted-foreground">
                Choose a distinct icon for the sidebar. Repositories default to
                their first letter.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <BoardIconPicker
                disabled={!canEdit || isPending}
                onValueChange={(icon) => void saveIcon(icon)}
                searchPlaceholder="Search repository icons"
                triggerContent={<RepoAvatar repo={repo} />}
                triggerLabel="Choose repository icon"
                value={repo.config?.icon ?? ""}
              />
              <Button
                disabled={!canEdit || isPending || !repo.config?.icon}
                onClick={() => void saveIcon(null)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Reset to initial
              </Button>
            </div>
          </section>
        ) : null}
        {organization?.id && repoId ? (
          <ResourceGrantEditor
            organizationId={organization.id}
            resourceType="repo"
            resourceId={repoId}
            disabled={!canEdit}
          />
        ) : null}
      </div>
    </>
  );
}
