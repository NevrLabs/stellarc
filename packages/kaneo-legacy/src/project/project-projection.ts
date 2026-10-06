import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../database";
import {
  boardTable,
  projectMilestoneTable,
  projectTable,
  projectTicketTable,
  taskTable,
  teamTable,
  userTable,
} from "../database/schema";
import {
  getResourcePrivilege,
  listAccessibleResourceIds,
} from "../resource-access";

// The archiver is a second join against user, separate from the lead join.
const archivedByUser = alias(userTable, "archived_by_user");

/** KFL-367 derived, authorization-filtered project progress. */
export type ProjectProgress = {
  completed: number;
  eligible: number;
  percent: number | null;
};

/** Authorization-safe ticket projection for a scoped Project ticket. */
export type ProjectTicket = {
  id: string;
  boardId: string;
  boardSlug: string;
  boardName: string;
  number: number;
  key: string;
  title: string;
  status: string;
  priority: string | null;
  archivedAt: Date | null;
  startDate: Date | null;
  dueDate: Date | null;
  projectMilestoneId: string | null;
  rank: number;
  addedAt: Date;
  addedBy: string;
};

/** KFL-369 derived, authorization-filtered Project Milestone projection. */
export type ProjectMilestone = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  rank: number;
  completedAt: Date | null;
  completedBy: { id: string; name: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  progress: ProjectProgress;
};

/** Raw membership + task + board join row before visibility filtering. */
type MembershipRow = {
  projectId: string;
  taskId: string;
  boardId: string;
  boardSlug: string;
  boardName: string;
  number: number;
  title: string;
  status: string;
  priority: string | null;
  archivedAt: Date | null;
  startDate: Date | null;
  dueDate: Date | null;
  deletedAt: Date | null;
  rank: number;
  addedAt: Date;
  addedBy: string;
  projectMilestoneId: string | null;
};

export const projectSelection = {
  id: projectTable.id,
  organizationId: projectTable.organizationId,
  slug: projectTable.slug,
  name: projectTable.name,
  icon: projectTable.icon,
  color: projectTable.color,
  summary: projectTable.summary,
  description: projectTable.description,
  successCriteria: projectTable.successCriteria,
  status: projectTable.status,
  priority: projectTable.priority,
  leadUserId: projectTable.leadUserId,
  leadUserName: userTable.name,
  leadTeamId: projectTable.leadTeamId,
  leadTeamName: teamTable.name,
  startDate: projectTable.startDate,
  targetDate: projectTable.targetDate,
  orgPrivilege: projectTable.orgPrivilege,
  archivedAt: projectTable.archivedAt,
  archivedBy: projectTable.archivedBy,
  archivedByName: archivedByUser.name,
  createdAt: projectTable.createdAt,
  updatedAt: projectTable.updatedAt,
  createdBy: projectTable.createdBy,
} as const;

export function projectSelectQuery() {
  return db
    .select(projectSelection)
    .from(projectTable)
    .leftJoin(userTable, eq(projectTable.leadUserId, userTable.id))
    .leftJoin(teamTable, eq(projectTable.leadTeamId, teamTable.id))
    .leftJoin(archivedByUser, eq(projectTable.archivedBy, archivedByUser.id));
}

/**
 * One set-based query for the membership rows of one or many projects, joined
 * through Task to Board so progress and the ticket list share the same source.
 */
async function loadMembershipRows(
  projectIds: string[],
): Promise<MembershipRow[]> {
  if (projectIds.length === 0) return [];
  return db
    .select({
      projectId: projectTicketTable.projectId,
      taskId: taskTable.id,
      boardId: taskTable.boardId,
      boardSlug: boardTable.slug,
      boardName: boardTable.name,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      priority: taskTable.priority,
      archivedAt: taskTable.archivedAt,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      deletedAt: taskTable.deletedAt,
      rank: projectTicketTable.rank,
      addedAt: projectTicketTable.addedAt,
      addedBy: projectTicketTable.addedBy,
      projectMilestoneId: projectTicketTable.projectMilestoneId,
    })
    .from(projectTicketTable)
    .innerJoin(taskTable, eq(projectTicketTable.taskId, taskTable.id))
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(inArray(projectTicketTable.projectId, projectIds));
}

