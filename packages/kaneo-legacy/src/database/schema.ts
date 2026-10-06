import { createId } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const userTable = pgTable("user", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  locale: text("locale"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  isAnonymous: boolean("is_anonymous").default(false),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { mode: "date" }),
});

export const sessionTable = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const accountTable = pgTable(
  "account",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

// Separate from Better Auth's `account` table: this grant permits Kaneo to act
// as a member on GitHub; a `github` account remains exclusively for sign-in.
export const githubUserGrantTable = pgTable(
  "github_user_grant",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    githubUserId: text("github_user_id").notNull(),
    githubLogin: text("github_login").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
    }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("github_user_grant_user_provider_unique").on(
      table.userId,
      table.providerId,
    ),
    index("github_user_grant_user_idx").on(table.userId),
  ],
);

export const githubDelegationStateTable = pgTable(
  "github_delegation_state",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    stateHash: text("state_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("github_delegation_state_expires_idx").on(table.expiresAt)],
);

export const verificationTable = pgTable(
  "verification",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organizationTable = pgTable(
  "organization",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    description: text("description"),
    reposEnabled: boolean("repos_enabled").default(false).notNull(),
    tablesEnabled: boolean("tables_enabled").default(false).notNull(),
    /*
    Org-wide default member privilege for resources without an explicit
    user/team grant, when the resource itself doesn't set its own baseline
    (board/repo/data_table `org_privilege`, NULL = follow this default).
    "manage" preserves the historical behaviour where ungranted resources
    were organization-wide.
  */
    defaultResourcePrivilege: text("default_resource_privilege")
      .default("manage")
      .notNull(),
    aiEnabled: boolean("ai_enabled").default(false).notNull(),
    aiDefaultTokenLimit: integer("ai_default_token_limit")
      .default(1024)
      .notNull(),
    aiDefaultCharacterLimit: integer("ai_default_character_limit")
      .default(4000)
      .notNull(),
    aiProviderBaseUrl: text("ai_provider_base_url"),
    aiProviderModel: text("ai_provider_model"),
    aiProviderApiKey: text("ai_provider_api_key"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("organization_slug_lower_unique").on(sql`lower(${table.slug})`),
  ],
);

export const organizationGithubInstallationTable = pgTable(
  "organization_github_installation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    installationId: integer("installation_id").notNull(),
    accountId: integer("account_id").notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(),
    accountAvatarUrl: text("account_avatar_url"),
    repositorySelection: text("repository_selection"),
    permissions: jsonb("permissions").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("organization_github_installation_organizationId_idx").on(
      table.organizationId,
    ),
    unique("organization_github_installation_unique").on(
      table.organizationId,
      table.installationId,
    ),
  ],
);

export const organizationMemberTable = pgTable(
  "organization_member",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
      }),
    role: text("role").default("member").notNull(),
    aiTokenLimit: integer("ai_token_limit"),
    aiCharacterLimit: integer("ai_character_limit"),
    joinedAt: timestamp("joined_at", { mode: "date" }).notNull(),
  },
  (table) => [
    index("organization_member_organizationId_idx").on(table.organizationId),
    index("organization_member_userId_idx").on(table.userId),
  ],
);

export const teamTable = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("kaneo"),
    /*
      Team avatar glyph. Nullable rather than defaulted so existing teams keep
      rendering their initials-based avatar until a glyph is chosen, instead of
      every team suddenly showing the same generic icon. Accepts a lucide name
      from `board-icons` or an emoji — `lib/resolve-icon` already resolves both
      for boards and repos.
    */
    icon: text("icon"),
    /*
      Sub-teams: a team may nest under another team in the same organization.
      Membership resolves TRANSITIVELY at query time — a member of a sub-team
      counts as a member of every ancestor team, but no team_member rows are
      materialized for ancestors, so leaving the sub-team cannot leave stale
      parent rows behind. SET NULL: deleting a parent promotes its children to
      top-level teams rather than cascading them away.
    */
    parentTeamId: text("parent_team_id").references(
      (): AnyPgColumn => teamTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [index("team_organizationId_idx").on(table.organizationId)],
);

export const teamMemberTable = pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teamTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("teamMember_teamId_idx").on(table.teamId),
    index("teamMember_userId_idx").on(table.userId),
  ],
);

