// Fork Task type (apps/stellarc-ui/src/types/task) and BoardWithTasks
// (src/types/board) inlined as structural types: this module must stay
// import-free so the ROOT tsconfig program (which excludes
// apps/stellarc-ui/** - its modules resolve @/ and @kaneo/libs aliases the
// root program cannot see) never pulls UI files in through tests/unit.
export type TaskView = {
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
  archivedAt?: string | null;
  labels?: Array<{ id: string; name: string; color: string }>;
  externalLinks?: Array<Record<string, unknown>>;
  repoLinks?: Array<Record<string, unknown>>;
  flags?: Array<Record<string, unknown>>;
  parentTask?: {
    id: string;
    number: number | null;
    title: string;
    status: string;
  } | null;
};

export type BoardColumnView = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  isFinal: boolean;
  tasks: TaskView[];
};

export type BoardWithTasksView = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  isPublic: boolean | null;
  organizationId: string;
  defaultAssigneeId: string | null;
  defaultAssigneeTeamId: string | null;
  orgPrivilege: string | null;
  taskStatusOrder: string[];
  backlogStatusOrder: string[];
  subtaskDepthLimit: number;
  archivedAt: string | null;
  createdAt: string;
  columns: BoardColumnView[];
  archivedTasks: TaskView[];
  plannedTasks: TaskView[];
  triageTasks: TaskView[];
};

/**
 * STL-16 §4/§6 (T28): pure view-model from the eight live work collections to
 * the fork BoardWithTasks shape the five frozen screens consume. Grouping
 * mirrors the fork's get-tasks.ts (#226): archived tickets keep their real
 * status but appear ONLY in archivedTasks; deleted tickets are invisible;
 * `triage`/`planned` are backlog sections, never columns. No fetching, no
 * React — trivially testable and reusable across the frozen views.
 */

export type WorkBoardRow = {
  id: string;
  organizationId: string;
  slug: string;
  icon: string | null;
  name: string;
  description: string | null;
  createdAt: string;
  isPublic: boolean | null;
  archivedAt: string | null;
  lastTaskNumber: number;
  orgPrivilege: string | null;
  taskStatusOrder: string[];
  backlogStatusOrder: string[];
  subtaskDepthLimit: number;
  defaultAssigneeId: string | null;
  defaultAssigneeTeamId: string | null;
};

export type WorkStatusRow = {
  id: string;
  boardId: string;
  name: string;
  slug: string;
  position: number;
  icon: string | null;
  color: string | null;
  isFinal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkTicketRow = {
  id: string;
  boardId: string;
  position: number | null;
  number: number | null;
  assigneeId: string | null;
  teamAssigneeId: string | null;
  title: string;
  description: string | null;
  descriptionHistory: Array<Record<string, unknown>>;
  status: string;
  columnId: string | null;
  priority: string | null;
  milestoneId: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  key: string | null;
};

export type WorkLabelRow = {
  id: string;
  name: string;
  color: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  taskId: string | null;
  organizationId: string | null;
};

export type WorkRows = {
  board: WorkBoardRow[];
  boardKeyAlias: Array<{ id: string; boardId: string; key: string }>;
  status: WorkStatusRow[];
  ticket: WorkTicketRow[];
  label: WorkLabelRow[];
  taskTemplate: Array<Record<string, unknown>>;
  flagType: Array<Record<string, unknown>>;
  taskFlag: Array<Record<string, unknown>>;
};

export function toTask(
  ticket: WorkTicketRow,
  labelsByTask: Map<string, Array<{ id: string; name: string; color: string }>>,
): TaskView {
  return {
    id: ticket.id,
    title: ticket.title,
    number: ticket.number,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    startDate: ticket.startDate,
    dueDate: ticket.dueDate,
    position: ticket.position,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    userId: ticket.assigneeId,
    teamId: ticket.teamAssigneeId,
    assigneeId: ticket.assigneeId,
    assigneeName: null,
    teamAssigneeName: null,
    boardId: ticket.boardId,
    milestoneId: ticket.milestoneId,
    columnId: ticket.columnId,
    archivedAt: ticket.archivedAt,
    labels: labelsByTask.get(ticket.id) ?? [],
    externalLinks: [],
    repoLinks: [],
    flags: [],
    parentTask: null,
  };
}

export function buildBoardWithTasks(
  rows: WorkRows,
  boardId: string,
): BoardWithTasksView | undefined {
  const board = rows.board.find((b) => b.id === boardId);
  if (!board) return undefined;

  const labelsByTask = new Map<
    string,
    Array<{ id: string; name: string; color: string }>
  >();
  for (const label of rows.label) {
    if (!label.taskId) continue;
    const list = labelsByTask.get(label.taskId) ?? [];
    list.push({ id: label.id, name: label.name, color: label.color });
    labelsByTask.set(label.taskId, list);
  }

  const tickets = rows.ticket.filter(
    (t) => t.boardId === boardId && t.deletedAt == null,
  );
  const columns = [...rows.status]
    .filter((s) => s.boardId === boardId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((status) => ({
      id: status.slug,
      slug: status.slug,
      name: status.name,
      icon: status.icon,
      isFinal: status.isFinal,
      tasks: tickets
        .filter((t) => t.status === status.slug && t.archivedAt == null)
        .sort(
          (a, b) =>
            (a.position ?? 0) - (b.position ?? 0) ||
            (a.number ?? 0) - (b.number ?? 0) ||
            a.id.localeCompare(b.id),
        )
        .map((t) => toTask(t, labelsByTask)),
    }));

  const backlog = (status: string) =>
    tickets
      .filter((t) => t.status === status && t.archivedAt == null)
      .sort(
        (a, b) =>
          (a.position ?? 0) - (b.position ?? 0) ||
          (a.number ?? 0) - (b.number ?? 0) ||
          a.id.localeCompare(b.id),
      )
      .map((t) => toTask(t, labelsByTask));

  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    icon: board.icon,
    description: board.description,
    isPublic: board.isPublic,
    organizationId: board.organizationId,
    defaultAssigneeId: board.defaultAssigneeId,
    defaultAssigneeTeamId: board.defaultAssigneeTeamId,
    orgPrivilege: board.orgPrivilege,
    taskStatusOrder: board.taskStatusOrder,
    backlogStatusOrder: board.backlogStatusOrder,
    subtaskDepthLimit: board.subtaskDepthLimit,
    archivedAt: board.archivedAt,
    createdAt: board.createdAt,
    columns,
    archivedTasks: tickets
      .filter((t) => t.archivedAt != null)
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      .map((t) => toTask(t, labelsByTask)),
    plannedTasks: backlog("planned"),
    triageTasks: backlog("triage"),
  };
}
