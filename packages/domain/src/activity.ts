import { Effect } from "effect";
import type { Sql } from "postgres";
import type { ActivityRow } from "../../contracts/src/activity-notifications";
import {
	ACTIVITY_EVENT_TYPES,
	appendEventInTx,
	DomainForbidden,
	DomainNotFound,
	DomainValidation,
	type EventOrigin,
	encodeActivityRow,
	newId,
	type OutboxWriter,
} from "./activity-events";

/** Actor identity: an authenticated principal resolves to its underlying user
 * (§2: compare by user identity, not agent principal ID). */
export interface Actor {
	readonly principalId: string;
	readonly userId: string;
}

/** STL-16 seam: ticket + board scope validated at event time (spec §1/§2).
 * Production binding lands with the ticket merge; tests use isolated fixtures. */
export interface TicketScope {
	readonly ticketId: string;
	readonly boardId: string;
	readonly assigneeUserId: string | null;
	/** Can this actor mutate the ticket (comment create requires update)? */
	readonly canUpdate: boolean;
	/** Can this actor view the ticket (read paths)? */
	readonly canView: boolean;
}

export interface TicketScopeResolver {
	resolve(
		org: string,
		ticketId: string,
		actor: Actor,
	): Promise<TicketScope | null>;
}

export interface CreateCommentDeps {
	readonly org: string;
	readonly actor: Actor;
	readonly ticketId: string;
	readonly content: string;
	readonly origin?: EventOrigin;
	readonly outbox: OutboxWriter;
	readonly tickets: TicketScopeResolver;
	/** Mention ids parsed server-side from the content (never caller-supplied). */
	readonly parseMentions: (content: string) => string[];
	/** Recipient resolution inside the producing transaction (§2). */
	readonly resolveRecipients: (args: {
		tx: Sql;
		scope: TicketScope;
		actor: Actor;
		mentions: string[];
	}) => Promise<string[]>;
}

export interface CreateCommentResult {
	readonly row: ActivityRow;
	readonly txid: number;
}

const CONTENT_MAX_BYTES = 1024 * 1024;

function assertLiveContent(content: string): void {
	if (content.trim().length === 0) throw new DomainValidation("blank comment");
	if (Buffer.byteLength(content, "utf8") > CONTENT_MAX_BYTES)
		throw new DomainValidation("content too large");
}

export function safeTxid(txidText: string): number {
	const id = BigInt(txidText);
	if (id <= 0n || id > BigInt(Number.MAX_SAFE_INTEGER))
		throw new Error("Unsupported transaction ID");
	return Number(id);
}

/**
 * T02/T03: comment + projection + event + outbox job commit atomically; an
 * append/enqueue failure rolls the whole mutation back. The enqueue happens
 * strictly inside the same sql.begin transaction (sabotage-tested).
 */
export const createComment = (
	sql: Sql,
	deps: CreateCommentDeps,
): Effect.Effect<CreateCommentResult, unknown> =>
	Effect.fn("Domain.activity.createComment")(function* () {
		if (deps.origin === "import")
			throw new DomainValidation("import origin cannot create live comments");
		assertLiveContent(deps.content);
		const scope = yield* Effect.tryPromise(() =>
			deps.tickets.resolve(deps.org, deps.ticketId, deps.actor),
		);
		if (!scope) throw new DomainNotFound();
		if (!scope.canUpdate || !scope.canView) throw new DomainForbidden();
		const { id, txid } = yield* Effect.tryPromise({
			try: () =>
				sql.begin(async (tx): Promise<{ id: string; txid: number }> => {
					const id = newId();
					const now = new Date();
					const mentions = [
						...new Set(deps.parseMentions(deps.content)),
					].filter((m) => m !== deps.actor.userId);
					const recipients = (
						await deps.resolveRecipients({
							tx,
							scope,
							actor: deps.actor,
							mentions,
						})
					)
						// mention supersedes ordinary comment for the same recipient (§2)
						.filter((r) => !mentions.includes(r));
					const { seq, txidText } = await appendEventInTx(
						tx,
						deps.org,
						deps.actor.userId,
						ACTIVITY_EVENT_TYPES.commentCreated,
						JSON.stringify({
							id,
							ticketId: deps.ticketId,
							boardId: scope.boardId,
							row: encodeActivityRow(
								{
									id,
									org_id: deps.org,
									ticket_id: deps.ticketId,
									type: "comment",
									created_at: now,
									updated_at: now,
									user_id: deps.actor.userId,
									content: deps.content,
									edit_history: [],
									event_data: null,
									external_user_name: null,
									external_user_avatar: null,
									external_source: null,
									external_url: null,
								},
								null,
							),
							origin: "live",
							mentionUserIds: mentions,
							recipientUserIds: recipients,
						}),
					);
					await tx`INSERT INTO comment (id,org_id,ticket_id,type,created_at,updated_at,user_id,content,edit_history)
            VALUES (${id},${deps.org},${deps.ticketId},'comment',${now},${now},${deps.actor.userId},${deps.content},${tx.json([])})`;
					await tx`INSERT INTO activity_projection (org_id,id,ticket_id,type,created_at,updated_at,user_id,content,edit_history,last_seq)
            VALUES (${deps.org},${id},${deps.ticketId},'comment',${now},${now},${deps.actor.userId},${deps.content},${tx.json([])},${seq.toString()})`;
					// The job references (org, seq) inside the same transaction —
					// moving this after commit or omitting it is the T02/T03 sabotage.
					await deps.outbox.enqueueInTx(tx, deps.org, seq, null);
					return { id, txid: safeTxid(txidText) };
				}),
			catch: (cause) => cause,
		});
		const row = yield* Effect.tryPromise(() =>
			readActivityRow(sql, deps.org, id),
		);
		if (!row) throw new DomainNotFound();
		return { row, txid };
	})();

/** Hydrate the public ActivityRow (joins public identity data; §3). */
export async function readActivityRow(
	sql: Sql,
	org: string,
	id: string,
): Promise<ActivityRow | null> {
	const rows = await sql`
    SELECT p.id, p.org_id, p.ticket_id, p.type, p.created_at, p.updated_at,
           p.user_id, p.content, p.edit_history, p.event_data,
           p.external_user_name, p.external_user_avatar,
           p.external_source, p.external_url,
           u.name AS user_name, u.image AS user_image
    FROM activity_projection p
    LEFT JOIN "user" u ON u.id = p.user_id
    WHERE p.org_id = ${org} AND p.id = ${id}
    LIMIT 1`;
	const row = rows[0] as
		| (Record<string, unknown> & {
				user_id: string | null;
				user_name: string | null;
				user_image: string | null;
		  })
		| undefined;
	if (!row) return null;
	return encodeActivityRow(row as never, {
		id: row.user_id ?? "",
		name: row.user_name ?? "",
		image: row.user_image ?? null,
	});
}
