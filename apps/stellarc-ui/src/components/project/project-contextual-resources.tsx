import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import useDeleteProjectResourceLink from "@/hooks/mutations/project/use-delete-project-resource-link";
import useGetProjectResources from "@/hooks/queries/project/use-get-project-resources";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import ProjectResourceLinkDialog from "./project-resource-link-dialog";
import ProjectResourceRow from "./project-resource-row";
import ProjectResourceUnlinkDialog from "./project-resource-unlink-dialog";

type ProjectContextualResourcesProps = {
  projectId: string;
  organizationId: string;
  organizationSlug: string;
};

/**
 * KFL-368: titled contextual-resources section, separate from the scoped-work
 * (`No scoped work`) section. Never feeds progress; links are context only.
 */
export function ProjectContextualResources({
  projectId,
  organizationId,
  organizationSlug,
}: ProjectContextualResourcesProps) {
  const { t } = useTranslation();
  const { canUpdateProjects } = useOrganizationPermission();
  const canEdit = canUpdateProjects();

  const { data: links = [], isLoading } = useGetProjectResources({ projectId });
  const deleteLink = useDeleteProjectResourceLink(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  return (
    <section data-testid="project-contextual-resources">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:resources.title")}
        </h2>
        {canEdit && (
          <Button
            onClick={() => setDialogOpen(true)}
            size="sm"
            variant="outline"
          >
            <Plus />
            {t("projects:resources.addResource")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-64" />
        </div>
      ) : links.length === 0 ? (
        <div className="mt-2">
          <p className="text-sm font-medium text-foreground">
            {t("projects:resources.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("projects:resources.emptyDescription")}
          </p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {links.map((link) => (
            <ProjectResourceRow
              canEdit={canEdit}
              key={link.id}
              link={link}
              onEdit={() => setDialogOpen(true)}
              onUnlink={() =>
                setUnlinkTarget({ id: link.id, name: link.resource.name })
              }
              organizationSlug={organizationSlug}
            />
          ))}
        </ul>
      )}

      <ProjectResourceLinkDialog
        linked={links}
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        organizationId={organizationId}
        projectId={projectId}
      />

      <ProjectResourceUnlinkDialog
        isPending={deleteLink.isPending}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={() => {
          if (unlinkTarget) {
            deleteLink.mutate(
              { id: projectId, linkId: unlinkTarget.id },
              { onSuccess: () => setUnlinkTarget(null) },
            );
          }
        }}
        open={unlinkTarget !== null}
      />
    </section>
  );
}

export default ProjectContextualResources;
