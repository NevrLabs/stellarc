import type { Sql } from "postgres";

/**
 * STL-17 sync shapes (§4): authorized org `activity` + `workflow_rule`
 * collections and self-only `notification`, `notification_preference`,
 * `notification_org_rule` collections over the stock Electric wire protocol.
 * Snapshot and tail share scope predicates; tails ride the committed event
 * log (org counter / private `user:<id>` counter) and carry the REAL txid of
 * the transaction that produced each event — never a producer's response
 * txid (T14). Private scope is bound to the authenticated user, never a
 * caller-supplied id (T15).
 */

type Headers = Record<string, unknown>;

interface WireMessage {
	key?: string;
	value?: Record<string, unknown>;
	headers: Headers;
}

type ColumnType =
	| "text"
	| "int8"
	| "int4"
	| "bool"
	| "jsonb"
	| "timestamp"
	| "timestamptz";

interface ColumnSpec {
	type: ColumnType;
	not_null?: boolean;
	pk_index?: number;
}

const col = (
	type: ColumnType,
	not_null = false,
	pk_index?: number,
): ColumnSpec =>
	pk_index === undefined
		? { type, not_null }
		: { type, not_null: true, pk_index };

const ACTIVITY_SCHEMA: Record<string, ColumnSpec> = {
	id: col("text", true, 0),
	taskId: col("text", true),
	ticketId: col("text", true),
	type: col("text", true),
	createdAt: col("timestamp", true),
	updatedAt: col("timestamp", true),
	userId: col("text"),
	content: col("text"),
	editHistory: col("jsonb", true),
	eventData: col("jsonb"),
	externalUserName: col("text"),
	externalUserAvatar: col("text"),
	externalSource: col("text"),
	externalUrl: col("text"),
	user: col("jsonb"),
};

const WORKFLOW_SCHEMA: Record<string, ColumnSpec> = {
	id: col("text", true, 0),
	orgId: col("text", true),
	boardId: col("text", true),
	integrationType: col("text", true),
	eventType: col("text", true),
	statusId: col("text", true),
	createdAt: col("timestamp", true),
	updatedAt: col("timestamp", true),
};

const NOTIFICATION_SCHEMA: Record<string, ColumnSpec> = {
	id: col("text", true, 0),
	orgId: col("text"),
	userId: col("text", true),
	title: col("text"),
	content: col("text"),
	type: col("text", true),
	eventData: col("jsonb"),
	isRead: col("bool"),
	resourceId: col("text"),
	resourceType: col("text"),
	createdAt: col("timestamptz", true),
	updatedAt: col("timestamptz", true),
};

const PREFERENCE_SCHEMA: Record<string, ColumnSpec> = {
	id: col("text", true, 0),
	userId: col("text", true),
	emailEnabled: col("bool", true),
	ntfyEnabled: col("bool", true),
	ntfyConfigured: col("bool", true),
	ntfyTokenConfigured: col("bool", true),
	gotifyEnabled: col("bool", true),
	gotifyConfigured: col("bool", true),
	gotifyTokenConfigured: col("bool", true),
	webhookEnabled: col("bool", true),
	webhookConfigured: col("bool", true),
	webhookSecretConfigured: col("bool", true),
	taskAssignmentEnabled: col("bool", true),
	taskCommentEnabled: col("bool", true),
	taskStatusChangeEnabled: col("bool", true),
	dueDateReminderEnabled: col("bool", true),
	dueDateReminderLeadTimeMinutes: col("int4", true),
	createdAt: col("timestamp"),
	updatedAt: col("timestamp"),
};

const ORG_RULE_SCHEMA: Record<string, ColumnSpec> = {
	id: col("text", true, 0),
	userId: col("text", true),
	organizationId: col("text", true),
	isActive: col("bool", true),
	emailEnabled: col("bool", true),
	ntfyEnabled: col("bool", true),
	gotifyEnabled: col("bool", true),
	webhookEnabled: col("bool", true),
	boardMode: col("text", true),
	selectedBoardIds: col("jsonb", true),
	createdAt: col("timestamp", true),
	updatedAt: col("timestamp", true),
};

