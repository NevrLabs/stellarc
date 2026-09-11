import { FolderKanban, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import CreateProjectModal from "./create-project-modal";
import ProjectHeader from "./project-header";
import ProjectList from "./project-list";

/**
 * Mirrors Board overview's table/loading/empty pattern. Default filter shows
 * active/planned projects (status != completed/canceled and not archived);
 * `includeArchived` opts into the archived section, matching Board's
 * includeArchived query flag.
 */
export function ProjectsOverview() {
  const { t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const { canCreateProjects } = useOrganizationPermission();
  const canCreate = canCreateProjects();

  const { data: projects, isLoading } = useGetProjects({
    organizationId,
    includeArchived,
  });

  const { active, completed } = useMemo(() => {
    const list = projects ?? [];
    return {
      active: list.filter(
        (p) => p.status === "planned" || p.status === "started",
      ),
      completed: list.filter(
        (p) => p.status === "completed" || p.status === "canceled",
      ),
    };
  }, [projects]);

  const headerActions = canCreate ? (
    <Button
      className="gap-1"
      onClick={() => setIsCreateOpen(true)}
      size="xs"
      variant="outline"
    >
      <Plus className="h-3 w-3" />
      {t("projects:overview.newProject")}
    </Button>
  ) : null;

  if (isLoading) {
    return (
      <>
        <PageTitle title={t("projects:overview.title")} />
        <ProjectHeader
          headerActions={headerActions}
          title={t("projects:overview.title")}
        >
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <Skeleton className="h-12 w-full" key={i} />
            ))}
          </div>
        </ProjectHeader>
      </>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <>
        <PageTitle title={t("projects:overview.title")} />
        <ProjectHeader
          headerActions={headerActions}
          title={t("projects:overview.title")}
        >
          <Empty className="min-h-[60vh]" data-testid="projects-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderKanban />
              </EmptyMedia>
              <EmptyTitle>{t("projects:overview.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("projects:overview.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {canCreate && (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus />
                  {t("projects:overview.newProject")}
                </Button>
              )}
            </EmptyContent>
          </Empty>
        </ProjectHeader>
        <CreateProjectModal
          onClose={() => setIsCreateOpen(false)}
          open={isCreateOpen}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle title={t("projects:overview.title")} />
      <ProjectHeader
        headerActions={headerActions}
        title={t("projects:overview.title")}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Checkbox
            checked={includeArchived}
            id="include-archived"
            onCheckedChange={(checked) => setIncludeArchived(checked === true)}
          />
          <label
            className="text-sm text-muted-foreground"
            htmlFor="include-archived"
          >
            {t("projects:overview.includeArchived")}
          </label>
        </div>
        <ProjectList projects={active} />
        {completed.length > 0 && <ProjectList projects={completed} />}
      </ProjectHeader>
      <CreateProjectModal
        onClose={() => setIsCreateOpen(false)}
        open={isCreateOpen}
      />
    </>
  );
}

export default ProjectsOverview;
