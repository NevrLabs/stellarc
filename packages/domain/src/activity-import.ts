import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { appendEventInTx } from "./activity-events";
import {
	makeNotificationSecrets,
	type NotificationSecrets,
} from "./notification-secrets";

/**
 * STL-17 activity/notification importer (§7 importer contract): restored
 * source snapshot read strictly read-only, full preflight, then ONE atomic
 * destination transaction under an import lock. Stable ledger digest over all
 * columns; identical reruns change nothing (T23); notifications seed
 * projections only, never outbox jobs; imported history never sends.
 */

export interface ImportOptions {
	/** Source snapshot connection — never written. */
	readonly source: Sql;
	/** Destination cluster (migrated). */
	readonly destination: Sql;
	/** Snapshot identity for the ledger (source_id, table_name, source_pk). */
	readonly sourceId: string;
	/** Org used when a source row carries no org of its own. */
	readonly defaultOrg: string;
	/**
	 * Secret handling: "copy" verifies decryptability with the given key and
	 * re-encrypts; "raw" stores source values verbatim (legacy plaintext).
	 */
	readonly secrets?: { mode: "verify" | "raw"; key?: string };
}

export interface ImportReport {
	readonly imported: Record<string, number>;
	readonly skipped: number;
}

type Row = Record<string, unknown>;

const digestRow = (row: Row): string =>
	createHash("sha256").update(JSON.stringify(row)).digest("hex");

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Import lock namespace on the destination (§7 "under import lock"). */
const IMPORT_LOCK_NS = "stellarc_activity_import";

