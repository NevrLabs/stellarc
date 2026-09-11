import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useArchiveProject from "@/hooks/mutations/project/use-archive-project";
import useUnarchiveProject from "@/hooks/mutations/project/use-unarchive-project";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import type { ProjectRowData } from "./project-row";
import { ProjectRow } from "./project-row";

type ProjectListProps = {
  projects: ProjectRowData[];
};

/**
 * Desktop table / mobile row list. Board overview uses a `<Table>` for
 * desktop; Project reuses the same primitive and the same `ProjectRow`
 * content works for both breakpoints since it's already a flex row rather
 * than fixed table cells.
 */
export function ProjectList({ projects }: ProjectListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: organization } = useActiveOrganization();
  const { canUpdateProjects } = useOrganizationPermission();
  const canArchive = canUpdateProjects();
  const { mutate: archive } = useArchiveProject();
  const { mutate: unarchive } = useUnarchiveProject();

  const handleClick = (project: ProjectRowData) => {
    navigate({
      to: "/dashboard/organization/$organizationSlug/projects/$projectSlug",
      params: {
        organizationSlug: organization?.slug ?? "",
        projectSlug: project.slug,
      },
    });
  };

  return (
    <Table className="hidden md:table" data-testid="project-list-table">
      <TableHeader>
        <TableRow>
          <TableHead>{t("projects:labels.name")}</TableHead>
          <TableHead>{t("projects:labels.lifecycle")}</TableHead>
          <TableHead>{t("projects:labels.lead")}</TableHead>
          <TableHead>{t("projects:labels.targetDate")}</TableHead>
          <TableHead>{t("projects:labels.noScopedWork")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell colSpan={5} className="p-0">
              <ProjectRow
                canArchive={canArchive}
                onArchive={() => archive({ id: project.id })}
                onClick={() => handleClick(project)}
                onUnarchive={() => unarchive({ id: project.id })}
                project={project}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default ProjectList;