const SCHEMAS: Record<string, Record<string, ColumnSpec>> = {
	activity: ACTIVITY_SCHEMA,
	workflow_rule: WORKFLOW_SCHEMA,
	notification: NOTIFICATION_SCHEMA,
	notification_preference: PREFERENCE_SCHEMA,
	notification_org_rule: ORG_RULE_SCHEMA,
};

const ORG_TABLES = new Set(["activity", "workflow_rule"]);
const PRIVATE_TABLES = new Set([
	"notification",
	"notification_preference",
	"notification_org_rule",
]);

const ACTIVITY_EVENTS = new Set([
	"activity:comment-created",
	"activity:comment-updated",
	"activity:comment-deleted",
	"activity:legacy-recorded",
]);

const json = (value: unknown): unknown => (value === undefined ? null : value);

const iso = (value: unknown): string | null =>
	value === null || value === undefined
		? null
		: new Date(value as never).toISOString();

/** Public activity value (§3): camelCase projection row + taskId adapter. */
function activityValue(row: Record<string, unknown>): Record<string, unknown> {
	const userId = (row.user_id ?? row.userId ?? null) as string | null;
	const name = (row.user_name ?? null) as string | null;
	const image = (row.user_image ?? null) as string | null;
	const id = row.id as string;
	return {
		id,
		ticketId: row.ticket_id ?? row.ticketId,
		taskId: row.ticket_id ?? row.ticketId,
		type: row.type,
		createdAt: iso(row.created_at ?? row.createdAt),
		updatedAt: iso(row.updated_at ?? row.updatedAt),
		userId,
		content: json(row.content),
		editHistory: json(row.edit_history ?? row.editHistory) ?? [],
		eventData: json(row.event_data ?? row.eventData),
		externalUserName: json(row.external_user_name ?? row.externalUserName),
		externalUserAvatar: json(
			row.external_user_avatar ?? row.externalUserAvatar,
		),
		externalSource: json(row.external_source ?? row.externalSource),
		externalUrl: json(row.external_url ?? row.externalUrl),
		user: userId && name !== null ? { id: userId, name, image } : null,
	};
}

function workflowValue(row: Record<string, unknown>): Record<string, unknown> {
	return {
		id: row.id,
		orgId: row.org_id ?? row.orgId,
		boardId: row.board_id ?? row.boardId,
		integrationType: row.integration_type ?? row.integrationType,
		eventType: row.event_type ?? row.eventType,
		statusId: row.status_id ?? row.statusId,
		createdAt: iso(row.created_at ?? row.createdAt),
		updatedAt: iso(row.updated_at ?? row.updatedAt),
	};
}

/** Preference value: safe public booleans only — never secrets or URLs (§3). */
function preferenceValue(
	row: Record<string, unknown>,
): Record<string, unknown> {
	return {
		id: (row.user_id ?? row.userId) as string,
		userId: (row.user_id ?? row.userId) as string,
		emailEnabled: Boolean(row.email_enabled ?? row.emailEnabled),
		ntfyEnabled: Boolean(row.ntfy_enabled ?? row.ntfyEnabled),
		ntfyConfigured: Boolean(row.ntfy_server_url ?? row.ntfyServerUrl),
		ntfyTokenConfigured: Boolean(row.ntfy_token ?? row.ntfyToken),
		gotifyEnabled: Boolean(row.gotify_enabled ?? row.gotifyEnabled),
		gotifyConfigured: Boolean(row.gotify_server_url ?? row.gotifyServerUrl),
		gotifyTokenConfigured: Boolean(row.gotify_token ?? row.gotifyToken),
		webhookEnabled: Boolean(row.webhook_enabled ?? row.webhookEnabled),
		webhookConfigured: Boolean(row.webhook_url ?? row.webhookUrl),
		webhookSecretConfigured: Boolean(row.webhook_secret ?? row.webhookSecret),
		taskAssignmentEnabled: Boolean(
			row.task_assignment_enabled ?? row.taskAssignmentEnabled ?? true,
		),
		taskCommentEnabled: Boolean(
			row.task_comment_enabled ?? row.taskCommentEnabled ?? true,
		),
		taskStatusChangeEnabled: Boolean(
			row.task_status_change_enabled ?? row.taskStatusChangeEnabled ?? true,
		),
		dueDateReminderEnabled: Boolean(
			row.due_date_reminder_enabled ?? row.dueDateReminderEnabled ?? true,
		),
		dueDateReminderLeadTimeMinutes: Number(
			row.due_date_reminder_lead_time_minutes ??
				row.dueDateReminderLeadTimeMinutes ??
				1440,
		),
		createdAt: iso(row.created_at ?? row.createdAt),
		updatedAt: iso(row.updated_at ?? row.updatedAt),
	};
}