export const oidcTeamSyncConfigTable = pgTable("oidc_team_sync_config", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizationTable.id, { onDelete: "cascade" }),
  claimPath: text("claim_path").notNull().default("roles"),
  roleMappings: jsonb("role_mappings")
    .$type<Array<{ role: string; teamId: string }>>()
    .notNull()
    .default([]),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const resourceGrantTable = pgTable(
  "resource_grant",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id").references(() => teamTable.id, {
      onDelete: "cascade",
    }),
    privilege: text("privilege").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "resource_grant_resource_type_check",
      sql`${table.resourceType} in ('board', 'repo', 'table')`,
    ),
    check(
      "resource_grant_privilege_check",
      sql`${table.privilege} in ('view', 'edit', 'manage')`,
    ),
    check(
      "resource_grant_single_principal_check",
      sql`num_nonnulls(${table.userId}, ${table.teamId}) = 1`,
    ),
    index("resource_grant_resource_idx").on(
      table.organizationId,
      table.resourceType,
      table.resourceId,
    ),
    index("resource_grant_user_idx").on(table.userId),
    index("resource_grant_team_idx").on(table.teamId),
    uniqueIndex("resource_grant_user_unique")
      .on(
        table.organizationId,
        table.resourceType,
        table.resourceId,
        table.userId,
      )
      .where(sql`${table.userId} is not null`),
    uniqueIndex("resource_grant_team_unique")
      .on(
        table.organizationId,
        table.resourceType,
        table.resourceId,
        table.teamId,
      )
      .where(sql`${table.teamId} is not null`),
  ],
);

export const invitationTable = pgTable(
  "invitation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    teamId: text("team_id"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
    index("invitation_inviterId_idx").on(table.inviterId),
  ],
);

export const organizationRoleTable = pgTable(
  "organization_role",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("organization_role_organizationId_idx").on(table.organizationId),
    index("organization_role_role_idx").on(table.role),
  ],
);

export const boardTable = pgTable(
  "board",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    slug: text("slug").notNull(),
    icon: text("icon").default("Layout"),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    isPublic: boolean("is_public").default(false),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    lastTaskNumber: integer("last_task_number").notNull().default(0),
    /*
      Per-resource organization baseline: what every ordinary org member gets
      for THIS board when they hold no explicit user/team grant. NULL = follow
      the organization's defaultResourcePrivilege ("follow org"). Explicit
      grants and owner/admin manage always win over this value.
    */
    orgPrivilege: text("org_privilege"),
    /**
     * #226: per-board ordering for statuses shown in regular Task surfaces.
     * JSON is intentional: this is a small ordered list of global, append-only
     * slugs, not board-owned status definitions. Missing future statuses are
     * appended canonically by readers, so configured boards never hide them.
     */
    taskStatusOrder: jsonb("task_status_order")
      .$type<string[]>()
      .default([
        "to-do",
        "in-progress",
        "in-review",
        "done",
        "canceled",
        "duplicate",
      ])
      .notNull(),
    /** #226: Triage defaults above Planned, exactly as specified. */
    backlogStatusOrder: jsonb("backlog_status_order")
      .$type<string[]>()
      .default(["triage", "planned"])
      .notNull(),
    // #95: how deep nested subtasks may go on this board. DB enforces 1..4 via
    // board_subtask_depth_limit_range; 4 is both the default and the ceiling.
    subtaskDepthLimit: integer("subtask_depth_limit").notNull().default(4),
    /*
      Default assignee for new tickets on this board. When a task is created
      without an explicit userId/teamId, the board default fills in. Either
      column can be set independently (user-only, team-only, or both).
      NULL = no default (the pre-feature behaviour).
    */
    defaultAssigneeId: text("default_assignee_id").references(
      () => userTable.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    defaultAssigneeTeamId: text("default_assignee_team_id").references(
      () => teamTable.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
  },
  (table) => [
    unique("board_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("board_organization_key_lower_unique").on(
      table.organizationId,
      sql`lower(${table.slug})`,
    ),
  ],
);

export const organizationSlugAliasTable = pgTable(
  "organization_slug_alias",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_slug_alias_lower_unique").on(
      sql`lower(${table.slug})`,
    ),
    index("organization_slug_alias_organization_id_idx").on(
      table.organizationId,
    ),
  ],
);

export const boardKeyAliasTable = pgTable(
  "board_key_alias",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    boardId: text("board_id")
      .notNull()
      .references(() => boardTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("board_key_alias_organization_key_lower_unique").on(
      table.organizationId,
      sql`lower(${table.key})`,
    ),
    index("board_key_alias_board_id_idx").on(table.boardId),
  ],
);

/**
 * KFL-366: Projects are an outcome-tracking domain, deliberately NOT owning
 * Boards/Tickets/Repos/Tables — those stay first-class, organization-scoped
 * resources. A Project groups related work by intent; linking which Board/
 * Ticket/Repo/Table serves a Project is a later ticket (KFL-367+).
 */
