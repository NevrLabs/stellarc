import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { FoundationApi } from "./api";

// --- §3 validation primitives ------------------------------------------------
export const ID = Schema.NonEmptyString.pipe(Schema.maxLength(128));
/** Date = ISO UTC string on the wire (§3). */
export const IsoDate = Schema.DateFromString;
export const Limit = Schema.Int.pipe(Schema.between(1, 200));

// --- §2 public rows -----------------------------------------------------------
export const EditHistoryEntry = Schema.Struct({
	content: Schema.String,
	editedAt: IsoDate,
	userId: ID,
});
export type EditHistoryEntry = typeof EditHistoryEntry.Type;

/** ActivityRow: exact camelCase mapping of activity_projection minus orgId/lastSeq. */
export const ActivityRow = Schema.Struct({
	id: Schema.String,
	ticketId: Schema.String,
	type: Schema.String,
	createdAt: IsoDate,
	updatedAt: IsoDate,
	userId: Schema.NullOr(Schema.String),
	content: Schema.NullOr(Schema.String),
	editHistory: Schema.Array(EditHistoryEntry),
	eventData: Schema.NullOr(Schema.Unknown),
	externalUserName: Schema.NullOr(Schema.String),
	externalUserAvatar: Schema.NullOr(Schema.String),
	externalSource: Schema.NullOr(Schema.String),
	externalUrl: Schema.NullOr(Schema.String),
	user: Schema.NullOr(
		Schema.Struct({
			id: Schema.String,
			name: Schema.String,
			image: Schema.NullOr(Schema.String),
		}),
	),
});
export type ActivityRow = typeof ActivityRow.Type;

export const NotificationRow = Schema.Struct({
	id: Schema.String,
	orgId: Schema.NullOr(Schema.String),
	userId: Schema.String,
	title: Schema.NullOr(Schema.String),
	content: Schema.NullOr(Schema.String),
	type: Schema.String,
	eventData: Schema.NullOr(Schema.Unknown),
	isRead: Schema.NullOr(Schema.Boolean),
	resourceId: Schema.NullOr(Schema.String),
	resourceType: Schema.NullOr(Schema.String),
	createdAt: IsoDate,
	updatedAt: IsoDate,
});
export type NotificationRow = typeof NotificationRow.Type;

export const WorkflowRow = Schema.Struct({
	id: Schema.String,
	orgId: Schema.String,
	boardId: Schema.String,
	integrationType: Schema.String,
	eventType: Schema.String,
	statusId: Schema.String,
	createdAt: IsoDate,
	updatedAt: IsoDate,
});
export type WorkflowRow = typeof WorkflowRow.Type;

// --- Preferences (§3 DTOs; secrets stay REST self-only) ------------------------
export const PreferencePublic = Schema.Struct({
	id: Schema.String,
	userId: Schema.String,
	emailEnabled: Schema.Boolean,
	ntfyEnabled: Schema.Boolean,
	ntfyConfigured: Schema.Boolean,
	ntfyTokenConfigured: Schema.Boolean,
	gotifyEnabled: Schema.Boolean,
	gotifyConfigured: Schema.Boolean,
	gotifyTokenConfigured: Schema.Boolean,
	webhookEnabled: Schema.Boolean,
	webhookConfigured: Schema.Boolean,
	webhookSecretConfigured: Schema.Boolean,
	taskAssignmentEnabled: Schema.Boolean,
	taskCommentEnabled: Schema.Boolean,
	taskStatusChangeEnabled: Schema.Boolean,
	dueDateReminderEnabled: Schema.Boolean,
	dueDateReminderLeadTimeMinutes: Schema.Int,
	createdAt: Schema.NullOr(IsoDate),
	updatedAt: Schema.NullOr(IsoDate),
});
export type PreferencePublic = typeof PreferencePublic.Type;

export const PreferenceRulePublic = Schema.Struct({
	id: Schema.String,
	userId: Schema.String,
	organizationId: Schema.String,
	organizationName: Schema.String,
	isActive: Schema.Boolean,
	emailEnabled: Schema.Boolean,
	ntfyEnabled: Schema.Boolean,
	gotifyEnabled: Schema.Boolean,
	webhookEnabled: Schema.Boolean,
	boardMode: Schema.Literal("all", "selected"),
	selectedBoardIds: Schema.Array(ID),
	createdAt: IsoDate,
	updatedAt: IsoDate,
});
export type PreferenceRulePublic = typeof PreferenceRulePublic.Type;

export const PreferenceResponse = Schema.Struct({
	emailAddress: Schema.NullOr(Schema.String),
	ntfyServerUrl: Schema.NullOr(Schema.String),
	ntfyTopic: Schema.NullOr(Schema.String),
	gotifyServerUrl: Schema.NullOr(Schema.String),
	webhookUrl: Schema.NullOr(Schema.String),
	maskedNtfyToken: Schema.NullOr(Schema.String),
	maskedGotifyToken: Schema.NullOr(Schema.String),
	maskedWebhookSecret: Schema.NullOr(Schema.String),
	...PreferencePublic.fields,
	organizations: Schema.Array(PreferenceRulePublic),
});
export type PreferenceResponse = typeof PreferenceResponse.Type;