/**
 * Intersect the membership rows with the Board IDs the requester can actually
 * view. A Project grant never grants Board/Ticket access, so an invisible
 * board must not leak its tickets nor contribute to the aggregate.
 */
async function filterVisibleRows(
  organizationId: string,
  userId: string,
  rows: MembershipRow[],
): Promise<MembershipRow[]> {
  if (rows.length === 0) return [];
  const boardIds = [...new Set(rows.map((row) => row.boardId))];
  const visibleBoardIds = new Set(
    await listAccessibleResourceIds({
      organizationId,
      resourceType: "board",
      userId,
      resourceIds: boardIds,
    }),
  );
  return rows.filter((row) => visibleBoardIds.has(row.boardId));
}

/**
 * Eligible = visible tickets that are neither deleted nor archived nor in a
 * `canceled`/`duplicate` terminal state. `done` is the only completed status.
 */
export function deriveProjectProgress(rows: MembershipRow[]): ProjectProgress {
  const eligible = rows.filter(
    (row) =>
      row.deletedAt === null &&
      row.archivedAt === null &&
      row.status !== "canceled" &&
      row.status !== "duplicate",
  );
  const completed = eligible.filter((row) => row.status === "done").length;
  const eligibleCount = eligible.length;
  return {
    completed,
    eligible: eligibleCount,
    percent: eligibleCount === 0 ? null : (completed / eligibleCount) * 100,
  };
}

export function toProjectTicket(row: MembershipRow): ProjectTicket {
  return {
    id: row.taskId,
    boardId: row.boardId,
    boardSlug: row.boardSlug,
    boardName: row.boardName,
    number: row.number,
    key: `${row.boardSlug}-${row.number}`,
    title: row.title,
    status: row.status,
    priority: row.priority,
    archivedAt: row.archivedAt,
    startDate: row.startDate,
    dueDate: row.dueDate,
    projectMilestoneId: row.projectMilestoneId ?? null,
    rank: row.rank,
    addedAt: row.addedAt,
    addedBy: row.addedBy,
  };
}

