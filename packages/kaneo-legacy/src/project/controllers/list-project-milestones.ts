import { listProjectMilestones } from "../project-projection";

/** List requester-filtered Project Milestones with derived progress. */
async function listProjectMilestonesCtrl(
  organizationId: string,
  projectId: string,
  userId: string,
) {
  return listProjectMilestones(organizationId, projectId, userId);
}

export default listProjectMilestonesCtrl;