// --- Mutation envelope and shared responses (§3) -------------------------------
/** txid is a PostgreSQL xid8 mapped to a JS safe integer (T0 safeTxid). */
const SafeInt = Schema.Number.pipe(
	Schema.int(),
	Schema.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
	Schema.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
export const Mutated = <S extends Schema.Schema.Any>(value: S) =>
	Schema.Struct({
		data: value,
		txid: SafeInt,
		changed: Schema.optional(Schema.Boolean),
	});
export type Mutated<S> = { data: S; txid: number; changed?: boolean };

export const ActivityEnvelope = Mutated(ActivityRow);
export const NotificationEnvelope = Mutated(NotificationRow);
export const IdEnvelope = Mutated(Schema.Struct({ id: Schema.String }));
export const CountEnvelope = Mutated(
	Schema.Struct({ count: Schema.Int, changed: Schema.Boolean }),
);
export const PreferenceEnvelope = Mutated(PreferenceResponse);
export const WorkflowEnvelope = Mutated(WorkflowRow);

export const ActivityList = Schema.Struct({
	items: Schema.Array(ActivityRow),
	nextCursor: Schema.NullOr(Schema.String),
});
export const NotificationList = Schema.Struct({
	items: Schema.Array(NotificationRow),
	nextCursor: Schema.NullOr(Schema.String),
});
export const UnreadCount = Schema.Struct({
	count: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
});
export const WorkflowRuleList = Schema.Struct({
	items: Schema.Array(WorkflowRow),
});

// --- §3 error E (sanitized; shared vocabulary, no SQL/PII) ----------------------
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", {}) {}
export class RateLimited extends Schema.TaggedError<RateLimited>()(
	"RateLimited",
	{
		retryAfterSeconds: Schema.Number,
	},
) {}
export class Unavailable extends Schema.TaggedError<Unavailable>()(
	"Unavailable",
	{},
) {}

// --- Request payloads (§3; strict excess-key rejection is HttpApi default) ------
// UrlParams must encode to strings (HttpApi validator); range checks on
// limit/cursor happen at the domain boundary (T27 covers rejections).
export const CursorQuery = Schema.Struct({
	cursor: Schema.optional(Schema.String),
	limit: Schema.optional(Schema.String),
});
export const CommentContent = Schema.Struct({
	content: Schema.String.pipe(Schema.maxLength(1024 * 1024)),
});
export const ExpectedUpdate = Schema.Struct({ expectedUpdatedAt: IsoDate });
export const NotificationScopeQuery = Schema.Struct({
	cursor: Schema.optional(Schema.String),
	limit: Schema.optional(Schema.String),
	orgId: Schema.optional(Schema.String),
});
export const OrgScopeBody = Schema.Struct({ orgId: Schema.optional(ID) });
export const PreferenceUpdate = Schema.Struct({
	emailEnabled: Schema.optional(Schema.Boolean),
	ntfyEnabled: Schema.optional(Schema.Boolean),
	gotifyEnabled: Schema.optional(Schema.Boolean),
	webhookEnabled: Schema.optional(Schema.Boolean),
	taskAssignmentEnabled: Schema.optional(Schema.Boolean),
	taskCommentEnabled: Schema.optional(Schema.Boolean),
	taskStatusChangeEnabled: Schema.optional(Schema.Boolean),
	dueDateReminderEnabled: Schema.optional(Schema.Boolean),
	ntfyServerUrl: Schema.optional(Schema.NullOr(Schema.String)),
	ntfyTopic: Schema.optional(Schema.NullOr(Schema.String)),
	ntfyToken: Schema.optional(Schema.NullOr(Schema.String)),
	gotifyServerUrl: Schema.optional(Schema.NullOr(Schema.String)),
	gotifyToken: Schema.optional(Schema.NullOr(Schema.String)),
	webhookUrl: Schema.optional(Schema.NullOr(Schema.String)),
	webhookSecret: Schema.optional(Schema.NullOr(Schema.String)),
	dueDateReminderLeadTimeMinutes: Schema.optional(
		Schema.Int.pipe(Schema.between(5, 43200)),
	),
});
export const OrgRuleUpsert = Schema.Struct({
	isActive: Schema.Boolean,
	emailEnabled: Schema.Boolean,
	ntfyEnabled: Schema.Boolean,
	gotifyEnabled: Schema.Boolean,
	webhookEnabled: Schema.Boolean,
	boardMode: Schema.Literal("all", "selected"),
	selectedBoardIds: Schema.optional(Schema.Array(ID)),
});
export const WorkflowRuleUpsert = Schema.Struct({
	integrationType: Schema.String,
	eventType: Schema.String,
	statusId: ID,
});

// --- Endpoint group (§3 table; names are stable handler anchors) ----------------
export const ActivityNotificationsApiGroup = HttpApiGroup.make(
	"activity-notifications",
)
	.add(
		HttpApiEndpoint.get("activity-list", "/orgs/:org/tickets/:ticket/activity")
			.setPath(Schema.Struct({ org: ID, ticket: ID }))
			.setUrlParams(CursorQuery)
			.addSuccess(ActivityList),
	)
	.add(
		HttpApiEndpoint.post(
			"comment-create",
			"/orgs/:org/tickets/:ticket/comments",
		)
			.setPath(Schema.Struct({ org: ID, ticket: ID }))
			.setPayload(CommentContent)
			.addSuccess(ActivityEnvelope)
			.addError(Conflict),
	)
	.add(
		HttpApiEndpoint.patch(
			"comment-update",
			"/orgs/:org/tickets/:ticket/comments/:id",
		)
			.setPath(Schema.Struct({ org: ID, ticket: ID, id: ID }))
			.setPayload(
				Schema.Struct({ ...CommentContent.fields, ...ExpectedUpdate.fields }),
			)
			.addSuccess(ActivityEnvelope)
			.addError(Conflict),
	)
	.add(
		HttpApiEndpoint.del(
			"comment-delete",
			"/orgs/:org/tickets/:ticket/comments/:id",
		)
			.setPath(Schema.Struct({ org: ID, ticket: ID, id: ID }))
			.setPayload(ExpectedUpdate)
			.addSuccess(IdEnvelope)
			.addError(Conflict),
	)
	.add(
		HttpApiEndpoint.get("notification-list", "/notifications")
			.setUrlParams(NotificationScopeQuery)
			.addSuccess(NotificationList),
	)
	.add(
		HttpApiEndpoint.get(
			"notification-unread-count",
			"/notifications/unread-count",
		)
			.setUrlParams(Schema.Struct({ orgId: Schema.optional(Schema.String) }))
			.addSuccess(UnreadCount),
	)
	.add(
		HttpApiEndpoint.patch("notification-read", "/notifications/:id/read")
			.setPath(Schema.Struct({ id: ID }))
			.setPayload(Schema.Struct({}))
			.addSuccess(NotificationEnvelope),
	)
	.add(
		HttpApiEndpoint.patch("notification-read-all", "/notifications/read-all")
			.setPayload(OrgScopeBody)
			.addSuccess(CountEnvelope),
	)
	.add(
		HttpApiEndpoint.del("notification-clear-all", "/notifications/clear-all")
			.setPayload(OrgScopeBody)
			.addSuccess(CountEnvelope),
	)
	.add(
		HttpApiEndpoint.del("notification-delete", "/notifications/:id")
			.setPath(Schema.Struct({ id: ID }))
			.addSuccess(IdEnvelope),
	)
	.add(
		HttpApiEndpoint.get(
			"preference-get",
			"/notification-preferences",
		).addSuccess(PreferenceResponse),
	)
	.add(
		HttpApiEndpoint.put("preference-put", "/notification-preferences")
			.setPayload(PreferenceUpdate)
			.addSuccess(PreferenceEnvelope),
	)
	.add(
		HttpApiEndpoint.put(
			"preference-org-upsert",
			"/notification-preferences/organizations/:org",
		)
			.setPath(Schema.Struct({ org: ID }))
			.setPayload(OrgRuleUpsert)
			.addSuccess(PreferenceEnvelope),
	)
	.add(
		HttpApiEndpoint.del(
			"preference-org-delete",
			"/notification-preferences/organizations/:org",
		)
			.setPath(Schema.Struct({ org: ID }))
			.addSuccess(PreferenceEnvelope),
	)
	.add(
		HttpApiEndpoint.get(
			"workflow-list",
			"/orgs/:org/boards/:board/workflow-rules",
		)
			.setPath(Schema.Struct({ org: ID, board: ID }))
			.addSuccess(WorkflowRuleList),
	)
	.add(
		HttpApiEndpoint.put(
			"workflow-upsert",
			"/orgs/:org/boards/:board/workflow-rules",
		)
			.setPath(Schema.Struct({ org: ID, board: ID }))
			.setPayload(WorkflowRuleUpsert)
			.addSuccess(WorkflowEnvelope)
			.addError(Conflict),
	)
	.add(
		HttpApiEndpoint.del(
			"workflow-delete",
			"/orgs/:org/boards/:board/workflow-rules/:id",
		)
			.setPath(Schema.Struct({ org: ID, board: ID, id: ID }))
			.addSuccess(IdEnvelope),
	);

// T0 §3 contract: the foundation API carries the org shape route; this slice's
// group mounts beside it on the same HttpApi.make("foundation").
export const StellarcApi = FoundationApi.add(ActivityNotificationsApiGroup);
