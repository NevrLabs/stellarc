import { relations } from "drizzle-orm";
import {
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  boardTable,
  columnTable,
  commentTable,
  dataTableCellTable,
  dataTableFieldTable,
  dataTableRowTable,
  dataTableTable,
  externalLinkTable,
  githubIntegrationTable,
  integrationTable,
  invitationTable,
  labelTable,
  notificationTable,
  organizationGithubInstallationTable,
  organizationMemberTable,
  organizationRoleTable,
  organizationTable,
  projectBoardTable,
  projectMilestoneTable,
  projectRepoTable,
  projectSlugAliasTable,
  projectTable,
  projectTableLinkTable,
  projectTicketTable,
  projectUpdateTable,
  repoIssueTable,
  repoPullRequestTable,
  repoTable,
  sessionTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  userNotificationOrgBoardTable,
  userNotificationOrgRuleTable,
  userNotificationPreferenceTable,
  userTable,
  verificationTable,
  workflowRuleTable,
} from "./schema";

export const userTableRelations = relations(userTable, ({ many, one }) => ({
  sessions: many(sessionTable),
  accounts: many(accountTable),
  teamMembers: many(teamMemberTable),
  organizations: many(organizationTable),
  organizationMemberships: many(organizationMemberTable),
  assignedTasks: many(taskTable),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  notifications: many(notificationTable),
  notificationPreference: one(userNotificationPreferenceTable),
  notificationOrganizationRules: many(userNotificationOrgRuleTable),
  sentInvitations: many(invitationTable),
  apikeys: many(apikeyTable),
}));

export const sessionTableRelations = relations(sessionTable, ({ one }) => ({
  user: one(userTable, {
    fields: [sessionTable.userId],
    references: [userTable.id],
  }),
}));

export const accountTableRelations = relations(accountTable, ({ one }) => ({
  user: one(userTable, {
    fields: [accountTable.userId],
    references: [userTable.id],
  }),
}));

export const verificationTableRelations = relations(
  verificationTable,
  () => ({}),
);

export const organizationTableRelations = relations(
  organizationTable,
  ({ many }) => ({
    teams: many(teamTable),
    members: many(organizationMemberTable),
    boards: many(boardTable),
    dataTables: many(dataTableTable),
    assets: many(assetTable),
    invitations: many(invitationTable),
    notificationOrganizationRules: many(userNotificationOrgRuleTable),
    githubInstallations: many(organizationGithubInstallationTable),
  }),
);

export const dataTableTableRelations = relations(
  dataTableTable,
  ({ one, many }) => ({
    organization: one(organizationTable, {
      fields: [dataTableTable.organizationId],
      references: [organizationTable.id],
    }),
    fields: many(dataTableFieldTable),
    rows: many(dataTableRowTable),
    projectLinks: many(projectTableLinkTable),
  }),
);

export const dataTableFieldTableRelations = relations(
  dataTableFieldTable,
  ({ one, many }) => ({
    table: one(dataTableTable, {
      fields: [dataTableFieldTable.tableId],
      references: [dataTableTable.id],
    }),
    cells: many(dataTableCellTable),
  }),
);

export const dataTableRowTableRelations = relations(
  dataTableRowTable,
  ({ one, many }) => ({
    table: one(dataTableTable, {
      fields: [dataTableRowTable.tableId],
      references: [dataTableTable.id],
    }),
    cells: many(dataTableCellTable),
  }),
);

export const dataTableCellTableRelations = relations(
  dataTableCellTable,
  ({ one }) => ({
    row: one(dataTableRowTable, {
      fields: [dataTableCellTable.rowId],
      references: [dataTableRowTable.id],
    }),
    field: one(dataTableFieldTable, {
      fields: [dataTableCellTable.fieldId],
      references: [dataTableFieldTable.id],
    }),
  }),
);

export const organizationGithubInstallationTableRelations = relations(
  organizationGithubInstallationTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [organizationGithubInstallationTable.organizationId],
      references: [organizationTable.id],
    }),
  }),
);

