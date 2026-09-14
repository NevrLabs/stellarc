import type { Sql } from "postgres";

// T01 expectations: exact §2 catalog for every store this slice owns.
// [column, data_type, nullable]
export type ExpectedColumn = [string, string, "YES" | "NO"];

const T = "timestamp without time zone";
const TZ = "timestamp with time zone";

export const EXPECTED_CATALOG: Record<string, ExpectedColumn[]> = {
	comment: [
		["id", "text", "NO"],
		["org_id", "text", "NO"],
		["ticket_id", "text", "NO"],
		["type", "text", "NO"],
		["created_at", T, "NO"],
		["updated_at", T, "NO"],
		["user_id", "text", "YES"],
		["content", "text", "YES"],
		["edit_history", "jsonb", "NO"],
		["event_data", "jsonb", "YES"],
		["external_user_name", "text", "YES"],
		["external_user_avatar", "text", "YES"],
		["external_source", "text", "YES"],
		["external_url", "text", "YES"],
	],
	activity_projection: [
		["org_id", "text", "NO"],
		["id", "text", "NO"],
		["ticket_id", "text", "NO"],
		["type", "text", "NO"],
		["created_at", T, "NO"],
		["updated_at", T, "NO"],
		["user_id", "text", "YES"],
		["content", "text", "YES"],
		["edit_history", "jsonb", "NO"],
		["event_data", "jsonb", "YES"],
		["external_user_name", "text", "YES"],
		["external_user_avatar", "text", "YES"],
		["external_source", "text", "YES"],
		["external_url", "text", "YES"],
		["last_seq", "bigint", "NO"],
	],
	notification: [
		["id", "text", "NO"],
		["org_id", "text", "YES"],
		["user_id", "text", "NO"],
		["title", "text", "YES"],
		["content", "text", "YES"],
		["type", "text", "NO"],
		["event_data", "jsonb", "YES"],
		["is_read", "boolean", "YES"],
		["resource_id", "text", "YES"],
		["resource_type", "text", "YES"],
		["created_at", TZ, "NO"],
		["updated_at", TZ, "NO"],
		["source_org", "text", "YES"],
		["source_seq", "bigint", "YES"],
		["delivery_key", "text", "YES"],
	],
	workflow_rule: [
		["id", "text", "NO"],
		["org_id", "text", "NO"],
		["board_id", "text", "NO"],
		["integration_type", "text", "NO"],
		["event_type", "text", "NO"],
		["status_id", "text", "NO"],
		["created_at", T, "NO"],
		["updated_at", T, "NO"],
	],
	user_notification_preference: [
		["id", "text", "NO"],
		["user_id", "text", "NO"],
		["email_enabled", "boolean", "NO"],
		["ntfy_enabled", "boolean", "NO"],
		["ntfy_server_url", "text", "YES"],
		["ntfy_topic", "text", "YES"],
		["ntfy_token", "text", "YES"],
		["gotify_enabled", "boolean", "NO"],
		["gotify_server_url", "text", "YES"],
		["gotify_token", "text", "YES"],
		["webhook_enabled", "boolean", "NO"],
		["webhook_url", "text", "YES"],
		["webhook_secret", "text", "YES"],
		["task_assignment_enabled", "boolean", "NO"],
		["task_comment_enabled", "boolean", "NO"],
		["task_status_change_enabled", "boolean", "NO"],
		["due_date_reminder_enabled", "boolean", "NO"],
		["due_date_reminder_lead_time_minutes", "integer", "NO"],
		["created_at", T, "NO"],
		["updated_at", T, "NO"],
	],
	user_notification_org_rule: [
		["id", "text", "NO"],
		["user_id", "text", "NO"],
		["organization_id", "text", "NO"],
		["is_active", "boolean", "NO"],
		["email_enabled", "boolean", "NO"],
		["ntfy_enabled", "boolean", "NO"],
		["gotify_enabled", "boolean", "NO"],
		["webhook_enabled", "boolean", "NO"],
		["board_mode", "text", "NO"],
		["created_at", T, "NO"],
		["updated_at", T, "NO"],
	],
	user_notification_org_board: [
		["id", "text", "NO"],
		["organization_id", "text", "NO"],
		["org_rule_id", "text", "NO"],
		["board_id", "text", "NO"],
		["created_at", T, "NO"],
		["updated_at", T, "NO"],
	],
	notification_outbox: [
		["id", "text", "NO"],
		["org_id", "text", "NO"],
		["event_seq", "bigint", "NO"],
		["consumer", "text", "NO"],
		["traceparent", "text", "YES"],
		["tracestate", "text", "YES"],
		["state", "text", "NO"],
		["attempts", "integer", "NO"],
		["available_at", TZ, "NO"],
		["completed_at", TZ, "YES"],
		["last_error_code", "text", "YES"],
		["created_at", TZ, "NO"],
	],
	activity_import: [
		["source_id", "text", "NO"],
		["table_name", "text", "NO"],
		["source_pk", "text", "NO"],
		["digest", "text", "NO"],
		["destination_id", "text", "NO"],
		["destination_org", "text", "YES"],
		["destination_seq", "bigint", "YES"],
	],
};

type ColumnRow = {
	table_name: string;
	column_name: string;
	data_type: string;
	is_nullable: string;
};
type ConstraintRow = { table_name: string; conname: string; contype: string };