export const projectTable = pgTable(
  "project",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    summary: text("summary").notNull(),
    description: text("description"),
    successCriteria: text("success_criteria"),
    status: text("status").notNull().default("planned"),
    // Reuses the Ticket priority vocabulary/validator (VALID_PRIORITIES);
    // nullable because a Project need not be prioritized at creation.
    priority: text("priority"),
    leadUserId: text("lead_user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    leadTeamId: text("lead_team_id").references(() => teamTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    startDate: text("start_date"),
    targetDate: text("target_date"),
    /*
      Per-resource organization baseline, identical contract to
      board.org_privilege: what every ordinary org member gets for THIS
      project when they hold no explicit user/team grant. NULL = follow the
      organization's defaultResourcePrivilege.
    */
    orgPrivilege: text("org_privilege"),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    archivedBy: text("archived_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    unique("project_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("project_organization_slug_lower_unique").on(
      table.organizationId,
      sql`lower(${table.slug})`,
    ),
    index("project_organization_archived_idx").on(
      table.organizationId,
      table.archivedAt,
    ),
    index("project_leadUserId_idx").on(table.leadUserId),
    index("project_leadTeamId_idx").on(table.leadTeamId),
    check(
      "project_status_check",
      sql`${table.status} in ('planned', 'started', 'completed', 'canceled')`,
    ),
  ],
);

export const projectSlugAliasTable = pgTable(
  "project_slug_alias",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("project_slug_alias_organization_slug_lower_unique").on(
      table.organizationId,
      sql`lower(${table.slug})`,
    ),
    index("project_slug_alias_project_id_idx").on(table.projectId),
  ],
);

export const projectMilestoneTable = pgTable(
  "project_milestone",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    description: text("description"),
    targetDate: text("target_date"),
    rank: integer("rank").notNull().default(0),
    completedAt: timestamp("completed_at", { mode: "date" }),
    completedBy: text("completed_by").references(() => userTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("project_milestone_project_id_id_unique").on(
      table.projectId,
      table.id,
    ),
    index("project_milestone_project_rank_created_idx").on(
      table.projectId,
      table.rank,
      table.createdAt,
    ),
    index("project_milestone_completed_by_idx").on(table.completedBy),
    check(
      "project_milestone_completion_pair_check",
      sql`(${table.completedAt} IS NULL) = (${table.completedBy} IS NULL)`,
    ),
  ],
);

export const projectTicketTable = pgTable(
  "project_ticket",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectMilestoneId: text("project_milestone_id").references(
      () => projectMilestoneTable.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    rank: integer("rank").notNull().default(0),
    addedBy: text("added_by")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    addedAt: timestamp("added_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("project_ticket_task_unique").on(table.taskId),
    unique("project_ticket_project_task_unique").on(
      table.projectId,
      table.taskId,
    ),
    index("project_ticket_project_rank_idx").on(table.projectId, table.rank),
    index("project_ticket_task_idx").on(table.taskId),
    index("project_ticket_project_milestone_rank_idx").on(
      table.projectId,
      table.projectMilestoneId,
      table.rank,
    ),
    foreignKey({
      columns: [table.projectId, table.projectMilestoneId],
      foreignColumns: [
        projectMilestoneTable.projectId,
        projectMilestoneTable.id,
      ],
      name: "project_ticket_project_milestone_project_id_fk",
    })
      .onDelete("set null")
      .onUpdate("cascade"),
  ],
);

export const dataTableTable = pgTable(
  "data_table",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    // Per-resource org baseline; NULL = follow the organization default.
    orgPrivilege: text("org_privilege"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("data_table_organization_idx").on(table.organizationId),
    // KFL-368: composite identity for type-safe association-table FKs.
    unique("data_table_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
  ],
);

export const dataTableFieldTable = pgTable(
  "data_table_field",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => dataTableTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    type: text("type").notNull().default("text"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("data_table_field_table_position_idx").on(
      table.tableId,
      table.position,
    ),
    check("data_table_field_type_check", sql`${table.type} = 'text'`),
  ],
);

export const dataTableRowTable = pgTable(
  "data_table_row",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => dataTableTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("data_table_row_table_position_idx").on(
      table.tableId,
      table.position,
    ),
  ],
);

export const dataTableCellTable = pgTable(
  "data_table_cell",
  {
    rowId: text("row_id")
      .notNull()
      .references(() => dataTableRowTable.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
      .notNull()
      .references(() => dataTableFieldTable.id, { onDelete: "cascade" }),
    value: text("value"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("data_table_cell_row_field_unique").on(table.rowId, table.fieldId),
    index("data_table_cell_field_idx").on(table.fieldId),
  ],
);

export const columnTable = pgTable(
  "column",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boardTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    position: integer("position").notNull().default(0),
    icon: text("icon"),
    color: text("color"),
    isFinal: boolean("is_final").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("column_boardId_idx").on(table.boardId)],
);

export const workflowRuleTable = pgTable(
  "workflow_rule",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boardTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationType: text("integration_type").notNull(),
    eventType: text("event_type").notNull(),
    columnId: text("column_id")
      .notNull()
      .references(() => columnTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workflow_rule_boardId_idx").on(table.boardId),
    index("workflow_rule_columnId_idx").on(table.columnId),
  ],
);

export const milestoneTable = pgTable(
  "milestone",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boardTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { mode: "date" }),
    status: text("status").notNull().default("planned"),
    position: integer("position").notNull().default(0),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("milestone_boardId_idx").on(table.boardId),
    index("milestone_dueDate_idx").on(table.dueDate),
    unique("milestone_board_id_name_unique").on(table.boardId, table.name),
  ],
);