export const organizationMemberTableRelations = relations(
  organizationMemberTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [organizationMemberTable.organizationId],
      references: [organizationTable.id],
    }),
    user: one(userTable, {
      fields: [organizationMemberTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const boardTableRelations = relations(boardTable, ({ one, many }) => ({
  organization: one(organizationTable, {
    fields: [boardTable.organizationId],
    references: [organizationTable.id],
  }),
  tasks: many(taskTable),
  assets: many(assetTable),
  columns: many(columnTable),
  workflowRules: many(workflowRuleTable),
  githubIntegration: many(githubIntegrationTable),
  notificationOrganizationBoards: many(userNotificationOrgBoardTable),
  projectLinks: many(projectBoardTable),
}));

export const projectTableRelations = relations(
  projectTable,
  ({ one, many }) => ({
    organization: one(organizationTable, {
      fields: [projectTable.organizationId],
      references: [organizationTable.id],
    }),
    lead: one(userTable, {
      fields: [projectTable.leadUserId],
      references: [userTable.id],
    }),
    leadTeam: one(teamTable, {
      fields: [projectTable.leadTeamId],
      references: [teamTable.id],
    }),
    archivedByUser: one(userTable, {
      fields: [projectTable.archivedBy],
      references: [userTable.id],
    }),
    createdByUser: one(userTable, {
      fields: [projectTable.createdBy],
      references: [userTable.id],
    }),
    slugAliases: many(projectSlugAliasTable),
    tickets: many(projectTicketTable),
    milestones: many(projectMilestoneTable),
    boardLinks: many(projectBoardTable),
    repoLinks: many(projectRepoTable),
    tableLinks: many(projectTableLinkTable),
  }),
);

export const projectSlugAliasTableRelations = relations(
  projectSlugAliasTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [projectSlugAliasTable.organizationId],
      references: [organizationTable.id],
    }),
    project: one(projectTable, {
      fields: [projectSlugAliasTable.projectId],
      references: [projectTable.id],
    }),
  }),
);

export const projectTicketTableRelations = relations(
  projectTicketTable,
  ({ one }) => ({
    project: one(projectTable, {
      fields: [projectTicketTable.projectId],
      references: [projectTable.id],
    }),
    task: one(taskTable, {
      fields: [projectTicketTable.taskId],
      references: [taskTable.id],
    }),
    addedByUser: one(userTable, {
      fields: [projectTicketTable.addedBy],
      references: [userTable.id],
    }),
    projectMilestone: one(projectMilestoneTable, {
      fields: [projectTicketTable.projectMilestoneId],
      references: [projectMilestoneTable.id],
    }),
  }),
);
export const projectMilestoneTableRelations = relations(
  projectMilestoneTable,
  ({ one, many }) => ({
    project: one(projectTable, {
      fields: [projectMilestoneTable.projectId],
      references: [projectTable.id],
    }),
    completedByUser: one(userTable, {
      fields: [projectMilestoneTable.completedBy],
      references: [userTable.id],
    }),
    tickets: many(projectTicketTable),
  }),
);

export const columnTableRelations = relations(columnTable, ({ one, many }) => ({
  board: one(boardTable, {
    fields: [columnTable.boardId],
    references: [boardTable.id],
  }),
  tasks: many(taskTable),
  workflowRules: many(workflowRuleTable),
}));

export const workflowRuleTableRelations = relations(
  workflowRuleTable,
  ({ one }) => ({
    board: one(boardTable, {
      fields: [workflowRuleTable.boardId],
      references: [boardTable.id],
    }),
    column: one(columnTable, {
      fields: [workflowRuleTable.columnId],
      references: [columnTable.id],
    }),
  }),
);

export const taskTableRelations = relations(taskTable, ({ one, many }) => ({
  board: one(boardTable, {
    fields: [taskTable.boardId],
    references: [boardTable.id],
  }),
  assignee: one(userTable, {
    fields: [taskTable.userId],
    references: [userTable.id],
  }),
  teamAssignee: one(teamTable, {
    fields: [taskTable.teamId],
    references: [teamTable.id],
  }),
  column: one(columnTable, {
    fields: [taskTable.columnId],
    references: [columnTable.id],
  }),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  labels: many(labelTable),
  externalLinks: many(externalLinkTable),
  sourceRelations: many(taskRelationTable, { relationName: "sourceTask" }),
  targetRelations: many(taskRelationTable, { relationName: "targetTask" }),
  remindersSent: many(taskReminderSentTable),
}));

