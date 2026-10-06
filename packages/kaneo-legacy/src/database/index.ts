import { config } from "dotenv-mono";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accountTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  assetTableRelations,
  boardTableRelations,
  columnTableRelations,
  commentTableRelations,
  externalLinkTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  organizationGithubInstallationTableRelations,
  organizationMemberTableRelations,
  organizationRoleTableRelations,
  organizationTableRelations,
  projectBoardTableRelations,
  projectMilestoneTableRelations,
  projectRepoTableRelations,
  projectSlugAliasTableRelations,
  projectTableLinkTableRelations,
  projectTableRelations,
  projectTicketTableRelations,
  projectUpdateTableRelations,
  repoIssueTableRelations,
  repoPullRequestTableRelations,
  repoTableRelations,
  sessionTableRelations,
  taskRelationTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userNotificationOrgBoardTableRelations,
  userNotificationOrgRuleTableRelations,
  userNotificationPreferenceTableRelations,
  userTableRelations,
  verificationTableRelations,
  workflowRuleTableRelations,
} from "./relations";
import { resolveDatabaseConnectionString } from "./resolve-database-url";
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
  deviceCodeTable,
  externalLinkTable,
  githubDelegationStateTable,
  githubIntegrationTable,
  githubUserGrantTable,
  integrationTable,
  invitationTable,
  labelTable,
  notificationTable,
  oidcTeamSyncConfigTable,
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
  resourceGrantTable,
  sessionTable,
  taskRelationTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  trialGrantTable,
  userAvatarTable,
  userNotificationOrgBoardTable,
  userNotificationOrgRuleTable,
  userNotificationPreferenceTable,
  userTable,
  verificationTable,
  workflowRuleTable,
} from "./schema";

config();

export const schema = {
  accountTable,
  assetTable,
  activityTable,
  apikeyTable,
  columnTable,
  commentTable,
  dataTableCellTable,
  dataTableFieldTable,
  dataTableRowTable,
  dataTableTable,
  deviceCodeTable,
  externalLinkTable,
  githubDelegationStateTable,
  githubIntegrationTable,
  githubUserGrantTable,
  integrationTable,
  invitationTable,
  labelTable,
  notificationTable,
  boardTable,
  resourceGrantTable,
  sessionTable,
  taskRelationTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  trialGrantTable,
  userTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationOrgBoardTable,
  userNotificationOrgRuleTable,
  verificationTable,
  workflowRuleTable,
  organizationRoleTable,
  organizationTable,
  organizationMemberTable,
  oidcTeamSyncConfigTable,
  organizationGithubInstallationTable,
  repoTable,
  repoIssueTable,
  repoPullRequestTable,
  projectTable,
  projectSlugAliasTable,
  projectTicketTable,
  accountTableRelations,
  assetTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  columnTableRelations,
  commentTableRelations,
  externalLinkTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  boardTableRelations,
  sessionTableRelations,
  taskRelationTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationOrgBoardTableRelations,
  userNotificationOrgRuleTableRelations,
  verificationTableRelations,
  workflowRuleTableRelations,
  organizationRoleTableRelations,
  organizationTableRelations,
  organizationMemberTableRelations,
  organizationGithubInstallationTableRelations,
  repoTableRelations,
  repoIssueTableRelations,
  repoPullRequestTableRelations,
  projectTableRelations,
  projectSlugAliasTableRelations,
  projectTicketTableRelations,
  projectBoardTable,
  projectRepoTable,
  projectTableLinkTable,
  projectBoardTableRelations,
  projectRepoTableRelations,
  projectTableLinkTableRelations,
  projectMilestoneTable,
  projectMilestoneTableRelations,
  projectUpdateTable,
};

type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>;

let pool: Pool | undefined;
let dbInstance: DatabaseInstance | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseConnectionString(),
      // Fail fast when Railway's internal network is slow rather than hanging
      // indefinitely and blocking every API request.
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
      // Keep TCP alive so idle pool clients aren't silently reaped by the OS,
      // a NAT table, or Postgres itself during quiet periods.
      keepAlive: true,
    });

    // `pg` emits 'error' on the Pool when an IDLE client dies (server restart,
    // dropped TCP connection, network blip). Node treats an unhandled 'error'
    // event on an EventEmitter as fatal, so without this listener a single
    // dropped idle connection takes the whole API process down and every
    // request 500s until a manual restart.
    //
    // The pool already discards the broken client and creates a fresh one on
    // the next checkout, so logging is the correct response here.
    pool.on("error", (error) => {
      console.error("Postgres pool error on idle client:", error.message);
    });
  }

  return pool;
}

export function getDatabase(): DatabaseInstance {
  if (!dbInstance) {
    dbInstance = drizzle(getDatabasePool(), {
      schema,
    });
  }

  return dbInstance;
}

const db = new Proxy({} as DatabaseInstance, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDatabase(), property, receiver);

    if (typeof value === "function") {
      return value.bind(getDatabase());
    }

    return value;
  },
});

export default db;