export const taskTable = pgTable(
  "task",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boardTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer("position").default(0),
    number: integer("number").default(1),
    userId: text("assignee_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    teamId: text("team_assignee_id").references(() => teamTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    descriptionHistory: jsonb("description_history")
      .$type<
        Array<{
          content: string | null;
          editedAt: string;
          userId: string;
          sealed?: boolean;
        }>
      >()
      .default([])
      .notNull(),
    status: text("status").notNull().default("to-do"),
    columnId: text("column_id").references(() => columnTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    priority: text("priority").default("low"),
    milestoneId: text("milestone_id").references(() => milestoneTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * #226: archival is ORTHOGONAL to status, not a status value.
     *
     * Archiving used to overwrite `status` with "archived", which destroyed the
     * ticket's real workflow state. Per the ticket: "Archive is a separate
     * status to hide it from all views. Archived item retains its status."
     * Archived tasks are hidden everywhere except the backlog's archived
     * dropdown; `status` keeps meaning workflow state only.
     */
    archivedAt: timestamp("archived_at", { mode: "date" }),
    archivedBy: text("archived_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    deletedBy: text("deleted_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    startDate: timestamp("start_date", { mode: "date" }),
    dueDate: timestamp("due_date", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_boardId_idx").on(table.boardId),
    index("task_dueDate_idx").on(table.dueDate),
    index("task_assigneeId_idx").on(table.userId),
    index("task_teamAssigneeId_idx").on(table.teamId),
    index("task_columnId_idx").on(table.columnId),
    unique("task_board_number_unique").on(table.boardId, table.number),
  ],
);

export const flagTypeTable = pgTable(
  "flag_type",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boardTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    color: text("color"),
    icon: text("icon"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("flag_type_boardId_idx").on(table.boardId),
    unique("flag_type_board_id_name_unique").on(table.boardId, table.name),
  ],
);

export const taskFlagTable = pgTable(
  "task_flag",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flagTypeId: text("flag_type_id")
      .notNull()
      .references(() => flagTypeTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Who raised the flag.
    flaggedBy: text("flagged_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Flags are aimed at a user OR a team; exactly one target is expected.
    targetUserId: text("target_user_id").references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    targetTeamId: text("target_team_id").references(() => teamTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    note: text("note"),
    // Unflagging keeps the row and records who resolved it. #107: unflagging
    // requires a mandatory explanation, stored alongside the resolver.
    resolveNote: text("resolve_note"),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
    resolvedBy: text("resolved_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_flag_taskId_idx").on(table.taskId),
    index("task_flag_flagTypeId_idx").on(table.flagTypeId),
    index("task_flag_targetUserId_idx").on(table.targetUserId),
    index("task_flag_targetTeamId_idx").on(table.targetTeamId),
    index("task_flag_resolvedAt_idx").on(table.resolvedAt),
  ],
);

export const taskReminderSentTable = pgTable(
  "task_reminder_sent",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    reminderType: text("reminder_type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_reminder_sent_taskId_idx").on(table.taskId),
    unique("task_reminder_sent_task_type_unique").on(
      table.taskId,
      table.reminderType,
    ),
  ],
);

export const timeEntryTable = pgTable(
  "time_entry",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    description: text("description"),
    startTime: timestamp("start_time", { mode: "date" }).notNull(),
    endTime: timestamp("end_time", { mode: "date" }),
    duration: integer("duration").default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("time_entry_taskId_idx").on(table.taskId),
    index("time_entry_userId_idx").on(table.userId),
  ],
);

export const activityTable = pgTable(
  "activity",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    content: text("content"),
    editHistory: jsonb("edit_history")
      .$type<Array<{ content: string; editedAt: string; userId: string }>>()
      .default([])
      .notNull(),
    eventData: jsonb("event_data"),
    externalUserName: text("external_user_name"),
    externalUserAvatar: text("external_user_avatar"),
    externalSource: text("external_source"),
    externalUrl: text("external_url"),
  },
  (table) => [
    index("activity_task_id_idx").on(table.taskId),
    index("activity_userId_idx").on(table.userId),
    unique("activity_task_external_source_external_url_unique").on(
      table.taskId,
      table.externalSource,
      table.externalUrl,
    ),
  ],
);

export const assetTable = pgTable(
  "asset",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Task media belongs to a board; repository media belongs to a repo. At
    // least one context is required by the asset_owner_context_check migration.
    boardId: text("board_id").references(() => boardTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    repoId: text("repo_id").references(() => repoTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    activityId: text("activity_id").references(() => activityTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    objectKey: text("object_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    kind: text("kind").notNull().default("image"),
    surface: text("surface").notNull().default("description"),
    createdBy: text("created_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("asset_organizationId_idx").on(table.organizationId),
    index("asset_boardId_idx").on(table.boardId),
    index("asset_repoId_idx").on(table.repoId),
    index("asset_taskId_idx").on(table.taskId),
    index("asset_activityId_idx").on(table.activityId),
    index("asset_createdBy_idx").on(table.createdBy),
  ],
);

export const labelTable = pgTable(
  "label",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    /**
     * Where the label came from. `kaneo` is a label a user created in Kaneo,
     * `repo` is one that arrived with an issue imported from a linked
     * repository. Defaults to `kaneo` so pre-existing rows stay valid.
     */
    source: text("source").$type<"kaneo" | "repo">().notNull().default("kaneo"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    organizationId: text("organization_id").references(
      () => organizationTable.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
  },
  (table) => [
    index("label_task_id_idx").on(table.taskId),
    index("label_organization_id_idx").on(table.organizationId),
    unique("label_task_name_unique").on(table.taskId, table.name),
    uniqueIndex("label_organization_name_unique")
      .on(table.organizationId, table.name)
      .where(sql`${table.taskId} is null`),
  ],
);

export const taskTemplateTable = pgTable(
  "task_template",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    data: jsonb("data")
      .$type<{
        title: string;
        description: string | null;
        priority: string | null;
        startDate: string | null;
        dueDate: string | null;
        status?: string | null;
        labels?: string[];
        startDateOffset?: string | null;
        dueDateOffset?: string | null;
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_template_organization_id_idx").on(table.organizationId),
    unique("task_template_organization_name_unique").on(
      table.organizationId,
      table.name,
    ),
  ],
);

/**
 * KFL-339: explicit ticket following.
 *
 * Following is ORTHOGONAL to assignment and to activity participation: a user
 * may follow a ticket they never touched, and unfollowing must not remove them
 * from the assignee/participant recipient sets those relations imply. The
 * UNIQUE(task_id, user_id) pair makes follow idempotent, so a double-click
 * cannot create duplicate rows or duplicate notifications.
 */
export const taskFollowerTable = pgTable(
  "task_follower",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("task_follower_task_user_unique").on(table.taskId, table.userId),
    index("task_follower_task_idx").on(table.taskId),
    index("task_follower_user_idx").on(table.userId),
  ],
);

export const notificationTable = pgTable(
  "notification",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text("title"),
    content: text("content"),
    type: text("type").notNull().default("info"),
    eventData: jsonb("event_data"),
    isRead: boolean("is_read").default(false),
    resourceId: text("resource_id"),
    resourceType: text("resource_type"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("notification_userId_idx").on(table.userId)],
);

export const userNotificationPreferenceTable = pgTable(
  "user_notification_preference",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    ntfyEnabled: boolean("ntfy_enabled").default(false).notNull(),
    ntfyServerUrl: text("ntfy_server_url"),
    ntfyTopic: text("ntfy_topic"),
    ntfyToken: text("ntfy_token"),
    gotifyEnabled: boolean("gotify_enabled").default(false).notNull(),
    gotifyServerUrl: text("gotify_server_url"),
    gotifyToken: text("gotify_token"),
    webhookEnabled: boolean("webhook_enabled").default(false).notNull(),
    webhookUrl: text("webhook_url"),
    webhookSecret: text("webhook_secret"),
    taskAssignmentEnabled: boolean("task_assignment_enabled")
      .default(true)
      .notNull(),
    taskCommentEnabled: boolean("task_comment_enabled").default(true).notNull(),
    taskStatusChangeEnabled: boolean("task_status_change_enabled")
      .default(true)
      .notNull(),
    dueDateReminderEnabled: boolean("due_date_reminder_enabled")
      .default(true)
      .notNull(),
    dueDateReminderLeadTimeMinutes: integer(
      "due_date_reminder_lead_time_minutes",
    )
      .default(1440)
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const userNotificationOrgRuleTable = pgTable(
  "user_notification_org_rule",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isActive: boolean("is_active").default(true).notNull(),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    ntfyEnabled: boolean("ntfy_enabled").default(false).notNull(),
    gotifyEnabled: boolean("gotify_enabled").default(false).notNull(),
    webhookEnabled: boolean("webhook_enabled").default(false).notNull(),
    boardMode: text("board_mode").default("all").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("unor_userId_idx").on(table.userId),
    index("unor_organizationId_idx").on(table.organizationId),
    unique("unor_user_org_unique").on(table.userId, table.organizationId),
    unique("unor_org_id_id_unique").on(table.organizationId, table.id),
  ],
);

export const userNotificationOrgBoardTable = pgTable(
  "user_notification_org_board",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    orgRuleId: text("org_rule_id").notNull(),
    boardId: text("board_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.orgRuleId],
      foreignColumns: [
        userNotificationOrgRuleTable.organizationId,
        userNotificationOrgRuleTable.id,
      ],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.organizationId, table.boardId],
      foreignColumns: [boardTable.organizationId, boardTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("unob_ruleId_idx").on(table.orgRuleId),
    index("unob_boardId_idx").on(table.boardId),
    index("unob_organizationId_boardId_idx").on(
      table.organizationId,
      table.boardId,
    ),
    index("unwp_organizationId_orgRuleId_idx").on(
      table.organizationId,
      table.orgRuleId,
    ),
    unique("unob_rule_board_unique").on(table.orgRuleId, table.boardId),
  ],
);

export const githubIntegrationTable = pgTable("github_integration", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  boardId: text("board_id")
    .notNull()
    .references(() => boardTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    })
    .unique(),
  repositoryOwner: text("repository_owner").notNull(),
  repositoryName: text("repository_name").notNull(),
  installationId: integer("installation_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const integrationTable = pgTable(
  "integration",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boardTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type").notNull(),
    config: text("config").notNull(),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("integration_boardId_idx").on(table.boardId),
    index("integration_type_idx").on(table.type),
    unique("integration_board_type_unique").on(table.boardId, table.type),
  ],
);

export const externalLinkTable = pgTable(
  "external_link",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // #265: nullable so a plain user-pasted link can exist as a resource.
    // Integration-owned links (synced GitHub issues, PRs, branches) still set
    // this; a manually linked URL has no integration to point at.
    integrationId: text("integration_id").references(
      () => integrationTable.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    resourceType: text("resource_type").notNull(),
    // #265: stays NOT NULL. For an integration link this is the upstream id
    // (issue/PR number); for a manual link the URL *is* its own identifier.
    // Widening this to nullable broke 14 integration sync call sites that
    // legitimately treat it as a string, for no gain.
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("external_link_taskId_idx").on(table.taskId),
    index("external_link_integrationId_idx").on(table.integrationId),
    index("external_link_externalId_idx").on(table.externalId),
    index("external_link_resourceType_idx").on(table.resourceType),
  ],
);

export const commentTable = pgTable(
  "comment",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("comment_task_idx").on(table.taskId),
    index("comment_user_idx").on(table.userId),
  ],
);

export const taskRelationTable = pgTable(
  "task_relation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    sourceTaskId: text("source_task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    targetTaskId: text("target_task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    relationType: text("relation_type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("task_relation_source_idx").on(table.sourceTaskId),
    index("task_relation_target_idx").on(table.targetTaskId),
  ],
);

export const apikeyTable = pgTable(
  "apikey",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    configId: text("config_id").default("default").notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    prefix: text("prefix"),
    key: text("key").notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
    }),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { mode: "date" }),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_configId_idx").on(table.configId),
    index("apikey_key_idx").on(table.key),
    index("apikey_referenceId_idx").on(table.referenceId),
    index("apikey_userId_idx").on(table.userId),
  ],
);

export const deviceCodeTable = pgTable(
  "device_code",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    deviceCode: text("device_code").notNull(),
    userCode: text("user_code").notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at", { mode: "date" }),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
  },
  (table) => [
    uniqueIndex("device_code_device_code_uidx").on(table.deviceCode),
    uniqueIndex("device_code_user_code_uidx").on(table.userCode),
    index("device_code_user_id_idx").on(table.userId),
  ],
);

