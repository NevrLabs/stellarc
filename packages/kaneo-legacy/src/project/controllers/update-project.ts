import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { findProjectById } from "../project-projection";
import { validateProjectLeads } from "../validate-project-leads";
import {
  assertValidProjectPriority,
  assertValidProjectStatus,
} from "./create-project";

export type UpdateProjectInput = {
  organizationId: string;
  updatedBy: string;
  name: string;
  summary: string;
  status: string;
  priority: string | null;
  icon: string | null;
  color: string | null;
  description: string | null;
  successCriteria: string | null;
  leadUserId: string;
  leadTeamId: string | null;
  startDate: string | null;
  targetDate: string | null;
  orgPrivilege: string | null;
};

async function updateProject(projectId: string, input: UpdateProjectInput) {
  assertValidProjectStatus(input.status);
  assertValidProjectPriority(input.priority);

  await validateProjectLeads({
    organizationId: input.organizationId,
    leadUserId: input.leadUserId,
    leadTeamId: input.leadTeamId,
  });

  const [existing] = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  await db
    .update(projectTable)
    .set({
      name: input.name,
      summary: input.summary,
      status: input.status,
      priority: input.priority,
      icon: input.icon,
      color: input.color,
      description: input.description,
      successCriteria: input.successCriteria,
      leadUserId: input.leadUserId,
      leadTeamId: input.leadTeamId,
      startDate: input.startDate,
      targetDate: input.targetDate,
      orgPrivilege: input.orgPrivilege,
    })
    .where(eq(projectTable.id, projectId));

  const project = await findProjectById(
    input.organizationId,
    projectId,
    input.updatedBy,
  );
  if (!project) {
    throw new HTTPException(500, { message: "Failed to load updated project" });
  }
  await publishEvent("project.updated", {
    organizationId: input.organizationId,
    projectId,
  });
  return project;
}

export default updateProject;