function orgRuleValue(
	row: Record<string, unknown>,
	boardIds: string[],
): Record<string, unknown> {
	return {
		id: row.id,
		userId: row.user_id ?? row.userId,
		organizationId: row.organization_id ?? row.organizationId,
		isActive: Boolean(row.is_active ?? row.isActive),
		emailEnabled: Boolean(row.email_enabled ?? row.emailEnabled),
		ntfyEnabled: Boolean(row.ntfy_enabled ?? row.ntfyEnabled),
		gotifyEnabled: Boolean(row.gotify_enabled ?? row.gotifyEnabled),
		webhookEnabled: Boolean(row.webhook_enabled ?? row.webhookEnabled),
		boardMode: row.board_mode ?? row.boardMode,
		selectedBoardIds: boardIds,
		createdAt: iso(row.created_at ?? row.createdAt),
		updatedAt: iso(row.updated_at ?? row.updatedAt),
	};
}

function notificationValue(
	row: Record<string, unknown>,
): Record<string, unknown> {
	return {
		id: row.id,
		orgId: json(row.org_id ?? row.orgId),
		userId: row.user_id ?? row.userId,
		title: json(row.title),
		content: json(row.content),
		type: row.type,
		eventData: json(row.event_data ?? row.eventData),
		isRead: json(row.is_read ?? row.isRead),
		resourceId: json(row.resource_id ?? row.resourceId),
		resourceType: json(row.resource_type ?? row.resourceType),
		createdAt: iso(row.created_at ?? row.createdAt),
		updatedAt: iso(row.updated_at ?? row.updatedAt),
	};
}

interface Snapshot {
	owner: string;
	table: string;
	rows: WireMessage[];
	boundary: string;
	expires: number;
}

const PAGE = 100;
const LIVE_DEADLINE_MS = 20_000;

export class ActivityNotificationShapes {
	private snapshots = new Map<string, Snapshot>();
	/** Opaque cursor tokens per handle, incl. snapshot-less tail handles. */
	private cursors = new Map<string, Map<string, string>>();

	constructor(private readonly sql: Sql) {}

	/** Org-scoped shape: table=activity|workflow_rule (§3). */
	orgShape(org: string, url: URL, signal?: AbortSignal): Promise<Response> {
		return this.serve("org", org, url, signal);
	}

	/** Private self-only shape for /users/me/v1/shape (§2/§3). */
	privateShape(
		user: string,
		url: URL,
		signal?: AbortSignal,
	): Promise<Response> {
		return this.serve("private", user, url, signal);
	}

	private bad(status: number, body?: unknown): Response {
		return Response.json(body ?? {}, {
			status,
			headers: { "cache-control": "no-store" },
		});
	}

	private async serve(
		kind: "org" | "private",
		owner: string,
		url: URL,
		signal?: AbortSignal,
	): Promise<Response> {
		const q = url.searchParams;
		const allowed = new Set([
			"table",
			"offset",
			"handle",
			"ticket",
			"board",
			"live",
			"cursor",
			"cache-buster",
		]);
		for (const key of q.keys()) if (!allowed.has(key)) return this.bad(400);
		const table = q.get("table");
		if (!table || !SCHEMAS[table]) return this.bad(404);
		if (kind === "org" && !ORG_TABLES.has(table)) return this.bad(404);
		if (kind === "private" && !PRIVATE_TABLES.has(table)) return this.bad(404);
		if (table === "activity" && !q.get("ticket")) return this.bad(400);
		const offset = q.get("offset");
		if (
			offset &&
			offset !== "-1" &&
			!/^-?\d+$/.test(offset.split("_")[0] ?? "")
		)
			return this.bad(400);
		const live = q.get("live") === "true";
		const token = () =>
			this.serveOnce(kind, owner, table ?? "", q, signal).then(
				async (response) => {
					if (!live) return response;
					const messages =
						response.status === 200
							? ((await response.clone().json()) as WireMessage[])
							: [];
					const changed =
						response.status !== 200 ||
						messages.some(
							(m) =>
								m.headers.operation ||
								(m.headers.control === "up-to-date") === false,
						) ||
						response.headers.get("electric-offset") !== q.get("offset");
					return changed ? response : null;
				},
			);
		if (!live) return token() as Promise<Response>;
		const deadline = Date.now() + LIVE_DEADLINE_MS;
		let current = await token();
		while (current === null) {
			if (signal?.aborted || Date.now() >= deadline) {
				return this.bad(204);
			}
			await new Promise((r) => setTimeout(r, 100));
			current = await token();
		}
		return current as Response;
	}