export async function assertCatalog(sql: Sql): Promise<void> {
	const tables = Object.keys(EXPECTED_CATALOG);
	const rows = await sql<ColumnRow[]>`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ${sql(tables)}
    ORDER BY table_name, ordinal_position`;
	const byTable = new Map<string, ColumnRow[]>();
	for (const row of rows) {
		const list = byTable.get(row.table_name) ?? [];
		list.push(row);
		byTable.set(row.table_name, list);
	}
	for (const [table, expected] of Object.entries(EXPECTED_CATALOG)) {
		const actual = byTable.get(table) ?? [];
		const actualNames = actual.map((c) => c.column_name);
		const expectedNames = expected.map(([name]) => name);
		if (actualNames.join(",") !== expectedNames.join(",")) {
			throw new Error(
				`T01 catalog mismatch on ${table}: expected [${expectedNames.join(",")}] got [${actualNames.join(",")}]`,
			);
		}
		for (let i = 0; i < expected.length; i++) {
			const [name, dataType, nullable] = expected[i];
			const col = actual[i];
			if (col.data_type !== dataType || col.is_nullable !== nullable) {
				throw new Error(
					`T01 column mismatch on ${table}.${name}: expected ${dataType} nullable=${nullable}, got ${col.data_type} nullable=${col.is_nullable}`,
				);
			}
		}
	}
}

// Named constraints this slice's contracts rely on (unique delivery identity,
// duplicate-mapping preflight, composite selection FK, outbox event FK, checks).
export const EXPECTED_CONSTRAINTS: Array<{
	table: string;
	name: string;
	type: "u" | "c" | "f" | "p";
}> = [
	{ table: "comment", name: "comment_type_check", type: "c" },
	{ table: "comment", name: "comment_external_unique", type: "u" },
	{ table: "comment", name: "comment_org_id_fkey", type: "f" },
	{ table: "comment", name: "comment_user_id_fkey", type: "f" },
	{ table: "activity_projection", name: "activity_projection_pkey", type: "p" },
	{ table: "notification", name: "notification_delivery_key_key", type: "u" },
	{ table: "notification", name: "notification_user_id_fkey", type: "f" },
	{
		table: "workflow_rule",
		name: "workflow_rule_target_unique",
		type: "u",
	},
	{ table: "workflow_rule", name: "workflow_rule_org_id_fkey", type: "f" },
	{
		table: "user_notification_preference",
		name: "user_notification_preference_user_id_key",
		type: "u",
	},
	{
		table: "user_notification_preference",
		name: "unp_lead_time_check",
		type: "c",
	},
	{
		table: "user_notification_org_rule",
		name: "unor_user_org_unique",
		type: "u",
	},
	{
		table: "user_notification_org_rule",
		name: "unor_org_id_unique",
		type: "u",
	},
	{
		table: "user_notification_org_rule",
		name: "user_notification_org_rule_board_mode_check",
		type: "c",
	},
	{ table: "user_notification_org_board", name: "unob_rule_fk", type: "f" },
	{
		table: "user_notification_org_board",
		name: "unob_rule_board_unique",
		type: "u",
	},
	{ table: "notification_outbox", name: "outbox_event_fk", type: "f" },
	{ table: "notification_outbox", name: "outbox_job_unique", type: "u" },
	{
		table: "notification_outbox",
		name: "notification_outbox_state_check",
		type: "c",
	},
	{
		table: "notification_outbox",
		name: "notification_outbox_attempts_check",
		type: "c",
	},
	{ table: "activity_import", name: "activity_import_pkey", type: "p" },
];

export async function assertConstraints(sql: Sql): Promise<void> {
	const tables = [...new Set(EXPECTED_CONSTRAINTS.map((c) => c.table))];
	const rows = await sql<ConstraintRow[]>`
    SELECT cl.relname AS table_name, con.conname, con.contype
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname = 'public' AND cl.relname IN ${sql(tables)}`;
	const have = new Set(
		rows.map((r) => `${r.table_name}:${r.conname}:${r.contype}`),
	);
	for (const expected of EXPECTED_CONSTRAINTS) {
		const key = `${expected.table}:${expected.name}:${expected.type}`;
		if (!have.has(key)) {
			throw new Error(`T01 constraint missing: ${key}`);
		}
	}
}

// Composite FK column pairs must match exactly, not just exist.
export async function assertCompositeSelectionFk(sql: Sql): Promise<void> {
	const rows = await sql<{ column_name: string }[]>`
    SELECT a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE ns.nspname = 'public' AND cl.relname = 'user_notification_org_board'
      AND con.conname = 'unob_rule_fk'
    ORDER BY k.ord`;
	const cols = rows.map((r) => r.column_name);
	if (cols.join(",") !== "organization_id,org_rule_id") {
		throw new Error(
			`T01 composite selection FK columns: expected organization_id,org_rule_id got ${cols.join(",")}`,
		);
	}
}

// Minimal identity seed used by integration fixtures (org + two users).
export async function seedIdentity(
	sql: Sql,
	ids: { org: string; users: [string, string] },
): Promise<void> {
	await sql`
    INSERT INTO organization (id, name, slug, created_at)
    VALUES (${ids.org}, 'Fixture Org', ${`fixture-${ids.org}`}, now())`;
	for (const [i, userId] of ids.users.entries()) {
		await sql`
      INSERT INTO "user" (id, name, email)
      VALUES (${userId}, ${`User ${i}`}, ${`${userId}@fixture.test`})`;
		await sql`
      INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
      VALUES (${`${ids.org}-m${i}`}, ${ids.org}, ${userId}, 'member', now())`;
	}
}