export const timeEntryTableRelations = relations(timeEntryTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [timeEntryTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [timeEntryTable.userId],
    references: [userTable.id],
  }),
}));

export const activityTableRelations = relations(activityTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [activityTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [activityTable.userId],
    references: [userTable.id],
  }),
}));

export const assetTableRelations = relations(assetTable, ({ one }) => ({
  organization: one(organizationTable, {
    fields: [assetTable.organizationId],
    references: [organizationTable.id],
  }),
  board: one(boardTable, {
    fields: [assetTable.boardId],
    references: [boardTable.id],
  }),
  task: one(taskTable, {
    fields: [assetTable.taskId],
    references: [taskTable.id],
  }),
  activity: one(activityTable, {
    fields: [assetTable.activityId],
    references: [activityTable.id],
  }),
  creator: one(userTable, {
    fields: [assetTable.createdBy],
    references: [userTable.id],
  }),
}));

export const labelTableRelations = relations(labelTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [labelTable.taskId],
    references: [taskTable.id],
  }),
}));

export const notificationTableRelations = relations(
  notificationTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [notificationTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationPreferenceTableRelations = relations(
  userNotificationPreferenceTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [userNotificationPreferenceTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationOrgRuleTableRelations = relations(
  userNotificationOrgRuleTable,
  ({ one, many }) => ({
    user: one(userTable, {
      fields: [userNotificationOrgRuleTable.userId],
      references: [userTable.id],
    }),
    organization: one(organizationTable, {
      fields: [userNotificationOrgRuleTable.organizationId],
      references: [organizationTable.id],
    }),
    selectedBoards: many(userNotificationOrgBoardTable),
  }),
);

export const userNotificationOrgBoardTableRelations = relations(
  userNotificationOrgBoardTable,
  ({ one }) => ({
    organizationRule: one(userNotificationOrgRuleTable, {
      fields: [
        userNotificationOrgBoardTable.organizationId,
        userNotificationOrgBoardTable.orgRuleId,
      ],
      references: [
        userNotificationOrgRuleTable.organizationId,
        userNotificationOrgRuleTable.id,
      ],
    }),
    board: one(boardTable, {
      fields: [
        userNotificationOrgBoardTable.organizationId,
        userNotificationOrgBoardTable.boardId,
      ],
      references: [boardTable.organizationId, boardTable.id],
    }),
  }),
);

export const githubIntegrationTableRelations = relations(
  githubIntegrationTable,
  ({ one }) => ({
    board: one(boardTable, {
      fields: [githubIntegrationTable.boardId],
      references: [boardTable.id],
    }),
  }),
);

export const teamTableRelations = relations(teamTable, ({ one, many }) => ({
  organization: one(organizationTable, {
    fields: [teamTable.organizationId],
    references: [organizationTable.id],
  }),
  teamMembers: many(teamMemberTable),
  assignedTasks: many(taskTable),
}));

export const teamMemberTableRelations = relations(
  teamMemberTable,
  ({ one }) => ({
    team: one(teamTable, {
      fields: [teamMemberTable.teamId],
      references: [teamTable.id],
    }),
    user: one(userTable, {
      fields: [teamMemberTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const invitationTableRelations = relations(
  invitationTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [invitationTable.organizationId],
      references: [organizationTable.id],
    }),
    inviter: one(userTable, {
      fields: [invitationTable.inviterId],
      references: [userTable.id],
    }),
  }),
);

export const organizationRoleTableRelations = relations(
  organizationRoleTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [organizationRoleTable.organizationId],
      references: [organizationTable.id],
    }),
  }),
);

export const apikeyTableRelations = relations(apikeyTable, ({ one }) => ({
  user: one(userTable, {
    fields: [apikeyTable.referenceId],
    references: [userTable.id],
  }),
}));

export const integrationTableRelations = relations(
  integrationTable,
  ({ one, many }) => ({
    board: one(boardTable, {
      fields: [integrationTable.boardId],
      references: [boardTable.id],
    }),
    externalLinks: many(externalLinkTable),
  }),
);

export const taskRelationTableRelations = relations(
  taskRelationTable,
  ({ one }) => ({
    sourceTask: one(taskTable, {
      fields: [taskRelationTable.sourceTaskId],
      references: [taskTable.id],
      relationName: "sourceTask",
    }),
    targetTask: one(taskTable, {
      fields: [taskRelationTable.targetTaskId],
      references: [taskTable.id],
      relationName: "targetTask",
    }),
  }),
);

export const externalLinkTableRelations = relations(
  externalLinkTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [externalLinkTable.taskId],
      references: [taskTable.id],
    }),
    integration: one(integrationTable, {
      fields: [externalLinkTable.integrationId],
      references: [integrationTable.id],
    }),
  }),
);