	private async serveOnce(
		kind: "org" | "private",
		owner: string,
		table: string,
		q: URLSearchParams,
		_signal?: AbortSignal,
	): Promise<Response> {
		const offset = q.get("offset") ?? "-1";
		let handle = q.get("handle") ?? "";
		if (offset === "-1") {
			const boundary = await this.readBoundary(kind, owner);
			const rows = await this.snapshotRows(kind, owner, table, q);
			handle = crypto.randomUUID();
			this.snapshots.set(handle, {
				owner,
				table,
				rows,
				boundary,
				expires: Date.now() + 300_000,
			});
		}
		const snapshot = this.snapshots.get(handle);
		if (offset !== "-1") {
			if (!handle) return this.bad(400);
			if (snapshot && snapshot.owner !== owner) {
				return Response.json([{ headers: { control: "must-refetch" } }], {
					status: 409,
				});
			}
		}
		const headers = new Headers({
			"content-type": "application/json",
			"cache-control": "no-store",
			"electric-schema": JSON.stringify(SCHEMAS[table]),
			"electric-handle": handle,
		});
		if (offset === "-1" && snapshot) {
			headers.set("x-stellarc-boundary", snapshot.boundary);
		}
		if (offset !== "-1" && snapshot && snapshot.expires < Date.now()) {
			return Response.json([{ headers: { control: "must-refetch" } }], {
				status: 409,
				headers,
			});
		}
		const messages: WireMessage[] = [];
		let next: string;
		let caughtUp = true;
		if (offset === "-1" || offset.startsWith("s:")) {
			const rows = snapshot?.rows ?? [];
			const index = offset === "-1" ? 0 : Number(offset.slice(2));
			for (const row of rows.slice(index, index + PAGE)) messages.push(row);
			next =
				index + PAGE < rows.length
					? `s:${index + PAGE}`
					: `${snapshot?.boundary ?? "0"}_0`;
		} else {
			const cursorSeq = offset.split("_")[0] ?? "0";
			const namespace = kind === "private" ? `user:${owner}` : owner;
			const events = await this.sql`
        SELECT seq::text, txid::text, plugin_type, payload, schema_version
        FROM event WHERE org = ${namespace} AND seq > ${cursorSeq}
        ORDER BY seq LIMIT ${PAGE + 1}`;
			caughtUp = events.length <= PAGE;
			next = offset;
			for (const event of events.slice(0, PAGE) as Array<
				Record<string, unknown>
			>) {
				next = `${event.seq}_0`;
				const message = await this.projectEvent(
					kind,
					owner,
					table,
					event,
					q.get("ticket"),
					q.get("board"),
				);
				if (message) messages.push(message);
			}
		}
		if (!next.startsWith("s:") && caughtUp) {
			messages.push({ headers: { control: "up-to-date" } });
			headers.set("electric-up-to-date", "true");
		}
		let token: string | undefined = [
			...(this.cursors.get(handle)?.entries() ?? []),
		].find(([, value]) => value === next)?.[0];
		if (!token) {
			token = `${BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`)}_0`;
			let map = this.cursors.get(handle);
			if (!map) {
				map = new Map();
				this.cursors.set(handle, map);
			}
			map.set(token, next);
		}
		headers.set("electric-offset", token);
		return Response.json(messages, { headers });
	}

	private async readBoundary(
		kind: "org" | "private",
		owner: string,
	): Promise<string> {
		const namespace = kind === "private" ? `user:${owner}` : owner;
		const [row] = await this.sql`
      SELECT seq::text FROM org_event_counter WHERE org = ${namespace}`;
		return (row?.seq as string) ?? "0";
	}

	/** Snapshot rows under the SAME scope predicates the tail enforces (§4). */
	private async snapshotRows(
		_kind: "org" | "private",
		owner: string,
		table: string,
		q: URLSearchParams,
	): Promise<WireMessage[]> {
		if (table === "activity") {
			const ticket = q.get("ticket") ?? "";
			const rows = await this.sql`
        SELECT p.*, u.name AS user_name, u.image AS user_image
        FROM activity_projection p
        LEFT JOIN "user" u ON u.id = p.user_id
        WHERE p.org_id = ${owner} AND p.ticket_id = ${ticket}
        ORDER BY p.created_at, p.id`;
			return (rows as Array<Record<string, unknown>>).map((row) => ({
				key: JSON.stringify([owner, row.id]),
				value: activityValue(row),
				headers: {
					operation: "insert",
					relation: ["public", "activity"],
				},
			}));
		}
		if (table === "workflow_rule") {
			const board = q.get("board");
			const rows = board
				? await this.sql`
          SELECT * FROM workflow_rule WHERE org_id = ${owner} AND board_id = ${board} ORDER BY id`
				: await this.sql`
          SELECT * FROM workflow_rule WHERE org_id = ${owner} ORDER BY id`;
			return (rows as Array<Record<string, unknown>>).map((row) => ({
				key: JSON.stringify([owner, row.id]),
				value: workflowValue(row),
				headers: {
					operation: "insert",
					relation: ["public", "workflow_rule"],
				},
			}));
		}
		if (table === "notification") {
			const rows = await this.sql`
        SELECT * FROM notification WHERE user_id = ${owner}
        ORDER BY created_at DESC, id DESC`;
			return (rows as Array<Record<string, unknown>>).map((row) => ({
				key: JSON.stringify([owner, row.id]),
				value: notificationValue(row),
				headers: {
					operation: "insert",
					relation: ["public", "notification"],
				},
			}));
		}
		if (table === "notification_preference") {
			const rows = await this.sql`
        SELECT * FROM user_notification_preference WHERE user_id = ${owner} LIMIT 1`;
			return (rows as Array<Record<string, unknown>>).map((row) => ({
				key: JSON.stringify([owner, row.user_id]),
				value: preferenceValue(row),
				headers: {
					operation: "insert",
					relation: ["public", "notification_preference"],
				},
			}));
		}
		const rows = await this.sql`
      SELECT r.*, (
        SELECT COALESCE(json_agg(b.board_id ORDER BY b.board_id), '[]'::json)
        FROM user_notification_org_board b WHERE b.org_rule_id = r.id
      ) AS selected_board_ids
      FROM user_notification_org_rule r
      WHERE r.user_id = ${owner} ORDER BY r.id`;
		return (rows as Array<Record<string, unknown>>).map((row) => ({
			key: JSON.stringify([owner, row.id]),
			value: orgRuleValue(row, (row.selected_board_ids as string[]) ?? []),
			headers: {
				operation: "insert",
				relation: ["public", "notification_org_rule"],
			},
		}));
	}

	/** Event → wire message, or null when the event does not touch `table`. */
	private async projectEvent(
		kind: "org" | "private",
		owner: string,
		table: string,
		event: Record<string, unknown>,
		ticketScope: string | null,
		boardScope: string | null,
	): Promise<WireMessage | null> {
		let payload: Record<string, unknown>;
		try {
			payload =
				typeof event.payload === "string"
					? JSON.parse(event.payload as string)
					: (event.payload as Record<string, unknown>);
		} catch {
			return null;
		}
		const txids = [Number(event.txid)];
		const base = {
			operation: "update",
			txids,
		} satisfies Headers;
		if (kind === "org") {
			if (table === "activity") {
				if (!ACTIVITY_EVENTS.has(event.plugin_type as string)) return null;
				const ticketId = payload.ticketId as string;
				if (ticketScope && ticketId !== ticketScope) return null;
				if (event.plugin_type === "activity:comment-deleted") {
					return {
						key: JSON.stringify([owner, payload.id]),
						value: { id: payload.id },
						headers: { operation: "delete", txids },
					};
				}
				const row = payload.row as Record<string, unknown>;
				const identity = await this.readIdentity(
					(row?.userId as string) ?? null,
				);
				return {
					key: JSON.stringify([owner, payload.id]),
					value: activityValue({ ...row, ...identity }),
					headers: { ...base, relation: ["public", "activity"] },
				};
			}
			if (event.plugin_type === "workflow:rule-upserted") {
				if (boardScope && payload.boardId !== boardScope) return null;
				const row = payload.row as Record<string, unknown>;
				return {
					key: JSON.stringify([owner, payload.id]),
					value: workflowValue(row),
					headers: { ...base, relation: ["public", "workflow_rule"] },
				};
			}
			if (event.plugin_type === "workflow:rule-deleted") {
				if (boardScope && payload.boardId !== boardScope) return null;
				return {
					key: JSON.stringify([owner, payload.id]),
					value: { id: payload.id },
					headers: { operation: "delete", txids },
				};
			}
			return null;
		}
		// Private scope: re-read the row under the owner predicate, never trust
		// the payload's shape (T15: recipient-only events, revocation-safe).
		if (event.plugin_type === "notification:deleted") {
			return {
				key: JSON.stringify([owner, payload.id]),
				value: { id: payload.id },
				headers: { operation: "delete", txids },
			};
		}
		if (event.plugin_type === "notification:organization-rule-deleted") {
			return {
				key: JSON.stringify([owner, payload.id]),
				value: { id: payload.id },
				headers: { operation: "delete", txids },
			};
		}
		if (
			event.plugin_type === "notification:created" ||
			event.plugin_type === "notification:updated"
		) {
			const found = await this.sql`
        SELECT * FROM notification WHERE id = ${payload.id as string} AND user_id = ${owner} LIMIT 1`;
			const row = found[0] as Record<string, unknown> | undefined;
			if (!row) return null;
			return {
				key: JSON.stringify([owner, payload.id]),
				value: notificationValue(row),
				headers: { ...base, relation: ["public", "notification"] },
			};
		}
		if (event.plugin_type === "notification:preferences-updated") {
			const found = await this.sql`
        SELECT * FROM user_notification_preference WHERE user_id = ${owner} LIMIT 1`;
			const row = found[0] as Record<string, unknown> | undefined;
			if (!row) return null;
			return {
				key: JSON.stringify([owner, owner]),
				value: preferenceValue(row),
				headers: { ...base, relation: ["public", "notification_preference"] },
			};
		}
		if (event.plugin_type === "notification:organization-rule-upserted") {
			const found = await this.sql`
        SELECT r.*, (
          SELECT COALESCE(json_agg(b.board_id ORDER BY b.board_id), '[]'::json)
          FROM user_notification_org_board b WHERE b.org_rule_id = ${payload.id as string}
        ) AS selected_board_ids
        FROM user_notification_org_rule r
        WHERE r.id = ${payload.id as string} AND r.user_id = ${owner} LIMIT 1`;
			const row = found[0] as Record<string, unknown> | undefined;
			if (!row) return null;
			return {
				key: JSON.stringify([owner, payload.id]),
				value: orgRuleValue(row, (row.selected_board_ids as string[]) ?? []),
				headers: { ...base, relation: ["public", "notification_org_rule"] },
			};
		}
		return null;
	}

	private async readIdentity(
		userId: string | null,
	): Promise<{ user_name: string | null; user_image: string | null }> {
		if (!userId) return { user_name: null, user_image: null };
		const rows = await this.sql`
      SELECT name, image FROM "user" WHERE id = ${userId} LIMIT 1`;
		const row = rows[0] as
			| { name: string | null; image: string | null }
			| undefined;
		if (!row) return { user_name: null, user_image: null };
		return {
			user_name: row.name as string,
			user_image: (row.image as string) ?? null,
		};
	}
}
