import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectMilestoneTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getProjectMilestone } from "../project-projection";
import {
  parseMilestoneDescription,
  parseMilestoneName,
  parseMilestoneRank,
  parseMilestoneTargetDate,
} from "./milestone-fields";

/**
 * Create an open Project Milestone. Completion fields are never authored here:
 * a new milestone is always open with null completion attribution.
 */
async function createProjectMilestone(
  organizationId: string,
  projectId: string,
  userId: string,
  input: {
    name: string;
    description?: string | null;
    targetDate?: string | null;
    rank?: number;
  },
) {
  const name = parseMilestoneName(input.name);
  const description = parseMilestoneDescription(input.description);
  const targetDate = parseMilestoneTargetDate(input.targetDate);
  const rank = parseMilestoneRank(input.rank);

  const [row] = await db
    .insert(projectMilestoneTable)
    .values({ projectId, name, description, targetDate, rank })
    .returning();
  if (!row) {
    throw new HTTPException(500, { message: "Failed to create milestone" });
  }

  // Post-commit: refresh Project and Milestone consumers in this organization.
  await publishEvent("project.updated", { organizationId, projectId });

  const milestone = await getProjectMilestone(
    organizationId,
    projectId,
    row.id,
    userId,
  );
  if (!milestone) {
    throw new HTTPException(500, { message: "Failed to load milestone" });
  }
  return milestone;
}

export default createProjectMilestone;