export const taskReminderSentTableRelations = relations(
  taskReminderSentTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskReminderSentTable.taskId],
      references: [taskTable.id],
    }),
  }),
);

export const commentTableRelations = relations(commentTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [commentTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [commentTable.userId],
    references: [userTable.id],
  }),
}));

export const repoTableRelations = relations(repoTable, ({ one, many }) => ({
  organization: one(organizationTable, {
    fields: [repoTable.organizationId],
    references: [organizationTable.id],
  }),
  issues: many(repoIssueTable),
  pullRequests: many(repoPullRequestTable),
  projectLinks: many(projectRepoTable),
}));

export const repoIssueTableRelations = relations(repoIssueTable, ({ one }) => ({
  repo: one(repoTable, {
    fields: [repoIssueTable.repoId],
    references: [repoTable.id],
  }),
}));

export const repoPullRequestTableRelations = relations(
  repoPullRequestTable,
  ({ one }) => ({
    repo: one(repoTable, {
      fields: [repoPullRequestTable.repoId],
      references: [repoTable.id],
    }),
  }),
);
export const projectBoardTableRelations = relations(
  projectBoardTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [projectBoardTable.organizationId],
      references: [organizationTable.id],
    }),
    project: one(projectTable, {
      fields: [projectBoardTable.projectId],
      references: [projectTable.id],
    }),
    board: one(boardTable, {
      fields: [projectBoardTable.boardId],
      references: [boardTable.id],
    }),
    creator: one(userTable, {
      fields: [projectBoardTable.createdBy],
      references: [userTable.id],
    }),
  }),
);

export const projectRepoTableRelations = relations(
  projectRepoTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [projectRepoTable.organizationId],
      references: [organizationTable.id],
    }),
    project: one(projectTable, {
      fields: [projectRepoTable.projectId],
      references: [projectTable.id],
    }),
    repo: one(repoTable, {
      fields: [projectRepoTable.repoId],
      references: [repoTable.id],
    }),
    creator: one(userTable, {
      fields: [projectRepoTable.createdBy],
      references: [userTable.id],
    }),
  }),
);

export const projectTableLinkTableRelations = relations(
  projectTableLinkTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [projectTableLinkTable.organizationId],
      references: [organizationTable.id],
    }),
    project: one(projectTable, {
      fields: [projectTableLinkTable.projectId],
      references: [projectTable.id],
    }),
    table: one(dataTableTable, {
      fields: [projectTableLinkTable.tableId],
      references: [dataTableTable.id],
    }),
    creator: one(userTable, {
      fields: [projectTableLinkTable.createdBy],
      references: [userTable.id],
    }),
  }),
);

export const projectUpdateTableRelations = relations(
  projectUpdateTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [projectUpdateTable.organizationId],
      references: [organizationTable.id],
    }),
    project: one(projectTable, {
      fields: [projectUpdateTable.projectId],
      references: [projectTable.id],
    }),
    author: one(userTable, {
      fields: [projectUpdateTable.authorId],
      references: [userTable.id],
    }),
  }),
);