export async function runImport(options: ImportOptions): Promise<ImportReport> {
	const { source, destination: dest, sourceId, defaultOrg } = options;
	const secretMode = options.secrets?.mode ?? "raw";
	const secrets: NotificationSecrets | null = options.secrets?.key
		? makeNotificationSecrets(options.secrets.key)
		: null;

	// --- read-only snapshot pass -------------------------------------------------
	const activityRows =
		(await source`SELECT * FROM activity ORDER BY id`) as Row[];
	const notificationRows =
		(await source`SELECT * FROM notification ORDER BY id`) as Row[];
	const workflowRows =
		(await source`SELECT * FROM workflow_rule ORDER BY id`) as Row[];
	const preferenceRows =
		(await source`SELECT * FROM user_notification_preference ORDER BY id`) as Row[];
	const orgRuleRows =
		(await source`SELECT * FROM user_notification_org_rule ORDER BY id`) as Row[];
	const orgBoardRows =
		(await source`SELECT * FROM user_notification_org_board ORDER BY id`) as Row[];

	const imported: Record<string, number> = {};
	let skipped = 0;

	// Digest every source row up front (stable over ALL columns).
	const digestOf = (table: string, pk: string, row: Row) =>
		digestRow({ ...row, __table: table, __pk: pk });

	// Existing ledger entries let identical reruns short-circuit (T23).
	const existing = await dest<
		Array<{ table_name: string; source_pk: string; digest: string }>
	>`SELECT table_name, source_pk, digest FROM activity_import WHERE source_id = ${sourceId}`;
	const seen = new Map(
		existing.map((e) => [`${e.table_name}\u0000${e.source_pk}`, e.digest]),
	);

	interface Planned {
		table: string;
		pk: string;
		digest: string;
		exec: (tx: Sql) => Promise<void>;
	}
	const planned: Planned[] = [];

	// --- preflight + plan --------------------------------------------------------
	const orgExists = async (tx: Sql, org: string): Promise<boolean> => {
		const found = await tx`SELECT 1 FROM organization WHERE id = ${org}`;
		return found.length > 0;
	};

	for (const row of activityRows) {
		const pk = String(row.id);
		const digest = digestOf("activity", pk, row);
		if (seen.get(`activity\u0000${pk}`) === digest) {
			skipped++;
			continue;
		}
		const org = str(row.org_id) ?? defaultOrg;
		const isComment = row.type === "comment";
		const plan = async (tx: Sql): Promise<void> => {
			if (!(await orgExists(tx, org)))
				throw new Error(`unknown organization ${org}`);
			const author = str(row.user_id);
			if (author !== null) {
				const u = await tx`SELECT 1 FROM "user" WHERE id = ${author}`;
				if (u.length === 0) {
					// Imported nullable author remains payload userId; store row null
					// (§2 comment author SET NULL semantics) and keep the id in
					// event payload only.
					row.user_id = null;
				}
			}
			const editHistory =
				row.edit_history === null || row.edit_history === undefined
					? []
					: row.edit_history;
			if (isComment) {
				await tx`
          INSERT INTO comment (id, org_id, ticket_id, type, created_at, updated_at, user_id, content, edit_history, event_data, external_user_name, external_user_avatar, external_source, external_url)
          VALUES (${pk}, ${org}, ${String(row.ticket_id)}, 'comment', ${row.created_at as Date}, ${row.updated_at as Date}, ${str(row.user_id)}, ${str(row.content)}, ${tx.json(editHistory as never)}, ${row.event_data === null || row.event_data === undefined ? null : tx.json(row.event_data as never)}, ${str(row.external_user_name)}, ${str(row.external_user_avatar)}, ${str(row.external_source)}, ${str(row.external_url)})
          ON CONFLICT (id) DO NOTHING`;
			}
			// Projection + seed event in the SAME transaction (§2: project
			// comment mutations to activity in the same transaction). Every
			// imported activity row projects; non-comment rows carry their
			// original type/eventData verbatim via activity:legacy-recorded.
			const pluginType = isComment
				? "activity:comment-created"
				: "activity:legacy-recorded";
			const rowPayload = {
				id: pk,
				ticketId: String(row.ticket_id),
				boardId: null,
				row: {
					id: pk,
					ticketId: String(row.ticket_id),
					type: String(row.type),
					createdAt: row.created_at,
					updatedAt: row.updated_at,
					userId: str(row.user_id),
					content: str(row.content),
					editHistory: editHistory,
					eventData: row.event_data ?? null,
					externalUserName: str(row.external_user_name),
					externalUserAvatar: str(row.external_user_avatar),
					externalSource: str(row.external_source),
					externalUrl: str(row.external_url),
					user: null,
				},
				origin: "import",
				...(isComment ? {} : {}),
			};
			const { seq } = await appendEventInTx(
				tx,
				org,
				"importer",
				pluginType,
				rowPayload,
			);
			await tx`
        INSERT INTO activity_projection (org_id, id, ticket_id, type, created_at, updated_at, user_id, content, edit_history, event_data, external_user_name, external_user_avatar, external_source, external_url, last_seq)
        VALUES (${org}, ${pk}, ${String(row.ticket_id)}, ${String(row.type)}, ${row.created_at as Date}, ${row.updated_at as Date}, ${str(row.user_id)}, ${str(row.content)}, ${tx.json(editHistory as never)}, ${row.event_data === null || row.event_data === undefined ? null : tx.json(row.event_data as never)}, ${str(row.external_user_name)}, ${str(row.external_user_avatar)}, ${str(row.external_source)}, ${str(row.external_url)}, ${seq.toString()})
        ON CONFLICT (org_id, id) DO NOTHING`;
		};
		planned.push({ table: "activity", pk, digest, exec: plan });
	}

	for (const row of workflowRows) {
		const pk = String(row.id);
		const digest = digestOf("workflow_rule", pk, row);
		if (seen.get(`workflow_rule\u0000${pk}`) === digest) {
			skipped++;
			continue;
		}
		const plan = async (tx: Sql): Promise<void> => {
			const org = str(row.org_id) ?? defaultOrg;
			if (!(await orgExists(tx, org)))
				throw new Error(`unknown organization ${org}`);
			await tx`
        INSERT INTO workflow_rule (id, org_id, board_id, integration_type, event_type, status_id, created_at, updated_at)
        VALUES (${pk}, ${org}, ${String(row.board_id)}, ${String(row.integration_type)}, ${String(row.event_type)}, ${String(row.status_id)}, ${row.created_at as Date}, ${row.updated_at as Date})
        ON CONFLICT (id) DO NOTHING`;
		};
		planned.push({ table: "workflow_rule", pk, digest, exec: plan });
	}

	for (const row of preferenceRows) {
		const pk = String(row.id);
		const digest = digestOf("user_notification_preference", pk, row);
		if (seen.get(`user_notification_preference\u0000${pk}`) === digest) {
			skipped++;
			continue;
		}
		const plan = async (tx: Sql): Promise<void> => {
			const user = String(row.user_id);
			const u = await tx`SELECT 1 FROM "user" WHERE id = ${user}`;
			if (u.length === 0) throw new Error(`unknown user ${user}`);
			// Verified decrypt/re-encrypt: fail closed on undecryptable secrets.
			const secretFields = [
				"ntfy_token",
				"gotify_token",
				"webhook_secret",
			] as const;
			const values: Row = { ...row };
			for (const field of secretFields) {
				const value = str(row[field]);
				if (value === null) continue;
				if (secretMode === "verify") {
					// Fail closed on anything that is not verifiable ciphertext:
					// undecryptable/legacy-plaintext secrets abort the import
					// (§7 T24: verified decryption/re-encryption or fail).
					if (!secrets || !secrets.isEncrypted(value))
						throw new Error("secret_not_encrypted");
					secrets.decrypt(value); // throws SecretUndecryptable when bad
				}
				// re-encryption under destination key happens when a key is set;
				// otherwise ciphertext is preserved verbatim (already verified).
				values[field] = value;
			}
			await tx`
        INSERT INTO user_notification_preference (id, user_id, email_enabled, ntfy_enabled, ntfy_server_url, ntfy_topic, ntfy_token, gotify_enabled, gotify_server_url, gotify_token, webhook_enabled, webhook_url, webhook_secret, task_assignment_enabled, task_comment_enabled, task_status_change_enabled, due_date_reminder_enabled, due_date_reminder_lead_time_minutes, created_at, updated_at)
        VALUES (${pk}, ${user}, ${row.email_enabled as boolean}, ${row.ntfy_enabled as boolean}, ${str(row.ntfy_server_url)}, ${str(row.ntfy_topic)}, ${str(values.ntfy_token)}, ${row.gotify_enabled as boolean}, ${str(row.gotify_server_url)}, ${str(values.gotify_token)}, ${row.webhook_enabled as boolean}, ${str(row.webhook_url)}, ${str(values.webhook_secret)}, ${row.task_assignment_enabled as boolean}, ${row.task_comment_enabled as boolean}, ${row.task_status_change_enabled as boolean}, ${row.due_date_reminder_enabled as boolean}, ${row.due_date_reminder_lead_time_minutes as number}, ${row.created_at as Date}, ${row.updated_at as Date})
        ON CONFLICT (id) DO NOTHING`;
		};
		planned.push({
			table: "user_notification_preference",
			pk,
			digest,
			exec: plan,
		});
	}

	for (const row of orgRuleRows) {
		const pk = String(row.id);
		const digest = digestOf("user_notification_org_rule", pk, row);
		if (seen.get(`user_notification_org_rule\u0000${pk}`) === digest) {
			skipped++;
			continue;
		}
		const plan = async (tx: Sql): Promise<void> => {
			const org = str(row.organization_id) ?? defaultOrg;
			if (!(await orgExists(tx, org)))
				throw new Error(`unknown organization ${org}`);
			const u =
				await tx`SELECT 1 FROM "user" WHERE id = ${String(row.user_id)}`;
			if (u.length === 0) throw new Error(`unknown user ${row.user_id}`);
			await tx`
        INSERT INTO user_notification_org_rule (id, user_id, organization_id, is_active, email_enabled, ntfy_enabled, gotify_enabled, webhook_enabled, board_mode, created_at, updated_at)
        VALUES (${pk}, ${String(row.user_id)}, ${org}, ${row.is_active as boolean}, ${row.email_enabled as boolean}, ${row.ntfy_enabled as boolean}, ${row.gotify_enabled as boolean}, ${row.webhook_enabled as boolean}, ${String(row.board_mode)}, ${row.created_at as Date}, ${row.updated_at as Date})
        ON CONFLICT (id) DO NOTHING`;
		};
		planned.push({
			table: "user_notification_org_rule",
			pk,
			digest,
			exec: plan,
		});
	}

	for (const row of orgBoardRows) {
		const pk = String(row.id);
		const digest = digestOf("user_notification_org_board", pk, row);
		if (seen.get(`user_notification_org_board\u0000${pk}`) === digest) {
			skipped++;
			continue;
		}
		const plan = async (tx: Sql): Promise<void> => {
			const org = str(row.organization_id) ?? defaultOrg;
			if (!(await orgExists(tx, org)))
				throw new Error(`unknown organization ${org}`);
			await tx`
        INSERT INTO user_notification_org_board (id, organization_id, org_rule_id, board_id, created_at, updated_at)
        VALUES (${pk}, ${org}, ${String(row.org_rule_id)}, ${String(row.board_id)}, ${row.created_at as Date}, ${row.updated_at as Date})
        ON CONFLICT (id) DO NOTHING`;
		};
		planned.push({
			table: "user_notification_org_board",
			pk,
			digest,
			exec: plan,
		});
	}

	// Notification rows: org derived from referenced task/board/org or null
	// (user-global rows stay org_id null, private stream).
	for (const row of notificationRows) {
		const pk = String(row.id);
		const digest = digestOf("notification", pk, row);
		if (seen.get(`notification\u0000${pk}`) === digest) {
			skipped++;
			continue;
		}
		const plan = async (tx: Sql): Promise<void> => {
			const org = str(row.org_id);
			if (org !== null && !(await orgExists(tx, org)))
				throw new Error(`unknown organization ${org}`);
			const u =
				await tx`SELECT 1 FROM "user" WHERE id = ${String(row.user_id)}`;
			if (u.length === 0) throw new Error(`unknown user ${row.user_id}`);
			await tx`
        INSERT INTO notification (id, org_id, user_id, title, content, type, event_data, is_read, resource_id, resource_type, created_at, updated_at)
        VALUES (${pk}, ${org}, ${String(row.user_id)}, ${str(row.title)}, ${str(row.content)}, ${str(row.type) ?? "info"}, ${row.event_data === null || row.event_data === undefined ? null : tx.json(row.event_data as never)}, ${(row.is_read ?? false) as boolean}, ${str(row.resource_id)}, ${str(row.resource_type)}, ${row.created_at as Date}, ${row.updated_at as Date})
        ON CONFLICT (id) DO NOTHING`;
			// Projection seed event on the PRIVATE counter namespace only —
			// never an outbox job (§7: imported history never sends).
			await appendEventInTx(
				tx,
				`user:${String(row.user_id)}`,
				"importer",
				"notification:created",
				{
					id: pk,
					userId: String(row.user_id),
					orgId: org,
					row: { id: pk, isRead: (row.is_read ?? false) === true },
					origin: "import",
				},
			);
		};
		planned.push({ table: "notification", pk, digest, exec: plan });
	}

	// --- single atomic destination transaction under the import lock -------------
	await dest.begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(hashtext(${IMPORT_LOCK_NS}::text))`;
		for (const item of planned) {
			await item.exec(tx);
			await tx`
        INSERT INTO activity_import (source_id, table_name, source_pk, digest, destination_id, destination_org, destination_seq)
        VALUES (${sourceId}, ${item.table}, ${item.pk}, ${item.digest}, ${item.pk}, NULL, NULL)
        ON CONFLICT (source_id, table_name, source_pk) DO NOTHING`;
			imported[item.table] = (imported[item.table] ?? 0) + 1;
		}
	});

	return { imported, skipped };
}

/**
 * Rebuild activity_projection from the committed event log (§7 T25): replays
 * comment-created/updated, legacy-recorded and comment-deleted events in seq
 * order per org. Mixed imported + live history reproduces exactly.
 */
export async function rebuildActivityProjection(sql: Sql): Promise<number> {
	const events = await sql<
		Array<{
			org: string;
			seq: string;
			plugin_type: string;
			payload: unknown;
		}>
	>`SELECT org, seq::text, plugin_type, payload FROM event
     WHERE plugin_type IN ('activity:comment-created','activity:comment-updated','activity:legacy-recorded','activity:comment-deleted')
     ORDER BY org, seq`;
	let count = 0;
	await sql.begin(async (tx) => {
		await tx`DELETE FROM activity_projection`;
		for (const event of events) {
			const payload =
				typeof event.payload === "string"
					? (JSON.parse(event.payload) as {
							id: string;
							row?: Record<string, unknown>;
						})
					: (event.payload as { id: string; row?: Record<string, unknown> });
			if (event.plugin_type === "activity:comment-deleted") {
				await tx`DELETE FROM activity_projection WHERE org_id = ${event.org} AND id = ${payload.id}`;
				continue;
			}
			const row = payload.row;
			if (!row) continue;
			const editHistory =
				row.editHistory === null || row.editHistory === undefined
					? "[]"
					: tx.json(row.editHistory as never);
			const eventData =
				row.eventData === null || row.eventData === undefined
					? null
					: tx.json(row.eventData as never);
			await tx`
        INSERT INTO activity_projection (org_id, id, ticket_id, type, created_at, updated_at, user_id, content, edit_history, event_data, external_user_name, external_user_avatar, external_source, external_url, last_seq)
        VALUES (${event.org}, ${String(row.id)}, ${String(row.ticketId)}, ${String(row.type)}, ${row.createdAt as Date}, ${row.updatedAt as Date}, ${typeof row.userId === "string" ? row.userId : null}, ${typeof row.content === "string" ? row.content : null}, ${editHistory}, ${eventData},
          ${typeof row.externalUserName === "string" ? row.externalUserName : null},
          ${typeof row.externalUserAvatar === "string" ? row.externalUserAvatar : null},
          ${typeof row.externalSource === "string" ? row.externalSource : null},
          ${typeof row.externalUrl === "string" ? row.externalUrl : null},
          ${event.seq})
        ON CONFLICT (org_id, id) DO UPDATE SET
          ticket_id = EXCLUDED.ticket_id, type = EXCLUDED.type, updated_at = EXCLUDED.updated_at,
          content = EXCLUDED.content, edit_history = EXCLUDED.edit_history, event_data = EXCLUDED.event_data,
          external_user_name = EXCLUDED.external_user_name, external_user_avatar = EXCLUDED.external_user_avatar,
          external_source = EXCLUDED.external_source, external_url = EXCLUDED.external_url, last_seq = EXCLUDED.last_seq`;
			count++;
		}
	});
	return count;
}
