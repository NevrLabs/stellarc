import { randomUUID } from "node:crypto";
import { Schema } from "effect";
import type { Sql } from "postgres";
import {
	type ActivityRow,
	EditHistoryEntry,
	type WorkflowRow,
} from "../../contracts/src/activity-notifications";

// --- Event payload schemas (§2; every emitted version is schema_version=1) -----
const Id = Schema.String;
export const EventOrigin = Schema.Literal("live", "import");
export type EventOrigin = typeof EventOrigin.Type;

export const CommentCreatedPayload = Schema.Struct({
	id: Id,
	ticketId: Id,
	boardId: Id,
	row: Schema.Unknown, // ActivityRow serialized; decode at the shape boundary
	origin: EventOrigin,
	mentionUserIds: Schema.Array(Id),
	recipientUserIds: Schema.Array(Id),
});
export type CommentCreatedPayload = typeof CommentCreatedPayload.Type;

export const CommentUpdatedPayload = Schema.Struct({
	id: Id,
	ticketId: Id,
	boardId: Id,
	row: Schema.Unknown,
	origin: EventOrigin,
});
export type CommentUpdatedPayload = typeof CommentUpdatedPayload.Type;

export const CommentDeletedPayload = Schema.Struct({
	id: Id,
	ticketId: Id,
	boardId: Id,
	userId: Schema.NullOr(Id),
	origin: EventOrigin,
});
export type CommentDeletedPayload = typeof CommentDeletedPayload.Type;

export const LegacyRecordedPayload = Schema.Struct({
	id: Id,
	ticketId: Id,
	boardId: Id,
	row: Schema.Unknown,
	origin: Schema.Literal("import"),
});
export type LegacyRecordedPayload = typeof LegacyRecordedPayload.Type;

export const NotificationCreatedPayload = Schema.Struct({
	id: Id,
	userId: Id,
	orgId: Schema.NullOr(Id),
	row: Schema.Unknown,
	origin: EventOrigin,
});
export type NotificationCreatedPayload = typeof NotificationCreatedPayload.Type;

export const NotificationUpdatedPayload = Schema.Struct({
	id: Id,
	userId: Id,
	orgId: Schema.NullOr(Id),
	row: Schema.Unknown,
	origin: EventOrigin,
});
export type NotificationUpdatedPayload = typeof NotificationUpdatedPayload.Type;

export const NotificationDeletedPayload = Schema.Struct({
	id: Id,
	userId: Id,
	orgId: Schema.NullOr(Id),
});
export type NotificationDeletedPayload = typeof NotificationDeletedPayload.Type;

export const PreferencesUpdatedPayload = Schema.Struct({
	id: Id,
	userId: Id,
	row: Schema.Unknown, // PreferencePublic — derives safe fields only
});
export type PreferencesUpdatedPayload = typeof PreferencesUpdatedPayload.Type;

export const OrganizationRuleUpsertedPayload = Schema.Struct({
	id: Id,
	userId: Id,
	row: Schema.Unknown,
});
export type OrganizationRuleUpsertedPayload =
	typeof OrganizationRuleUpsertedPayload.Type;

export const OrganizationRuleDeletedPayload = Schema.Struct({
	id: Id,
	userId: Id,
	organizationId: Id,
});
export type OrganizationRuleDeletedPayload =
	typeof OrganizationRuleDeletedPayload.Type;

export const WorkflowRuleUpsertedPayload = Schema.Struct({
	id: Id,
	boardId: Id,
	row: Schema.Unknown,
});
export type WorkflowRuleUpsertedPayload =
	typeof WorkflowRuleUpsertedPayload.Type;

export const WorkflowRuleDeletedPayload = Schema.Struct({
	id: Id,
	boardId: Id,
});
export type WorkflowRuleDeletedPayload = typeof WorkflowRuleDeletedPayload.Type;

