import { publishEvent } from "../../events";
import { renameProjectSlug } from "../../identity/rename-identity";
import { findProjectById } from "../project-projection";

async function renameProjectSlugController(
  projectId: string,
  organizationId: string,
  slug: string,
  userId: string,
) {
  await renameProjectSlug(projectId, organizationId, slug);
  await publishEvent("project.updated", { organizationId, projectId });
  return findProjectById(organizationId, projectId, userId);
}

export default renameProjectSlugController;
