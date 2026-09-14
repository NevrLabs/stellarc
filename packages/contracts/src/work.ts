import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

// --- §3 validation primitives (shared with T1 style) ------------------------------------
export const ID = Schema.NonEmptyString.pipe(Schema.maxLength(128));
export const Name = Schema.NonEmptyString.pipe(Schema.maxLength(256));
export const DateString = Schema.String.pipe(
	Schema.pattern(
		/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
	),
);
export const Slug = Schema.String.pipe(
	Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	Schema.maxLength(64),
);
// fork parseTicketKey grammar: letter start, alnum/dash, ends alnum, ≤20.
export const BoardKey = Schema.String.pipe(
	Schema.pattern(/^[A-Za-z][A-Za-z0-9-]{0,19}$/),
);
export const Priority = Schema.Literal(
	"no-priority",
	"low",
	"medium",
	"high",
	"urgent",
);
export const StatusSlug = Schema.String.pipe(Schema.maxLength(64));

// --- Public rows (§2 snake → §3 camel; this slice holds no secrets) ----------------------
export const BoardPublic = Schema.Struct({
	id: Schema.String,
	organizationId: Schema.String,
	slug: Schema.String,
	icon: Schema.NullOr(Schema.String),
	name: Schema.String,
	description: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
	isPublic: Schema.NullOr(Schema.Boolean),
	archivedAt: Schema.NullOr(Schema.String),
	lastTaskNumber: Schema.Number,
	orgPrivilege: Schema.NullOr(Schema.String),
	taskStatusOrder: Schema.Array(Schema.String),
	backlogStatusOrder: Schema.Array(Schema.String),
	subtaskDepthLimit: Schema.Number,
	defaultAssigneeId: Schema.NullOr(Schema.String),
	defaultAssigneeTeamId: Schema.NullOr(Schema.String),
});
export type BoardPublic = Schema.Schema.Type<typeof BoardPublic>;

export const KeyAliasPublic = Schema.Struct({
	id: Schema.String,
	organizationId: Schema.String,
	boardId: Schema.String,
	key: Schema.String,
	createdAt: Schema.String,
});
export type KeyAliasPublic = Schema.Schema.Type<typeof KeyAliasPublic>;

export const StatusPublic = Schema.Struct({
	id: Schema.String,
	boardId: Schema.String,
	name: Schema.String,
	slug: Schema.String,
	position: Schema.Number,
	icon: Schema.NullOr(Schema.String),
	color: Schema.NullOr(Schema.String),
	isFinal: Schema.Boolean,
	createdAt: Schema.String,
	updatedAt: Schema.String,
});
export type StatusPublic = Schema.Schema.Type<typeof StatusPublic>;

export const DescriptionHistoryEntry = Schema.Struct({
	content: Schema.NullOr(Schema.String),
	editedAt: Schema.String,
	userId: Schema.String,
	sealed: Schema.optional(Schema.Boolean),
});

export const TicketPublic = Schema.Struct({
	id: Schema.String,
	boardId: Schema.String,
	position: Schema.NullOr(Schema.Number),
	number: Schema.NullOr(Schema.Number),
	assigneeId: Schema.NullOr(Schema.String),
	teamAssigneeId: Schema.NullOr(Schema.String),
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
	descriptionHistory: Schema.Array(DescriptionHistoryEntry),
	status: Schema.String,
	columnId: Schema.NullOr(Schema.String),
	priority: Schema.NullOr(Schema.String),
	milestoneId: Schema.NullOr(Schema.String),
	archivedAt: Schema.NullOr(Schema.String),
	archivedBy: Schema.NullOr(Schema.String),
	deletedAt: Schema.NullOr(Schema.String),
	deletedBy: Schema.NullOr(Schema.String),
	startDate: Schema.NullOr(Schema.String),
	dueDate: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
	updatedAt: Schema.String,
	// computed: normalizeBoardKey(board.slug)-number
	key: Schema.NullOr(Schema.String),
});
export type TicketPublic = Schema.Schema.Type<typeof TicketPublic>;

export const LabelPublic = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	color: Schema.String,
	source: Schema.Literal("kaneo", "repo"),
	createdAt: Schema.String,
	updatedAt: Schema.String,
	taskId: Schema.NullOr(Schema.String),
	organizationId: Schema.NullOr(Schema.String),
});
export type LabelPublic = Schema.Schema.Type<typeof LabelPublic>;

export const TemplateData = Schema.Struct({
	title: Schema.NonEmptyString,
	description: Schema.NullOr(Schema.String),
	priority: Schema.NullOr(Priority),
	startDate: Schema.NullOr(Schema.String),
	dueDate: Schema.NullOr(Schema.String),
	status: Schema.optional(Schema.NullOr(StatusSlug)),
	labels: Schema.optional(Schema.Array(Schema.String)),
	startDateOffset: Schema.optional(Schema.NullOr(Schema.String)),
	dueDateOffset: Schema.optional(Schema.NullOr(Schema.String)),
});
export const TemplatePublic = Schema.Struct({
	id: Schema.String,
	organizationId: Schema.String,
	name: Schema.String,
	data: TemplateData,
	createdAt: Schema.String,
	updatedAt: Schema.String,
});
export type TemplatePublic = Schema.Schema.Type<typeof TemplatePublic>;

export const FlagTypePublic = Schema.Struct({
	id: Schema.String,
	boardId: Schema.String,
	name: Schema.String,
	color: Schema.NullOr(Schema.String),
	icon: Schema.NullOr(Schema.String),
	position: Schema.Number,
	createdAt: Schema.String,
	updatedAt: Schema.String,
});
export type FlagTypePublic = Schema.Schema.Type<typeof FlagTypePublic>;

export const TaskFlagPublic = Schema.Struct({
	id: Schema.String,
	taskId: Schema.String,
	flagTypeId: Schema.String,
	flaggedBy: Schema.NullOr(Schema.String),
	targetUserId: Schema.NullOr(Schema.String),
	targetTeamId: Schema.NullOr(Schema.String),
	note: Schema.NullOr(Schema.String),
	resolveNote: Schema.NullOr(Schema.String),
	resolvedAt: Schema.NullOr(Schema.String),
	resolvedBy: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
	updatedAt: Schema.String,
});
export type TaskFlagPublic = Schema.Schema.Type<typeof TaskFlagPublic>;

// --- Error union E (shared with T1) -------------------------------------------------------
export const ConflictCode = Schema.Literal(
	"DuplicateSlug",
	"KeyAliasInUse",
	"StatusInUse",
	"BoardNotEmpty",
	"NumberDrift",
);
export const WorkError = Schema.Union(
	Schema.Struct({
		_tag: Schema.Literal("ValidationError"),
		message: Schema.String,
	}),
	Schema.Struct({ _tag: Schema.Literal("Unauthenticated") }),
	Schema.Struct({ _tag: Schema.Literal("Forbidden") }),
	Schema.Struct({ _tag: Schema.Literal("NotFound") }),
	Schema.Struct({ _tag: Schema.Literal("Conflict"), code: ConflictCode }),
	Schema.Struct({ _tag: Schema.Literal("RateLimited"), retryAfterSeconds: Schema.Number }),
	Schema.Struct({ _tag: Schema.Literal("Unavailable") }),
);
export type WorkError = Schema.Schema.Type<typeof WorkError>;

// --- Mutation envelope --------------------------------------------------------------------
export const Mutation = <A, I>(data: Schema.Schema<A, I>) =>
	Schema.Struct({ data, txid: Schema.Number });
export const DeletedId = Schema.Struct({ id: Schema.String });
