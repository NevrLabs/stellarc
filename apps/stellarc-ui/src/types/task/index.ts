type TaskLabel = {
  id: string;
  name: string;
  color: string;
};

type TaskExternalLink = {
  id: string;
  taskId: string;
  integrationId: string;
  resourceType: string;
  externalId: string;
  url: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

export type TaskRepoLinkSummary = {
  id: string;
  itemType: "issues" | "pull-requests";
  number: number;
  title: string;
  url: string;
  syncEnabled: boolean;
};

type TaskParent = {
  id: string;
  number: number | null;
  title: string;
  status: string;
};

type Task = {
  id: string;
  title: string;
  number: number | null;
  description?: string | null;
  detailVersion?: string;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  position: number | null;
  createdAt: string;
  updatedAt?: string;
  userId: string | null;
  teamId?: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage?: string | null;
  teamAssigneeName?: string | null;
  boardId: string;
  milestoneId?: string | null;
  milestoneName?: string | null;
  columnId?: string | null;
  /**
   * #226: archival is ORTHOGONAL to status — an archived ticket keeps its real
   * workflow status. Non-null means archived, so it is hidden everywhere except
   * the backlog's archived section. Never encode archival in `status`.
   */
  archivedAt?: string | null;
  /** Display name of the archiving user; null for pre-migration rows. */
  archivedByName?: string | null;
  labels?: TaskLabel[];
  externalLinks?: TaskExternalLink[];
  repoLinks?: TaskRepoLinkSummary[];
  flags?: TaskFlag[];
  /** Parent of a `subtask` relation, when this task is a child. */
  parentTask?: TaskParent | null;
};

export default Task;

import type { TaskFlag } from "@/fetchers/flag/get-task-flags";