// Auth-schema compatible aliases in schema.ts
export const user = userTable;
export const session = sessionTable;
export const account = accountTable;
export const verification = verificationTable;
export const organization = organizationTable;
export const team = teamTable;
export const teamMember = teamMemberTable;
export const organization_member = organizationMemberTable;
export const invitation = invitationTable;
export const organizationRole = organizationRoleTable;
export const apikey = apikeyTable;
export const deviceCode = deviceCodeTable;

// Auth-schema compatible relation exports in schema.ts
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  teamMembers: many(teamMember),
  organization_members: many(organization_member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  teams: many(team),
  organization_members: many(organization_member),
  invitations: many(invitation),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  teamMembers: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

export const organization_memberRelations = relations(
  organization_member,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organization_member.organizationId],
      references: [organization.id],
    }),
    user: one(user, {
      fields: [organization_member.userId],
      references: [user.id],
    }),
  }),
);

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const organizationRoleRelations = relations(
  organizationRole,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationRole.organizationId],
      references: [organization.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Repositories
//
// Repos are a FIRST-CLASS, ORGANIZATION-LEVEL entity — deliberately NOT tied to
// boards or tasks. A repo's issues and pull requests are mirrored as-is from
// the provider so they keep the provider's own shape (state, labels, numbers)
// instead of being forced into Kaneo's board/column/task model.
//
// There is intentionally no foreign key from repo_issue / repo_pull_request to
// task. Tasks and issues are separate domains; coupling them is what made the
// previous board-scoped integration painful.
// ---------------------------------------------------------------------------

export const repoTable = pgTable(
  "repo",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // "github" | "gitea"
    provider: text("provider").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    // Provider-side identifier (GitHub repo id / Gitea repo id).
    externalId: text("external_id"),
    url: text("url").notNull(),
    description: text("description"),
    defaultBranch: text("default_branch"),
    isPrivate: boolean("is_private").default(false).notNull(),
    // Provider auth/config: GitHub installationId, Gitea baseUrl + token ref…
    config: jsonb("config").$type<Record<string, unknown>>(),
    isActive: boolean("is_active").default(true).notNull(),
    // Per-resource org baseline; NULL = follow the organization default.
    orgPrivilege: text("org_privilege"),
    lastSyncedAt: timestamp("last_synced_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("repo_organizationId_idx").on(table.organizationId),
    // One connection per repo per organization.
    unique("repo_org_provider_owner_name_unique").on(
      table.organizationId,
      table.provider,
      table.owner,
      table.name,
    ),
    // KFL-368: composite identity for type-safe association-table FKs.
    unique("repo_organization_id_id_unique").on(table.organizationId, table.id),
  ],
);

/**
 * KFL-368: type-safe Project↔Resource association tables (ADR 18).
 *
 * These are context-only links — they grant no privilege, contribute no
 * progress, and never transfer ownership. Same-organization identity is
 * database-enforced on every association via composite foreign keys against
 * both Project and the target Resource `(organization_id, id)` keys.
 * Deleting a Project or Resource cascades only these association rows.
 */
export const projectBoardTable = pgTable(
  "project_board",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id").notNull(),
    boardId: text("board_id").notNull(),
    relationship: text("relationship").notNull(),
    label: text("label"),
    note: text("note"),
    rank: integer("rank").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projectTable.organizationId, projectTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.organizationId, table.boardId],
      foreignColumns: [boardTable.organizationId, boardTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    unique("project_board_project_id_board_id_unique").on(
      table.projectId,
      table.boardId,
    ),
    index("project_board_project_id_idx").on(table.projectId),
    index("project_board_board_id_idx").on(table.boardId),
    index("project_board_project_id_rank_idx").on(table.projectId, table.rank),
    check(
      "project_board_relationship_check",
      sql`${table.relationship} in ('context', 'dependency', 'deliverable')`,
    ),
    check("project_board_rank_check", sql`${table.rank} >= 0`),
  ],
);

