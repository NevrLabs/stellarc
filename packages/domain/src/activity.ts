import { Effect } from "effect";
import type { Sql } from "postgres";
import type { ActivityRow } from "../../contracts/src/activity-notifications";
import {
	ACTIVITY_EVENT_TYPES,
	appendEventInTx,
	type CommentStoreRow,
	DomainConflict,
	DomainForbidden,
	DomainNotFound,
	DomainValidation,
	decodeEditHistory,
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

// --- T12/T13: edit and delete (author-only, optimistic, projection-synced) ----

export interface UpdateCommentDeps {
	readonly org: string;
	readonly actor: Actor;
	readonly ticketId: string;
	readonly commentId: string;
	readonly content: string;
	readonly expectedUpdatedAt: Date;
	readonly tickets: TicketScopeResolver;
}

export interface DeleteCommentDeps {
	readonly org: string;
	readonly actor: Actor;
	readonly ticketId: string;
	readonly commentId: string;
	readonly expectedUpdatedAt: Date;
	readonly tickets: TicketScopeResolver;
}

const immutableForLocalAuthor = (row: {
	user_id: string | null;
	external_source: string | null;
}): boolean => row.external_source !== null;

/** Author-only edit with optimistic timestamp check under row lock (§3). */
export const updateComment = (
	sql: Sql,
	deps: UpdateCommentDeps,
): Effect.Effect<{ row: ActivityRow; txid: number }, unknown> =>
	Effect.fn("Domain.activity.updateComment")(function* () {
		assertLiveContent(deps.content);
		const scope = yield* Effect.tryPromise(() =>
			deps.tickets.resolve(deps.org, deps.ticketId, deps.actor),
		);
		if (!scope) throw new DomainNotFound();
		if (!scope.canUpdate || !scope.canView) throw new DomainForbidden();
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (
						tx,
					): Promise<{
						row: ActivityRow;
						txid: number;
					}> => {
						const rows = (await tx`
              SELECT * FROM comment
              WHERE id = ${deps.commentId}
                AND org_id = ${deps.org}
                AND ticket_id = ${deps.ticketId}
              FOR UPDATE`) as unknown as (Record<string, unknown> & {
							user_id: string | null;
							external_source: string | null;
							updated_at: Date;
						})[];
						const stored = rows[0];
						if (!stored) throw new DomainNotFound();
						// Fork author-only edit; external rows are immutable for
						// local authors (§3), even the nominal owner.
						if (
							stored.user_id !== deps.actor.userId ||
							immutableForLocalAuthor(stored)
						)
							throw new DomainForbidden();
						if (
							stored.updated_at.getTime() !== deps.expectedUpdatedAt.getTime()
						)
							throw new DomainConflict("StaleWrite");
						const now = new Date();
						const history = decodeEditHistory(stored.edit_history);
						// editedAt serializes to the contract's ISO string form so
						// encodeActivityRow's decoder accepts it in-memory too.
						history.push({
							content: String(stored.content ?? ""),
							// ISO string form: survives JSON to the DB and the
							// contract decoder (DateFromString) on re-encode.
							editedAt: new Date(
								stored.updated_at,
							).toISOString() as unknown as Date,
							userId: stored.user_id ?? "",
						});
						await tx`UPDATE comment
              SET content = ${deps.content}, updated_at = ${now},
                  edit_history = ${tx.json(history)}
              WHERE id = ${deps.commentId}`;
						await tx`UPDATE activity_projection
              SET content = ${deps.content}, updated_at = ${now},
                  edit_history = ${tx.json(history)}
              WHERE org_id = ${deps.org} AND id = ${deps.commentId}`;
						const edited: CommentStoreRow = {
							...(stored as unknown as CommentStoreRow),
							content: deps.content,
							updated_at: now,
							edit_history: history,
						};
						const { txidText } = await appendEventInTx(
							tx,
							deps.org,
							deps.actor.userId,
							ACTIVITY_EVENT_TYPES.commentUpdated,
							JSON.stringify({
								id: deps.commentId,
								ticketId: deps.ticketId,
								boardId: scope.boardId,
								row: encodeActivityRow(edited, null),
								origin: "live",
							}),
						);
						return {
							row: encodeActivityRow(edited, null),
							txid: safeTxid(txidText),
						};
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();

/** Author-only delete with optimistic check; audit log preserved (§3). */
export const deleteComment = (
	sql: Sql,
	deps: DeleteCommentDeps,
): Effect.Effect<{ data: { id: string }; txid: number }, unknown> =>
	Effect.fn("Domain.activity.deleteComment")(function* () {
		const scope = yield* Effect.tryPromise(() =>
			deps.tickets.resolve(deps.org, deps.ticketId, deps.actor),
		);
		if (!scope) throw new DomainNotFound();
		if (!scope.canUpdate || !scope.canView) throw new DomainForbidden();
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (tx): Promise<{ data: { id: string }; txid: number }> => {
						const rows = (await tx`
              SELECT user_id, external_source, updated_at FROM comment
              WHERE id = ${deps.commentId}
                AND org_id = ${deps.org}
                AND ticket_id = ${deps.ticketId}
              FOR UPDATE`) as unknown as {
							user_id: string | null;
							external_source: string | null;
							updated_at: Date;
						}[];
						const stored = rows[0];
						if (!stored) throw new DomainNotFound();
						if (
							stored.user_id !== deps.actor.userId ||
							immutableForLocalAuthor(stored)
						)
							throw new DomainForbidden();
						if (
							stored.updated_at.getTime() !== deps.expectedUpdatedAt.getTime()
						)
							throw new DomainConflict("StaleWrite");
						await tx`DELETE FROM comment WHERE id = ${deps.commentId}`;
						await tx`DELETE FROM activity_projection
              WHERE org_id = ${deps.org} AND id = ${deps.commentId}`;
						const { txidText } = await appendEventInTx(
							tx,
							deps.org,
							deps.actor.userId,
							ACTIVITY_EVENT_TYPES.commentDeleted,
							JSON.stringify({
								id: deps.commentId,
								ticketId: deps.ticketId,
								boardId: scope.boardId,
								userId: deps.actor.userId,
								origin: "live",
							}),
						);
						return {
							data: { id: deps.commentId },
							txid: safeTxid(txidText),
						};
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();
