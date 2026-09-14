import { Schema } from "effect";

// --- §3 validation primitives -----------------------------------------------------------
export const ID = Schema.NonEmptyString.pipe(Schema.maxLength(128));
// Project slug: lowercase kebab, 1-63 chars, must start with a letter (fork regex).
export const PROJECT_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const ProjectSlug = Schema.String.pipe(
	Schema.pattern(PROJECT_SLUG_PATTERN),
	Schema.maxLength(63),
).pipe(
	Schema.filter((s) => s.length <= 63, { identifier: "ProjectSlugLength" }),
);
export const ProjectStatus = Schema.Literal(
	"planned",
	"started",
	"completed",
	"canceled",
);
// Ticket priority vocabulary (fork VALID_PRIORITIES).
export const ProjectPriority = Schema.NullOr(
	Schema.Literal("no-priority", "low", "medium", "high", "urgent"),
);
export const OrgPrivilege = Schema.NullOr(
	Schema.Literal("none", "view", "edit", "manage"),
);
export const ResourceRelationship = Schema.Literal(
	"context",
	"dependency",
	"deliverable",
);
export const ResourceType = Schema.Literal("board", "repo", "table");
export const Health = Schema.Literal("on-track", "at-risk", "off-track");
export const Rank = Schema.Number.pipe(Schema.int(), Schema.nonNegative());
export const ISODate = Schema.String;

// --- Public rows (§3 allowlist; camelCase API mapping) ---------------------------------
const Progress = Schema.Struct({
	completed: Schema.Number,
	eligible: Schema.Number,
	percent: Schema.NullOr(Schema.Number),
});

export const ProjectPublic = Schema.Struct({
	id: Schema.String,
	organizationId: Schema.String,
	slug: Schema.String,
	name: Schema.String,
	icon: Schema.NullOr(Schema.String),
	color: Schema.NullOr(Schema.String),
	summary: Schema.String,
	description: Schema.NullOr(Schema.String),
	successCriteria: Schema.NullOr(Schema.String),
	status: ProjectStatus,
	priority: ProjectPriority,
	leadUserId: Schema.String,
	leadUserName: Schema.NullOr(Schema.String),
	leadTeamId: Schema.NullOr(Schema.String),
	leadTeamName: Schema.NullOr(Schema.String),
	startDate: Schema.NullOr(ISODate),
	targetDate: Schema.NullOr(ISODate),
	orgPrivilege: OrgPrivilege,
	archivedAt: Schema.NullOr(ISODate),
	archivedBy: Schema.NullOr(Schema.String),
	archivedByName: Schema.NullOr(Schema.String),
	createdAt: ISODate,
	updatedAt: ISODate,
	createdBy: Schema.String,
	progress: Progress,
	health: Schema.NullOr(Health),
	viewerPrivilege: Schema.optional(
		Schema.Literal("none", "view", "edit", "manage"),
	),
});
export type ProjectPublic = Schema.Schema.Type<typeof ProjectPublic>;

// --- Safe-summary union (§3: never repo config/credentials, table fields/rows) ---------
const BoardSummary = Schema.Struct({
	id: Schema.String,
	slug: Schema.String,
	name: Schema.String,
	icon: Schema.NullOr(Schema.String),
	archivedAt: Schema.NullOr(ISODate),
});
const RepoSummary = Schema.Struct({
	id: Schema.String,
	owner: Schema.String,
	name: Schema.String,
	provider: Schema.String,
	url: Schema.String,
	description: Schema.NullOr(Schema.String),
	isActive: Schema.Boolean,
});
const TableSummary = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	icon: Schema.NullOr(Schema.String),
});
const ResourceSummary = Schema.Union(BoardSummary, RepoSummary, TableSummary);