export async function listProjectTickets(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<{ tickets: ProjectTicket[]; progress: ProjectProgress }> {
  const rows = await filterVisibleRows(
    organizationId,
    userId,
    await loadMembershipRows([projectId]),
  );
  const orderedRows = [...rows].sort(
    (left, right) =>
      left.rank - right.rank ||
      left.addedAt.getTime() - right.addedAt.getTime() ||
      left.taskId.localeCompare(right.taskId),
  );
  return {
    tickets: orderedRows.map(toProjectTicket),
    progress: deriveProjectProgress(rows),
  };
}

/**
 * Ordered, requester-filtered Project Milestones with progress derived from the
 * same visible/eligible membership set KFL-367 uses. Progress is per-milestone:
 * only rows whose `project_milestone_id` matches the milestone contribute.
 */
export async function listProjectMilestones(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<ProjectMilestone[]> {
  const milestones = await db
    .select({
      id: projectMilestoneTable.id,
      projectId: projectMilestoneTable.projectId,
      name: projectMilestoneTable.name,
      description: projectMilestoneTable.description,
      targetDate: projectMilestoneTable.targetDate,
      rank: projectMilestoneTable.rank,
      completedAt: projectMilestoneTable.completedAt,
      completedById: projectMilestoneTable.completedBy,
      completedByName: userTable.name,
      createdAt: projectMilestoneTable.createdAt,
      updatedAt: projectMilestoneTable.updatedAt,
    })
    .from(projectMilestoneTable)
    .leftJoin(userTable, eq(projectMilestoneTable.completedBy, userTable.id))
    .where(eq(projectMilestoneTable.projectId, projectId))
    .orderBy(
      asc(projectMilestoneTable.rank),
      asc(projectMilestoneTable.createdAt),
      asc(projectMilestoneTable.id),
    );

  const rows = await filterVisibleRows(
    organizationId,
    userId,
    await loadMembershipRows([projectId]),
  );

  return milestones.map((milestone) => ({
    id: milestone.id,
    projectId: milestone.projectId,
    name: milestone.name,
    description: milestone.description,
    targetDate: milestone.targetDate,
    rank: milestone.rank,
    completedAt: milestone.completedAt,
    completedBy: milestone.completedById
      ? { id: milestone.completedById, name: milestone.completedByName }
      : null,
    createdAt: milestone.createdAt,
    updatedAt: milestone.updatedAt,
    progress: deriveProjectProgress(
      rows.filter((row) => row.projectMilestoneId === milestone.id),
    ),
  }));
}

/** Single authorization-safe Project Milestone projection (or null). */
export async function getProjectMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  userId: string,
): Promise<ProjectMilestone | null> {
  const milestones = await listProjectMilestones(
    organizationId,
    projectId,
    userId,
  );
  return milestones.find((milestone) => milestone.id === milestoneId) ?? null;
}

/** Single authorization-safe ticket projection for a scoped ticket. */
export async function findProjectTicket(
  organizationId: string,
  projectId: string,
  taskId: string,
  userId: string,
): Promise<ProjectTicket | null> {
  const { tickets } = await listProjectTickets(
    organizationId,
    projectId,
    userId,
  );
  return tickets.find((ticket) => ticket.id === taskId) ?? null;
}

export async function getProjectProgress(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<ProjectProgress> {
  const rows = await filterVisibleRows(
    organizationId,
    userId,
    await loadMembershipRows([projectId]),
  );
  return deriveProjectProgress(rows);
}

/** Batch progress for many projects sharing one visible-board computation. */
export async function getProjectsProgressMap(
  organizationId: string,
  projectIds: string[],
  userId: string,
): Promise<Map<string, ProjectProgress>> {
  const rows = await filterVisibleRows(
    organizationId,
    userId,
    await loadMembershipRows(projectIds),
  );
  const map = new Map<string, ProjectProgress>();
  for (const projectId of projectIds) {
    map.set(
      projectId,
      deriveProjectProgress(rows.filter((row) => row.projectId === projectId)),
    );
  }
  return map;
}

export async function findProjectById(
  organizationId: string,
  projectId: string,
  userId: string,
) {
  const [row] = await projectSelectQuery()
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const viewerPrivilege = await getResourcePrivilege({
    organizationId,
    resourceType: "project",
    resourceId: projectId,
    userId,
  });
  return {
    ...row,
    viewerPrivilege,
    progress: await getProjectProgress(organizationId, projectId, userId),
    health: null,
  };
}

export async function findProjectBySlug(
  organizationId: string,
  slug: string,
  userId: string,
) {
  const normalized = slug.toLowerCase();
  const [row] = await projectSelectQuery()
    .where(
      and(
        eq(projectTable.organizationId, organizationId),
        sql`lower(${projectTable.slug}) = ${normalized}`,
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    progress: await getProjectProgress(organizationId, row.id, userId),
    health: null,
  };
}

export async function listProjectsForOrganization(
  organizationId: string,
  includeArchived: boolean,
  userId: string,
) {
  const rows = await projectSelectQuery()
    .where(
      includeArchived
        ? eq(projectTable.organizationId, organizationId)
        : and(
            eq(projectTable.organizationId, organizationId),
            isNull(projectTable.archivedAt),
          ),
    )
    .orderBy(projectTable.createdAt);

  const progressMap = await getProjectsProgressMap(
    organizationId,
    rows.map((row) => row.id),
    userId,
  );

  return rows.map((row) => ({
    ...row,
    progress: progressMap.get(row.id) ?? {
      completed: 0,
      eligible: 0,
      percent: null,
    },
    health: null,
  }));
}
