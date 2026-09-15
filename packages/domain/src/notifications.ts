import { Effect } from "effect";
import type { Sql } from "postgres";
import { safeTxid } from "./activity";
import { appendEventInTx, DomainNotFound } from "./activity-events";

/**
 * Private inbox mutations (§3): self-user access only (the caller's resolved
 * user id is a parameter here — the HTTP layer may never accept it from the
 * body). Bulk updates return the real count + changed flag; no-op bulks still
 * return the actual transaction txid (§3). notification:updated / deleted
 * events fan into the private live collection (§4).
 */
export interface NotificationRowDb {
	id: string;
	org_id: string | null;
	user_id: string;
	title: string | null;
	content: string | null;
	type: string;
	event_data: unknown;
	is_read: boolean | null;
	resource_id: string | null;
	resource_type: string | null;
	created_at: Date | string;
	updated_at: Date | string;
	source_org: string | null;
	source_seq: string | null;
	delivery_key: string | null;
}

export interface NotificationPublic {
	id: string;
	orgId: string | null;
	userId: string;
	title: string | null;
	content: string | null;
	type: string;
	eventData: unknown;
	isRead: boolean | null;
	resourceId: string | null;
	resourceType: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export function toNotificationPublic(
	row: NotificationRowDb,
): NotificationPublic {
	return {
		id: row.id,
		orgId: row.org_id,
		userId: row.user_id,
		title: row.title,
		content: row.content,
		type: row.type,
		eventData:
			row.event_data && typeof row.event_data === "object"
				? row.event_data
				: null,
		isRead: row.is_read,
		resourceId: row.resource_id,
		resourceType: row.resource_type,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

/** List page (T16: full unread count comes from unreadCount, not the page). */
export async function listNotifications(
	sql: Sql,
	userId: string,
	query: { cursor?: string | null; limit?: number; orgId?: string | null },
): Promise<{ items: NotificationPublic[]; nextCursor: string | null }> {
	const limit = query.limit ?? 100;
	const orgFilter = query.orgId
		? sql` AND (n.org_id = ${query.orgId} OR n.org_id IS NULL)`
		: sql``;
	const cursorFilter = query.cursor
		? sql` AND (n.created_at, n.id) < (${new Date(query.cursor)}, ${query.cursor.split(":", 2)[1] ?? ""})`
		: sql``;
	const rows = await sql<NotificationRowDb[]>`
    SELECT n.* FROM notification n
    WHERE n.user_id = ${userId}${orgFilter}${cursorFilter}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ${limit + 1}`;
	const page = rows.slice(0, limit);
	const items = page.map(toNotificationPublic);
	let nextCursor: string | null = null;
	if (rows.length > limit && items.length > 0) {
		const last = items[items.length - 1];
		nextCursor = `${last.createdAt.toISOString()}:${last.id}`;
	}
	return { items, nextCursor };
}

export async function unreadCount(
	sql: Sql,
	userId: string,
	orgId?: string | null,
): Promise<number> {
	const rows = orgId
		? await sql`
      SELECT count(*)::int AS n FROM notification
      WHERE user_id = ${userId} AND is_read = false
        AND (org_id = ${orgId} OR org_id IS NULL)`
		: await sql`
      SELECT count(*)::int AS n FROM notification
      WHERE user_id = ${userId} AND is_read = false`;
	return (rows[0] as { n: number }).n;
}

export interface Mutated<T> {
	data: T;
	txid: number;
	changed?: boolean;
}

/** Mark one notification read; owner-scoped (T15: another user's id → 404). */
export const markNotificationRead = (
	sql: Sql,
	userId: string,
	id: string,
): Effect.Effect<Mutated<NotificationPublic>, unknown> =>
	Effect.fn("Domain.notification.markRead")(function* () {
		const txid = yield* Effect.tryPromise({
			try: () =>
				sql.begin(async (tx): Promise<Mutated<NotificationPublic>> => {
					const rows = await tx<NotificationRowDb[]>`
          SELECT * FROM notification
          WHERE id = ${id} AND user_id = ${userId}
          FOR UPDATE`;
					const row = rows[0];
					if (!row) throw new DomainNotFound();
					await tx`UPDATE notification SET is_read = true, updated_at = now() WHERE id = ${id}`;
					await appendEventInTx(
						tx,
						row.org_id ?? row.user_id,
						userId,
						"notification:updated",
						JSON.stringify({
							id,
							userId,
							orgId: row.org_id,
							row: { isRead: true },
							origin: "live",
						}),
					);
					const [t] = await tx<{ txid: string }[]>`
          SELECT pg_current_xact_id()::text AS txid`;
					return {
						data: toNotificationPublic({ ...row, is_read: true }),
						txid: safeTxid(t.txid),
					};
				}),
			catch: (cause) => cause,
		});
		return txid;
	})();

export const markAllNotificationsRead = (
	sql: Sql,
	userId: string,
	orgId?: string | null,
): Effect.Effect<Mutated<{ count: number; changed: boolean }>, unknown> =>
	Effect.fn("Domain.notification.markAllRead")(function* () {
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (tx): Promise<Mutated<{ count: number; changed: boolean }>> => {
						const scope = orgId
							? tx` AND (org_id = ${orgId} OR org_id IS NULL)`
							: sql``;
						const rows = await tx<{ id: string; org_id: string | null }[]>`
            SELECT id, org_id FROM notification
            WHERE user_id = ${userId} AND is_read = false${scope}
            FOR UPDATE`;
						if (rows.length > 0) {
							await tx`UPDATE notification SET is_read = true, updated_at = now()
              WHERE user_id = ${userId} AND is_read = false${scope}`;
							for (const row of rows) {
								await appendEventInTx(
									tx,
									row.org_id ?? userId,
									userId,
									"notification:updated",
									JSON.stringify({
										id: row.id,
										userId,
										orgId: row.org_id,
										row: { isRead: true },
										origin: "live",
									}),
								);
							}
						}
						const [t] = await tx<{ txid: string }[]>`
            SELECT pg_current_xact_id()::text AS txid`;
						return {
							data: { count: rows.length, changed: rows.length > 0 },
							txid: safeTxid(t.txid),
							changed: rows.length > 0,
						};
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();

export const clearAllNotifications = (
	sql: Sql,
	userId: string,
	orgId?: string | null,
): Effect.Effect<Mutated<{ count: number; changed: boolean }>, unknown> =>
	Effect.fn("Domain.notification.clearAll")(function* () {
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (tx): Promise<Mutated<{ count: number; changed: boolean }>> => {
						const scope = orgId
							? tx` AND (org_id = ${orgId} OR org_id IS NULL)`
							: sql``;
						const rows = await tx<{ id: string; org_id: string | null }[]>`
            SELECT id, org_id FROM notification
            WHERE user_id = ${userId}${scope}
            FOR UPDATE`;
						if (rows.length > 0) {
							await tx`DELETE FROM notification
              WHERE user_id = ${userId}${scope}`;
							for (const row of rows) {
								await appendEventInTx(
									tx,
									row.org_id ?? userId,
									userId,
									"notification:deleted",
									JSON.stringify({ id: row.id, userId, orgId: row.org_id }),
								);
							}
						}
						const [t] = await tx<{ txid: string }[]>`
            SELECT pg_current_xact_id()::text AS txid`;
						return {
							data: { count: rows.length, changed: rows.length > 0 },
							txid: safeTxid(t.txid),
							changed: rows.length > 0,
						};
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();

export const deleteNotification = (
	sql: Sql,
	userId: string,
	id: string,
): Effect.Effect<Mutated<{ id: string }>, unknown> =>
	Effect.fn("Domain.notification.delete")(function* () {
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(async (tx): Promise<Mutated<{ id: string }>> => {
					const rows = await tx<{ org_id: string | null }[]>`
          SELECT org_id FROM notification
          WHERE id = ${id} AND user_id = ${userId}
          FOR UPDATE`;
					const row = rows[0];
					if (!row) throw new DomainNotFound();
					await tx`DELETE FROM notification WHERE id = ${id}`;
					await appendEventInTx(
						tx,
						row.org_id ?? userId,
						userId,
						"notification:deleted",
						JSON.stringify({ id, userId, orgId: row.org_id }),
					);
					const [t] = await tx<{ txid: string }[]>`
          SELECT pg_current_xact_id()::text AS txid`;
					return { data: { id }, txid: safeTxid(t.txid) };
				}),
			catch: (cause) => cause,
		});
		return result;
	})();
