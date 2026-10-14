/**
 * Effect-v4 MCP tool schemas (kaneo-legacy tools.ts + schemas.ts port).
 *
 * Wire contract of every tool input, declared once as Effect Schemas; the
 * JSON Schema advertised over MCP is derived from these (toJsonSchemaDocument)
 * and the same schema validates handler input — the port's single source of
 * truth replaces the old zod declarations. Error-message parity with the
 * reference SDK is produced by the shared invalidParams helper in tools.ts.
 */

import { Schema } from "effect";

/* ---------- shared primitives ---------- */

export const Priority = Schema.Literals([
	"no-priority",
	"low",
	"medium",
	"high",
	"urgent",
]);

/** Non-empty trimmed string (zod `.trim().min(1)` parity: decode TRIMS, then
 * rejects empty — "  abc  " decodes to "abc", "   " is invalid). */
const NonEmpty = Schema.Trim.pipe(
	Schema.check(
		Schema.makeFilter((s: string) => (s.trim().length > 0 ? true : "Required")),
	),
);

export const OptionalNonEmpty = Schema.optional(NonEmpty);
export const NullableOptionalNonEmpty = Schema.optional(
	Schema.NullOr(NonEmpty),
);

// zod `.datetime({ offset: true })` exactly: date-T-time, optional seconds
// and fraction, and a REQUIRED zone (Z or ±HH:MM) — date-only and naive
// local times are invalid, "2026-01-01" is rejected.
// zod `.datetime({ offset: true })` exactly: date-T-time, optional seconds
// and fraction, and a REQUIRED zone (Z or ±HH:MM) — date-only and naive
// local times are invalid, "2026-01-01" is rejected.
const isoRe =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const IsoDateTime = Schema.String.pipe(
	Schema.check(
		Schema.makeFilter(
			(s) => (isoRe.test(s) ? true : "Expected an ISO 8601 date-time string"),
			{},
		),
	),
);
export const OptionalIsoDateTime = Schema.optional(IsoDateTime);
export const NullableOptionalIsoDateTime = Schema.optional(
	Schema.NullOr(IsoDateTime),
);

export const HexColor = Schema.String.pipe(
	Schema.check(
		Schema.makeFilter(
			(s) =>
				/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)
					? true
					: "Expected a hex color like #FF6600",
			{},
		),
	),
);

/* ---------- tool inputs ---------- */