export const ResourceLinkPublic = Schema.Struct({
	id: Schema.String,
	projectId: Schema.String,
	resourceType: ResourceType,
	resourceId: Schema.String,
	relationship: ResourceRelationship,
	label: Schema.NullOr(Schema.String),
	note: Schema.NullOr(Schema.String),
	rank: Rank,
	createdBy: Schema.String,
	createdAt: ISODate,
	resource: ResourceSummary,
});
export type ResourceLinkPublic = Schema.Schema.Type<typeof ResourceLinkPublic>;

export const MilestonePublic = Schema.Struct({
	id: Schema.String,
	projectId: Schema.String,
	name: Schema.String,
	description: Schema.NullOr(Schema.String),
	targetDate: Schema.NullOr(ISODate),
	rank: Rank,
	completedAt: Schema.NullOr(ISODate),
	completedBy: Schema.NullOr(
		Schema.Struct({ id: Schema.String, name: Schema.NullOr(Schema.String) }),
	),
	createdAt: ISODate,
	updatedAt: ISODate,
	progress: Progress,
});
export type MilestonePublic = Schema.Schema.Type<typeof MilestonePublic>;

export const TicketPublic = Schema.Struct({
	id: Schema.String,
	boardId: Schema.String,
	boardSlug: Schema.String,
	boardName: Schema.String,
	number: Schema.Number,
	key: Schema.String,
	title: Schema.String,
	status: Schema.String,
	priority: Schema.NullOr(Schema.String),
	archivedAt: Schema.NullOr(ISODate),
	startDate: Schema.NullOr(ISODate),
	dueDate: Schema.NullOr(ISODate),
	projectMilestoneId: Schema.NullOr(Schema.String),
	rank: Rank,
	addedAt: ISODate,
	addedBy: Schema.String,
});
export type TicketPublic = Schema.Schema.Type<typeof TicketPublic>;

export const EditEntry = Schema.Struct({
	content: Schema.String,
	editedAt: ISODate,
	userId: Schema.String,
});

export const UpdatePublic = Schema.Struct({
	id: Schema.String,
	organizationId: Schema.String,
	projectId: Schema.String,
	authorId: Schema.String,
	authorName: Schema.NullOr(Schema.String),
	content: Schema.String,
	health: Health,
	editHistory: Schema.Array(EditEntry),
	createdAt: ISODate,
	updatedAt: ISODate,
});
export type UpdatePublic = Schema.Schema.Type<typeof UpdatePublic>;

// --- Events (§2: schema_version 1; public projections only) ------------------------------
export const PROJECTS_SCHEMA_VERSION = 1;

const Id = Schema.String;

export const ProjectEventPayloadSchemas: Record<string, Schema.Schema> = {
	"project:created": Schema.Struct({ id: Id, organizationId: Id }),
	"project:updated": Schema.Struct({ id: Id, organizationId: Id }),
	"project:archived": Schema.Struct({ id: Id, organizationId: Id }),
	"project:unarchived": Schema.Struct({ id: Id, organizationId: Id }),
	"project:slug-alias-created": Schema.Struct({
		id: Id,
		projectId: Id,
		organizationId: Id,
		slug: ProjectSlug,
	}),
	"project:resource-link-upserted": Schema.Struct({
		id: Id,
		projectId: Id,
		resourceType: ResourceType,
		resourceId: Id,
	}),
	"project:resource-link-deleted": Schema.Struct({
		id: Id,
		projectId: Id,
		resourceType: ResourceType,
		resourceId: Id,
	}),
	"project:milestone-upserted": Schema.Struct({ id: Id, projectId: Id }),
	"project:milestone-deleted": Schema.Struct({ id: Id, projectId: Id }),
	"project:ticket-linked": Schema.Struct({ id: Id, projectId: Id, taskId: Id }),
	"project:ticket-unlinked": Schema.Struct({
		id: Id,
		projectId: Id,
		taskId: Id,
	}),
	"project:update-upserted": Schema.Struct({ id: Id, projectId: Id }),
	"project:update-deleted": Schema.Struct({ id: Id, projectId: Id }),
	"project:import-seeded": Schema.Struct({ organizationId: Id }),
};
