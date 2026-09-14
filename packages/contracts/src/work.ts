import {
	HttpApi,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
} from "@effect/platform";
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
	Schema.Struct({
		_tag: Schema.Literal("RateLimited"),
		retryAfterSeconds: Schema.Number,
	}),
	Schema.Struct({ _tag: Schema.Literal("Unavailable") }),
);
export type WorkError = Schema.Schema.Type<typeof WorkError>;

// --- Mutation envelope --------------------------------------------------------------------
export const Mutation = <A, I>(data: Schema.Schema<A, I>) =>
	Schema.Struct({ data, txid: Schema.Number });
export const DeletedId = Schema.Struct({ id: Schema.String });

// --- Request schemas --------------------------------------------------------------------
const Empty = Schema.Struct({});
export const ListBoardsQuery = Schema.Struct({
	includeArchived: Schema.optional(Schema.Boolean),
	teamId: Schema.optional(ID),
});
export const CreateBoardRequest = Schema.Struct({
	name: Name,
	slug: Schema.optional(Schema.String),
	icon: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
});
export const UpdateBoardRequest = Schema.Struct({
	name: Schema.optional(Name),
	icon: Schema.optional(Schema.NullOr(Schema.String)),
	description: Schema.optional(Schema.NullOr(Schema.String)),
	taskStatusOrder: Schema.optional(Schema.Array(StatusSlug)),
	backlogStatusOrder: Schema.optional(Schema.Array(StatusSlug)),
	defaultAssigneeId: Schema.optional(Schema.NullOr(ID)),
	defaultAssigneeTeamId: Schema.optional(Schema.NullOr(ID)),
});
export const PutBoardKeyRequest = Schema.Struct({ key: BoardKey });
export const CreateStatusRequest = Schema.Struct({
	name: Name,
	slug: Schema.optional(Schema.String),
	position: Schema.optional(Schema.Number),
	icon: Schema.optional(Schema.String),
	color: Schema.optional(Schema.String),
	isFinal: Schema.optional(Schema.Boolean),
});
export const UpdateStatusRequest = Schema.Struct({
	name: Schema.optional(Name),
	icon: Schema.optional(Schema.NullOr(Schema.String)),
	color: Schema.optional(Schema.NullOr(Schema.String)),
	position: Schema.optional(Schema.Number),
	isFinal: Schema.optional(Schema.Boolean),
});
export const ReorderStatusesRequest = Schema.Struct({ ids: Schema.Array(ID) });
export const ListTicketsQuery = Schema.Struct({
	status: Schema.optional(StatusSlug),
	assigneeId: Schema.optional(ID),
	teamId: Schema.optional(ID),
	includeArchived: Schema.optional(Schema.Boolean),
	includeDeleted: Schema.optional(Schema.Boolean),
});
export const CreateTicketRequest = Schema.Struct({
	title: Name,
	description: Schema.optional(Schema.String),
	status: Schema.optional(StatusSlug),
	priority: Schema.optional(Priority),
	assigneeId: Schema.optional(Schema.NullOr(ID)),
	teamId: Schema.optional(Schema.NullOr(ID)),
	startDate: Schema.optional(Schema.NullOr(DateString)),
	dueDate: Schema.optional(Schema.NullOr(DateString)),
	labels: Schema.optional(Schema.Array(ID)),
	templateId: Schema.optional(ID),
});
export const UpdateTicketRequest = Schema.Struct({
	title: Schema.optional(Name),
	description: Schema.optional(Schema.String),
	priority: Schema.optional(Priority),
	assigneeId: Schema.optional(Schema.NullOr(ID)),
	teamId: Schema.optional(Schema.NullOr(ID)),
	startDate: Schema.optional(Schema.NullOr(DateString)),
	dueDate: Schema.optional(Schema.NullOr(DateString)),
});
export const PutTicketStatusRequest = Schema.Struct({ status: StatusSlug });
export const MoveTicketRequest = Schema.Struct({
	boardId: ID,
	status: Schema.optional(StatusSlug),
	position: Schema.optional(Schema.Number),
});
export const ReorderTicketsRequest = Schema.Struct({
	updates: Schema.Array(
		Schema.Struct({
			id: ID,
			position: Schema.Number,
			status: Schema.optional(StatusSlug),
		}),
	),
});
export const BulkPatchTicketsRequest = Schema.Struct({
	ids: Schema.Array(ID),
	patch: Schema.Struct({
		status: Schema.optional(StatusSlug),
		priority: Schema.optional(Priority),
		assigneeId: Schema.optional(Schema.NullOr(ID)),
		teamId: Schema.optional(Schema.NullOr(ID)),
	}),
});
export const PutTicketArchivedRequest = Schema.Struct({
	archived: Schema.Boolean,
});
export const CreateLabelRequest = Schema.Struct({
	name: Name,
	color: Schema.NonEmptyString,
	taskId: Schema.optional(ID),
	organizationId: Schema.optional(ID),
});
export const UpdateLabelRequest = Schema.Struct({
	name: Schema.optional(Name),
	color: Schema.optional(Schema.NonEmptyString),
});
export const PutLabelTaskRequest = Schema.Struct({
	taskId: Schema.optional(ID),
});
export const CreateTemplateRequest = Schema.Struct({
	organizationId: ID,
	name: Name,
	data: TemplateData,
});
export const UpdateTemplateRequest = Schema.Struct({
	name: Schema.optional(Name),
	data: Schema.optional(TemplateData),
});
export const CreateFlagTypeRequest = Schema.Struct({
	boardId: ID,
	name: Name,
	color: Schema.optional(Schema.String),
	icon: Schema.optional(Schema.String),
	position: Schema.optional(Schema.Number),
});
export const UpdateFlagTypeRequest = Schema.Struct({
	name: Schema.optional(Name),
	color: Schema.optional(Schema.NullOr(Schema.String)),
	icon: Schema.optional(Schema.NullOr(Schema.String)),
	position: Schema.optional(Schema.Number),
});
export const CreateTicketFlagRequest = Schema.Struct({
	flagTypeId: ID,
	targetUserId: Schema.optional(ID),
	targetTeamId: Schema.optional(ID),
	note: Schema.optional(Schema.String),
});
export const ResolveFlagRequest = Schema.Struct({
	note: Schema.NonEmptyString,
});