export const projectRepoTable = pgTable(
  "project_repo",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id").notNull(),
    repoId: text("repo_id").notNull(),
    relationship: text("relationship").notNull(),
    label: text("label"),
    note: text("note"),
    rank: integer("rank").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projectTable.organizationId, projectTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.organizationId, table.repoId],
      foreignColumns: [repoTable.organizationId, repoTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    unique("project_repo_project_id_repo_id_unique").on(
      table.projectId,
      table.repoId,
    ),
    index("project_repo_project_id_idx").on(table.projectId),
    index("project_repo_repo_id_idx").on(table.repoId),
    index("project_repo_project_id_rank_idx").on(table.projectId, table.rank),
    check(
      "project_repo_relationship_check",
      sql`${table.relationship} in ('context', 'dependency', 'deliverable')`,
    ),
    check("project_repo_rank_check", sql`${table.rank} >= 0`),
  ],
);

export const projectTableLinkTable = pgTable(
  "project_table_link",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id").notNull(),
    tableId: text("table_id").notNull(),
    relationship: text("relationship").notNull(),
    label: text("label"),
    note: text("note"),
    rank: integer("rank").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projectTable.organizationId, projectTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.organizationId, table.tableId],
      foreignColumns: [dataTableTable.organizationId, dataTableTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    unique("project_table_link_project_id_table_id_unique").on(
      table.projectId,
      table.tableId,
    ),
    index("project_table_link_project_id_idx").on(table.projectId),
    index("project_table_link_table_id_idx").on(table.tableId),
    index("project_table_link_project_id_rank_idx").on(
      table.projectId,
      table.rank,
    ),
    check(
      "project_table_link_relationship_check",
      sql`${table.relationship} in ('context', 'dependency', 'deliverable')`,
    ),
    check("project_table_link_rank_check", sql`${table.rank} >= 0`),
  ],
);
export const repoIssueTable = pgTable(
  "repo_issue",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repoTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Provider issue number, as shown to users (#12).
    number: integer("number").notNull(),
    externalId: text("external_id"),
    title: text("title").notNull(),
    body: text("body"),
    // Provider state verbatim: "open" | "closed".
    state: text("state").notNull(),
    authorLogin: text("author_login"),
    authorAvatarUrl: text("author_avatar_url"),
    assigneeLogins: jsonb("assignee_logins").$type<string[]>(),
    labels: jsonb("labels").$type<Array<{ name: string; color?: string }>>(),
    commentCount: integer("comment_count").default(0).notNull(),
    url: text("url").notNull(),
    externalCreatedAt: timestamp("external_created_at", { mode: "date" }),
    externalUpdatedAt: timestamp("external_updated_at", { mode: "date" }),
    closedAt: timestamp("closed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("repo_issue_repoId_idx").on(table.repoId),
    index("repo_issue_state_idx").on(table.state),
    unique("repo_issue_repo_number_unique").on(table.repoId, table.number),
  ],
);

export const repoPullRequestTable = pgTable(
  "repo_pull_request",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repoTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    number: integer("number").notNull(),
    externalId: text("external_id"),
    title: text("title").notNull(),
    body: text("body"),
    // "open" | "closed" | "merged"
    state: text("state").notNull(),
    isDraft: boolean("is_draft").default(false).notNull(),
    authorLogin: text("author_login"),
    authorAvatarUrl: text("author_avatar_url"),
    headBranch: text("head_branch"),
    baseBranch: text("base_branch"),
    labels: jsonb("labels").$type<Array<{ name: string; color?: string }>>(),
    commentCount: integer("comment_count").default(0).notNull(),
    // GitHub's pull-request LIST endpoint omits diff counts; they exist only on
    // the single-pull-request resource. Persist them so the list can render a
    // delta without an extra request per row.
    additions: integer("additions"),
    deletions: integer("deletions"),
    changedFiles: integer("changed_files"),
    url: text("url").notNull(),
    externalCreatedAt: timestamp("external_created_at", { mode: "date" }),
    externalUpdatedAt: timestamp("external_updated_at", { mode: "date" }),
    mergedAt: timestamp("merged_at", { mode: "date" }),
    closedAt: timestamp("closed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("repo_pull_request_repoId_idx").on(table.repoId),
    index("repo_pull_request_state_idx").on(table.state),
    unique("repo_pull_request_repo_number_unique").on(
      table.repoId,
      table.number,
    ),
  ],
);

// A link is intentionally a join, not ownership: Repo items remain
// organization-level provider mirrors while tasks remain board-level entities.
export const taskRepoItemLinkTable = pgTable(
  "task_repo_item_link",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    repoIssueId: text("repo_issue_id").references(() => repoIssueTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    repoPullRequestId: text("repo_pull_request_id").references(
      () => repoPullRequestTable.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    // A Synced Task follows a GitHub issue; ordinary task links remain
    // references only. Pull requests are never syncable.
    syncEnabled: boolean("sync_enabled").notNull().default(false),
    // Keep a broken follower visible rather than silently deleting its task.
    syncBrokenAt: timestamp("sync_broken_at", { mode: "date" }),
    syncBrokenReason: text("sync_broken_reason"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("task_repo_item_link_task_idx").on(table.taskId),
    index("task_repo_item_link_issue_idx").on(table.repoIssueId),
    index("task_repo_item_link_pull_request_idx").on(table.repoPullRequestId),
    unique("task_repo_item_link_task_issue_unique").on(
      table.taskId,
      table.repoIssueId,
    ),
    unique("task_repo_item_link_task_pull_request_unique").on(
      table.taskId,
      table.repoPullRequestId,
    ),
    // A task has one unambiguous content source, while an issue can be followed
    // by any number of tasks across boards.
    uniqueIndex("task_single_synced_issue_idx")
      .on(table.taskId)
      .where(sql`${table.syncEnabled}`),
    check(
      "task_repo_item_link_sync_issue_only",
      sql`not ${table.syncEnabled} or ${table.repoIssueId} is not null`,
    ),
  ],
);

export const userAvatarTable = pgTable(
  "user_avatar",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique("user_avatar_user_id_unique")
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("user_avatar_userId_idx").on(table.userId)],
);

export const trialGrantTable = pgTable("trial_grant", {
  emailHash: text("email_hash").primaryKey(),
  trialEndsAt: timestamp("trial_ends_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/**
 * KFL-370: a Project Update is an authored health narrative ("how is this
 * project doing?") published by a member. Health is AUTHORED judgment carried
 * on the newest update — never derived from progress, never stored as a
 * sentinel: "no update" is zero rows, rendered as presentation.
 */
export const PROJECT_UPDATE_HEALTH_VALUES = [
  "on-track",
  "at-risk",
  "off-track",
] as const;

export const projectUpdateTable = pgTable(
  "project_update",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Author identity is preserved exactly as at publish time.
    authorId: text("author_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    content: text("content").notNull(),
    health: text("health").notNull(),
    // Same shape/convention as activityTable.editHistory: pre-edit snapshots,
    // append-only, no compression window (an Update is an authored narrative).
    editHistory: jsonb("edit_history")
      .$type<Array<{ content: string; editedAt: string; userId: string }>>()
      .default([])
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("project_update_project_created_at_idx").on(
      table.projectId,
      table.createdAt.desc(),
    ),
    index("project_update_author_id_idx").on(table.authorId),
    index("project_update_organization_id_idx").on(table.organizationId),
    check(
      "project_update_health_check",
      sql`${table.health} in ('on-track', 'at-risk', 'off-track')`,
    ),
  ],
);
