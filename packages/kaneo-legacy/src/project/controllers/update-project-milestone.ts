import { and, eq } from "drizzle-orm";
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
 * Update mutable metadata/order only. Omitted optional fields retain their
 * values; explicit null clears description/target date. Completion attribution
 * is never authored through generic update.
 */
async function updateProjectMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  userId: string,
  input: {
    name: string;
    description?: string | null;
    targetDate?: string | null;
    rank: number;
  },
) {
  const name = parseMilestoneName(input.name);
  const rank = parseMilestoneRank(input.rank);

  const set: {
    name: string;
    rank: number;
    description?: string | null;
    targetDate?: string | null;
  } = { name, rank };
  if (input.description !== undefined) {
    set.description = parseMilestoneDescription(input.description);
  }
  if (input.targetDate !== undefined) {
    set.targetDate = parseMilestoneTargetDate(input.targetDate);
  }

  const [updated] = await db
    .update(projectMilestoneTable)
    .set(set)
    .where(
      and(
        eq(projectMilestoneTable.projectId, projectId),
        eq(projectMilestoneTable.id, milestoneId),
      ),
    )
    .returning({ id: projectMilestoneTable.id });
  if (!updated) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  await publishEvent("project.updated", { organizationId, projectId });

  const milestone = await getProjectMilestone(
    organizationId,
    projectId,
    milestoneId,
    userId,
  );
  if (!milestone) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  return milestone;
}

export default updateProjectMilestone;
