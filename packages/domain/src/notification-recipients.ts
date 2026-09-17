import { Schema } from "effect";
import type { Sql } from "postgres";
import { EVENT_SCHEMA_VERSION } from "./activity-events";

/**
 * Recipient semantics (§2): assignment→new assignee only, excluding actor;
 * comment→eligible assignee + historical participants + mentions + provider
 * followers, deduped, actor excluded; mention supersedes ordinary comment.
 * Candidates resolve at event time in the producing transaction; membership
 * and resource access are rechecked at delivery by the worker (§2).
 */
export const RecipientKinds = [
	"assignee",
	"participant",
	"mention",
	"direct",
	"follower",
] as const;
export type RecipientKind = (typeof RecipientKinds)[number];

export interface ResolvedRecipients {
	/** userId → kinds contributing that recipient. */
	readonly byUser: Map<string, Set<RecipientKind>>;
}

export function mergeRecipients(
	actorUserId: string,
	contributions: Array<{ userId: string | null; kind: RecipientKind }>,
): ResolvedRecipients {
	const byUser = new Map<string, Set<RecipientKind>>();
	for (const { userId, kind } of contributions) {
		if (!userId || userId === actorUserId) continue;
		const kinds = byUser.get(userId) ?? new Set<RecipientKind>();
		kinds.add(kind);
		byUser.set(userId, kinds);
	}
	return { byUser };
}

export function assigneeContribution(assigneeUserId: string | null): {
	userId: string | null;
	kind: RecipientKind;
} {
	return { userId: assigneeUserId, kind: "assignee" };
}

/** Assignment semantics: ONLY the new assignee (never participants). */
export function assignmentRecipients(
	actorUserId: string,
	newAssigneeId: string | null | undefined,
): string[] {
	return newAssigneeId && newAssigneeId !== actorUserId ? [newAssigneeId] : [];
}

/**
 * Mention precedence: a mentioned user receives the mention notification,
 * never the ordinary comment one (§2). Returns the notification type per
 * recipient, mirroring the fork's task_mention / task_comment split.
 */
export function notificationTypeFor(
	kinds: Set<RecipientKind>,
): "task_mention" | "task_comment" {
	return kinds.has("mention") ? "task_mention" : "task_comment";
}

// --- Worker-side payload validation (fail closed on unknown versions) ----------
export const OutboxEventRow = Schema.Struct({
	org: Schema.String,
	seq: Schema.BigIntFromSelf,
	plugin_type: Schema.String,
	payload: Schema.String,
	schema_version: Schema.Number,
});
export const CommentCreatedEnvelope = Schema.Struct({
	id: Schema.String,
	ticketId: Schema.String,
	boardId: Schema.String,
	row: Schema.Unknown,
	origin: Schema.Literal("live", "import"),
	mentionUserIds: Schema.Array(Schema.String),
	recipientUserIds: Schema.Array(Schema.String),
});
export type CommentCreatedEnvelope = typeof CommentCreatedEnvelope.Type;

export function decodeCommentCreated(
	pluginType: string,
	schemaVersion: number,
	payload: string,
): CommentCreatedEnvelope | null {
	if (schemaVersion !== EVENT_SCHEMA_VERSION) return null;
	if (pluginType !== "activity:comment-created") return null;
	try {
		const decoded = Schema.decodeUnknownSync(CommentCreatedEnvelope)(
			JSON.parse(payload),
		);
		return decoded;
	} catch {
		return null;
	}
}

/** Canonical delivery identity (§2): (source org, source seq, recipient,
 * channel='inbox'). Unique on notification.delivery_key; replays no-op. */
export function deliveryKey(
	org: string,
	seq: bigint,
	userId: string,
	channel = "inbox",
): string {
	return `${channel}:${org}:${seq.toString()}:${userId}`;
}

/**
 * Delivery-time membership/resource recheck (§2): revoked users receive no
 * content. Default implementation reads organization_member directly; the
 * STL-15 grant seam may tighten this later.
 */
export function membershipChecker(sql: Sql) {
	return async (org: string, userIds: string[]): Promise<Set<string>> => {
		if (userIds.length === 0) return new Set();
		const rows = await sql`
      SELECT user_id FROM organization_member
      WHERE organization_id = ${org} AND user_id IN ${sql(userIds)}`;
		return new Set(rows.map((r) => r.user_id as string));
	};
}
