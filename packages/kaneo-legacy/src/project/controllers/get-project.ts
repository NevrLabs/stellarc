import { HTTPException } from "hono/http-exception";
import { findProjectById } from "../project-projection";

async function getProject(
  organizationId: string,
  projectId: string,
  userId: string,
) {
  const project = await findProjectById(organizationId, projectId, userId);
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  return project;
}

export default getProject;
