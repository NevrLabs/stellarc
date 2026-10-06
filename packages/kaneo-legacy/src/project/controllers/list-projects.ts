import { listAccessibleResourceIds } from "../../resource-access";
import { listProjectsForOrganization } from "../project-projection";

async function listProjects(
  organizationId: string,
  userId: string,
  includeArchived = false,
) {
  const projects = await listProjectsForOrganization(
    organizationId,
    includeArchived,
    userId,
  );

  const accessibleIds = new Set(
    await listAccessibleResourceIds({
      organizationId,
      resourceType: "project",
      userId,
      resourceIds: projects.map((project) => project.id),
    }),
  );

  return projects.filter((project) => accessibleIds.has(project.id));
}

export default listProjects;