export const Whoami = Schema.Struct({});
export const ListOrganizations = Schema.Struct({});
export const ListBoards = Schema.Struct({
	organizationId: NonEmpty,
	includeArchived: Schema.optional(Schema.Boolean),
});
export const GetBoard = Schema.Struct({ id: NonEmpty });
export const CreateBoard = Schema.Struct({
	name: NonEmpty,
	organizationId: NonEmpty,
	icon: NonEmpty,
	slug: NonEmpty,
});
export const UpdateBoard = Schema.Struct({
	id: NonEmpty,
	name: OptionalNonEmpty,
	icon: Schema.optional(Schema.String),
	slug: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
	isPublic: Schema.optional(Schema.Boolean),
});
export const ListTasks = Schema.Struct({
	boardId: NonEmpty,
	status: OptionalNonEmpty,
	priority: Schema.optional(Priority),
	assigneeId: OptionalNonEmpty,
	page: Schema.optional(
		Schema.Int.pipe(
			Schema.check(Schema.isBetween({ minimum: 1, maximum: 2147483647 })),
		),
	),
	limit: Schema.optional(
		Schema.Int.pipe(
			Schema.check(Schema.isBetween({ minimum: 1, maximum: 2147483647 })),
		),
	),
	sortBy: Schema.optional(
		Schema.Literals([
			"createdAt",
			"priority",
			"dueDate",
			"position",
			"title",
			"number",
		]),
	),
	sortOrder: Schema.optional(Schema.Literals(["asc", "desc"])),
	dueBefore: OptionalIsoDateTime,
	dueAfter: OptionalIsoDateTime,
});
export const GetTask = Schema.Struct({ taskId: NonEmpty });
export const CreateTask = Schema.Struct({
	boardId: NonEmpty,
	title: NonEmpty,
	description: Schema.String,
	priority: Priority,
	status: NonEmpty,
	startDate: OptionalIsoDateTime,
	dueDate: OptionalIsoDateTime,
	userId: OptionalNonEmpty,
});
export const AssignTask = Schema.Struct({
	taskId: NonEmpty,
	userId: NullableOptionalNonEmpty,
});
export const UpdateTask = Schema.Struct({
	taskId: NonEmpty,
	title: OptionalNonEmpty,
	description: Schema.optional(Schema.String.pipe(Schema.NullishOr)),
	status: OptionalNonEmpty,
	priority: Schema.optional(Priority),
	boardId: OptionalNonEmpty,
	position: Schema.optional(Schema.Number),
	startDate: NullableOptionalIsoDateTime,
	dueDate: NullableOptionalIsoDateTime,
	userId: NullableOptionalNonEmpty,
});
export const MoveTask = Schema.Struct({
	taskId: NonEmpty,
	destinationBoardId: NonEmpty,
	destinationStatus: OptionalNonEmpty,
});
export const UpdateTaskStatus = Schema.Struct({
	taskId: NonEmpty,
	status: NonEmpty,
});
export const ListTaskComments = Schema.Struct({ taskId: NonEmpty });
export const CreateTaskComment = Schema.Struct({
	taskId: NonEmpty,
	content: NonEmpty,
});
export const UpdateTaskComment = Schema.Struct({
	commentId: NonEmpty,
	content: NonEmpty,
});
export const DeleteTaskComment = Schema.Struct({ commentId: NonEmpty });
export const ListOrganizationLabels = Schema.Struct({
	organizationId: NonEmpty,
});
export const CreateLabel = Schema.Struct({
	name: NonEmpty,
	color: HexColor,
	organizationId: NonEmpty,
	taskId: OptionalNonEmpty,
});
export const AttachLabelToTask = Schema.Struct({
	labelId: NonEmpty,
	taskId: NonEmpty,
});
export const DetachLabelFromTask = Schema.Struct({ labelId: NonEmpty });
export const CreateTaskRelation = Schema.Struct({
	sourceTaskId: NonEmpty,
	targetTaskId: NonEmpty,
	relationType: Schema.Literals(["subtask", "blocks", "related"]),
});
export const GetTaskRelations = Schema.Struct({ taskId: NonEmpty });
export const DeleteTaskRelation = Schema.Struct({ id: NonEmpty });
export const DeleteLabel = Schema.Struct({ id: NonEmpty });
export const ListBoardColumns = Schema.Struct({ boardId: NonEmpty });
export const Search = Schema.Struct({
	q: NonEmpty,
	organizationId: NonEmpty,
	type: Schema.optional(
		Schema.Literals([
			"all",
			"tasks",
			"boards",
			"organizations",
			"comments",
			"activities",
			"repositories",
			"issues",
			"pullRequests",
		]),
	),
	boardId: OptionalNonEmpty,
	limit: Schema.optional(
		Schema.Int.pipe(
			Schema.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
		),
	),
});
export const ListOrganizationMembers = Schema.Struct({
	organizationId: NonEmpty,
});
export const ListRepos = Schema.Struct({ organizationId: NonEmpty });
export const ListRepoPullRequests = Schema.Struct({
	repoId: NonEmpty,
	state: Schema.optional(Schema.Literals(["open", "closed", "merged", "all"])),
});
export const ListRepoIssues = Schema.Struct({
	repoId: NonEmpty,
	state: Schema.optional(Schema.Literals(["open", "closed", "all"])),
});
export const GetRepoPullRequestFiles = Schema.Struct({
	repoId: NonEmpty,
	number: Schema.Int.pipe(
		Schema.check(Schema.isBetween({ minimum: 1, maximum: 2147483647 })),
	),
});