// --- Minimal public board (unauthenticated; §3) ------------------------------------------
export const PublicBoardMinimal = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	slug: Schema.String,
	description: Schema.NullOr(Schema.String),
	icon: Schema.NullOr(Schema.String),
	// Date-encoded (postgres.js returns Date for timestamptz/timestamp reads);
	// Schema.Date accepts Date on encode side and serializes ISO.
	createdAt: Schema.Date,
});

// --- Response helpers -----------------------------------------------------------------------
// handleRaw handlers return plain objects; the encoder applies whatever
// success-variant matches (status rides the annotation). Mutations return
// {data, txid}; errors are WorkError variants annotated with their status.
export const WorkOk = <A, I>(data: Schema.Schema<A, I>) =>
	Schema.Struct({ data, txid: Schema.Number }).annotations({
		identifier: "WorkOk",
	});

const WORK_ERROR_STATUS = [400, 401, 403, 404, 409, 429, 503] as const;
// Single union schema whose members carry status annotations via
// HttpApiSchema.annotations; the response encoder applies the matched
// member's status code.
export const WorkErrorVariants = Schema.Union(
	// Union.of's spread inference mis-narrows; unknown keeps the members opaque.
	...(
		WorkError.members as unknown as ReadonlyArray<Schema.Schema<unknown>>
	).map(
		(member, index) =>
			member.annotations(
				HttpApiSchema.annotations({ status: WORK_ERROR_STATUS[index] ?? 400 }),
			) as Schema.Schema<unknown>,
	),
);

const M = Mutation;

// --- Endpoints ----------------------------------------------------------------------------

