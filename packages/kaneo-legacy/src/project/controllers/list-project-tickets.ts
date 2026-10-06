import { listProjectTickets } from "../project-projection";

/** List Board-viewable scoped ticket projections and requester-filtered progress. */
export async function listProjectTicketsCtrl(
  organizationId: string,
  projectId: string,
  userId: string,
) {
  return listProjectTickets(organizationId, projectId, userId);
}

export default listProjectTicketsCtrl;