// Pinned event-type → payload vocabulary (§2). STL-16 names are deliberately
// absent; adapters land in the owning merge.
export const EVENT_SCHEMA_VERSION = 1;
export const ACTIVITY_EVENT_TYPES = {
	commentCreated: "activity:comment-created",
	commentUpdated: "activity:comment-updated",
	commentDeleted: "activity:comment-deleted",
	legacyRecorded: "activity:legacy-recorded",
} as const;
export const NOTIFICATION_EVENT_TYPES = {
	created: "notification:created",
	updated: "notification:updated",
	deleted: "notification:deleted",
	preferencesUpdated: "notification:preferences-updated",
	organizationRuleUpserted: "notification:organization-rule-upserted",
	organizationRuleDeleted: "notification:organization-rule-deleted",
} as const;
export const WORKFLOW_EVENT_TYPES = {
	ruleUpserted: "workflow:rule-upserted",
	ruleDeleted: "workflow:rule-deleted",
} as const;

// --- Outbox enqueue contract (implemented in notification-outbox.ts) -----------
/** The producer appends this many events and enqueues one job per live event. */
export interface OutboxWriter {
	enqueueInTx(
		tx: Sql,
		org: string,
		eventSeq: bigint,
		traceparent: string | null,
	): Promise<void>;
}

// --- Event append under the per-org counter (T0 protocol; own transaction) ----
export interface AppendedEvent {
	readonly org: string;
	readonly seq: bigint;
	readonly txid: number;
}

export function serializePayload(payload: unknown): string {
	return JSON.stringify(payload);
}

/**
 * Append one event row + projection writes inside the caller's transaction,
 * advancing the per-org counter under a transaction lock (T0 pattern).
 * Returns the event's (org, seq) so the outbox job can reference it in the
 * same transaction.
 */
export function appendEventInTx(
	tx: Sql,
	org: string,
	actor: string,
	pluginType: string,
	payload: unknown,
): Promise<{ seq: bigint; txidText: string }> {
	return (async () => {
		await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [counter] =
			await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org=${org} RETURNING seq::text AS seq`;
		if (!counter) throw new Error("Event counter unavailable");
		const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
		const seq = BigInt(counter.seq);
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
      VALUES (${org},${seq.toString()},${pluginType},${actor},${tx.json(payload as never)},${EVENT_SCHEMA_VERSION},${transaction.txid})`;
		return { seq, txidText: transaction.txid };
	})();
}

// --- Shared row encoding -------------------------------------------------------
export type CommentStoreRow = {
	id: string;
	org_id: string;
	ticket_id: string;
	type: string;
	created_at: Date | string;
	updated_at: Date | string;
	user_id: string | null;
	content: string | null;
	edit_history: unknown;
	event_data: unknown;
	external_user_name: string | null;
	external_user_avatar: string | null;
	external_source: string | null;
	external_url: string | null;
};

export function encodeActivityRow(
	row: CommentStoreRow,
	user: { id: string; name: string; image: string | null } | null,
): typeof ActivityRow.Type {
	return {
		id: row.id,
		ticketId: row.ticket_id,
		type: row.type,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
		userId: row.user_id,
		content: row.content,
		editHistory: decodeEditHistory(row.edit_history),
		eventData: (row.event_data ?? null) as Record<string, unknown> | null,
		externalUserName: row.external_user_name,
		externalUserAvatar: row.external_user_avatar,
		externalSource: row.external_source,
		externalUrl: row.external_url,
		user,
	};
}

export function decodeEditHistory(value: unknown): EditHistoryEntry[] {
	if (!Array.isArray(value)) return [];
	const entries: EditHistoryEntry[] = [];
	for (const item of value) {
		const decoded = Schema.decodeUnknownOption(EditHistoryEntry)(item);
		if (decoded._tag === "Some") entries.push(decoded.value);
	}
	return entries;
}

// --- New-entity IDs ------------------------------------------------------------
export const newId = (): string => randomUUID();

// --- Sanitized error vocabulary (§3 E; never carries SQL/PII) ------------------
export class DomainConflict extends Error {
	readonly code: "Duplicate" | "StaleWrite" | "InvalidReference";
	constructor(code: "Duplicate" | "StaleWrite" | "InvalidReference") {
		super(code);
		this.code = code;
	}
}
export class DomainNotFound extends Error {
	constructor() {
		super("NotFound");
	}
}
export class DomainForbidden extends Error {
	constructor() {
		super("Forbidden");
	}
}
export class DomainValidation extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}
export type { WorkflowRow };