export const WorkApi = HttpApi.make("work").add(
	HttpApiGroup.make("work")
		.add(
			HttpApiEndpoint.get("listBoards", "/api/work/boards")
				.addSuccess(Schema.Struct({ boards: Schema.Array(BoardPublic) }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("createBoard", "/api/work/boards")
				.setPayload(CreateBoardRequest)
				.addSuccess(M(BoardPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("getBoard", "/api/work/boards/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(Schema.Struct({ board: BoardPublic }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.patch("updateBoard", "/api/work/boards/:id")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(UpdateBoardRequest)
				.addSuccess(M(BoardPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.del("deleteBoard", "/api/work/boards/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(M(DeletedId))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("archiveBoard", "/api/work/boards/:id/archive")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(Empty)
				.addSuccess(M(BoardPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("unarchiveBoard", "/api/work/boards/:id/unarchive")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(Empty)
				.addSuccess(M(BoardPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.put("putBoardKey", "/api/work/boards/:id/key")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(PutBoardKeyRequest)
				.addSuccess(M(BoardPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("listStatuses", "/api/work/boards/:id/statuses")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(Schema.Struct({ statuses: Schema.Array(StatusPublic) }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("createStatus", "/api/work/boards/:id/statuses")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(CreateStatusRequest)
				.addSuccess(M(StatusPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.put(
				"reorderStatuses",
				"/api/work/boards/:id/statuses/reorder",
			)
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(ReorderStatusesRequest)
				.addSuccess(M(Schema.Struct({ ids: Schema.Array(Schema.String) })))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.patch("updateStatus", "/api/work/statuses/:id")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(UpdateStatusRequest)
				.addSuccess(M(StatusPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.del("deleteStatus", "/api/work/statuses/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(M(DeletedId))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("listTickets", "/api/work/boards/:id/tickets")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(Schema.Struct({ tickets: Schema.Array(TicketPublic) }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("createTicket", "/api/work/boards/:id/tickets")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(CreateTicketRequest)
				.addSuccess(M(TicketPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.put(
				"reorderTickets",
				"/api/work/boards/:id/tickets/reorder",
			)
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(ReorderTicketsRequest)
				.addSuccess(M(Schema.Struct({ ids: Schema.Array(Schema.String) })))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("getTicket", "/api/work/tickets/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(Schema.Struct({ ticket: TicketPublic }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.patch("updateTicket", "/api/work/tickets/:id")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(UpdateTicketRequest)
				.addSuccess(M(TicketPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.put("putTicketStatus", "/api/work/tickets/:id/status")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(PutTicketStatusRequest)
				.addSuccess(M(TicketPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("moveTicket", "/api/work/tickets/:id/move")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(MoveTicketRequest)
				.addSuccess(M(TicketPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.patch("bulkPatchTickets", "/api/work/tickets/bulk")
				.setPayload(BulkPatchTicketsRequest)
				.addSuccess(M(Schema.Struct({ ids: Schema.Array(Schema.String) })))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.del("deleteTicket", "/api/work/tickets/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(M(DeletedId))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("restoreTicket", "/api/work/tickets/:id/restore")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(Empty)
				.addSuccess(M(TicketPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.put("putTicketArchived", "/api/work/tickets/:id/archive")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(PutTicketArchivedRequest)
				.addSuccess(M(TicketPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("listLabels", "/api/work/labels")
				.addSuccess(Schema.Struct({ labels: Schema.Array(LabelPublic) }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("createLabel", "/api/work/labels")
				.setPayload(CreateLabelRequest)
				.addSuccess(M(LabelPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.patch("updateLabel", "/api/work/labels/:id")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(UpdateLabelRequest)
				.addSuccess(M(LabelPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.put("putLabelTask", "/api/work/labels/:id/task")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(PutLabelTaskRequest)
				.addSuccess(M(LabelPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.del("deleteLabel", "/api/work/labels/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(M(DeletedId))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("listTicketLabels", "/api/work/tickets/:id/labels")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(Schema.Struct({ labels: Schema.Array(LabelPublic) }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("listTemplates", "/api/work/templates")
				.addSuccess(Schema.Struct({ templates: Schema.Array(TemplatePublic) }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("createTemplate", "/api/work/templates")
				.setPayload(CreateTemplateRequest)
				.addSuccess(M(TemplatePublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.patch("updateTemplate", "/api/work/templates/:id")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(UpdateTemplateRequest)
				.addSuccess(M(TemplatePublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.del("deleteTemplate", "/api/work/templates/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(M(DeletedId))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("listFlagTypes", "/api/work/flag-types")
				.addSuccess(Schema.Struct({ flagTypes: Schema.Array(FlagTypePublic) }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("createFlagType", "/api/work/flag-types")
				.setPayload(CreateFlagTypeRequest)
				.addSuccess(M(FlagTypePublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.patch("updateFlagType", "/api/work/flag-types/:id")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(UpdateFlagTypeRequest)
				.addSuccess(M(FlagTypePublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.del("deleteFlagType", "/api/work/flag-types/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(M(DeletedId))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("listTicketFlags", "/api/work/tickets/:id/flags")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(Schema.Struct({ flags: Schema.Array(TaskFlagPublic) }))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("createTicketFlag", "/api/work/tickets/:id/flags")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(CreateTicketFlagRequest)
				.addSuccess(M(TaskFlagPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.post("resolveTicketFlag", "/api/work/flags/:id/resolve")
				.setPath(Schema.Struct({ id: ID }))
				.setPayload(ResolveFlagRequest)
				.addSuccess(M(TaskFlagPublic))
				.addSuccess(WorkErrorVariants as never),
		)
		.add(
			HttpApiEndpoint.get("publicBoard", "/api/public/boards/:id")
				.setPath(Schema.Struct({ id: ID }))
				.addSuccess(Schema.Struct({ board: PublicBoardMinimal }))
				.addSuccess(WorkErrorVariants as never),
		),
);
