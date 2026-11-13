import { afterAll, beforeAll, expect, test } from "bun:test";
import { Schema } from "effect";
import type { Sql } from "postgres";
import { runMigration } from "../../packages/db/src/migrate";
import {
	Activity,
	Board,
	Comment,
	Grant,
	Label,
	Milestone,
	Project,
	ProjectBoard,
	STELLARC_DOMAIN_TABLES,
	Status,
	Subscriber,
	Ticket,
	TicketLabel,
	TicketRelation,
} from "../../packages/domain/src/stellarc";
import { disposablePostgres } from "../helpers/postgres";

/**
 * NEVR-430: the Stellarc domain migration (0008) applies on a disposable
 * PostgreSQL from zero, every table is org-scoped and import-keyed, and one
 * row per table round-trips through its Effect Schema class in
 * packages/domain/src/stellarc.ts. The duplicate-ticket test pins the
 * (org_id, key, number) uniqueness the Kaneo import relies on; its negative
 * control (dropping ticket_org_key_number_unique) must turn it red.
 */

const TS = (s: string) => new Date(s);
const ORG = "org_nevr430";
const P1 = "principal_alice";
const P2 = "principal_bob";

const board = {
	id: "board_eng",
	org_id: ORG,
	name: "Engineering",
	description: "Stellarc engineering",
	position: 0,
	import_source: null,
	created_by: P1,
	created_at: TS("2026-11-02T10:00:00Z"),
	updated_at: TS("2026-11-02T10:00:00Z"),
	archived_at: null,
};

const status = {
	id: "status_progress",
	org_id: ORG,
	board_id: board.id,
	name: "In progress",
	color: "#34d399",
	position: 1,
	import_source: "kaneo:column_77",
	created_at: TS("2026-11-02T10:01:00Z"),
};

const ticket = {
	id: "ticket_430",
	org_id: ORG,
	board_id: board.id,
	status_id: status.id,
	key: "NEVR",
	number: 430,
	title: "Stellarc domain schema",
	description: "migrations + Effect Schema models",
	priority: "urgent",
	assignee_principal_id: P2,
	milestone_id: "milestone_schema",
	start_date: "2026-11-02",
	due_date: "2026-11-06",
	position: 3,
	import_source: null,
	created_by: P1,
	created_at: TS("2026-11-02T10:02:00Z"),
	updated_at: TS("2026-11-02T10:02:00Z"),
};

const ticketRelation = {
	id: "relation_1",
	org_id: ORG,
	ticket_id: "ticket_431",
	related_ticket_id: ticket.id,
	relation: "blocks",
	import_source: null,
	created_by: P1,
	created_at: TS("2026-11-02T10:03:00Z"),
};

const label = {
	id: "label_ui",
	org_id: ORG,
	name: "UI",
	color: "#8b5cf6",
	import_source: "kaneo:label_3",
	created_by: P1,
	created_at: TS("2026-11-02T10:04:00Z"),
};

const ticketLabel = {
	org_id: ORG,
	ticket_id: ticket.id,
	label_id: label.id,
	import_source: null,
	created_at: TS("2026-11-02T10:05:00Z"),
};

const milestone = {
	id: "milestone_schema",
	org_id: ORG,
	board_id: board.id,
	name: "v2 schema",
	description: "boards on the new domain",
	due_date: "2026-11-30",
	completed_at: null,
	import_source: null,
	created_by: P1,
	created_at: TS("2026-11-02T10:06:00Z"),
	updated_at: TS("2026-11-02T10:06:00Z"),
};

const project = {
	id: "project_v2",
	org_id: ORG,
	name: "Stellarc v2",
	description: "agent-native successor",
	position: 0,
	import_source: null,
	created_by: P1,
	created_at: TS("2026-11-02T10:07:00Z"),
	updated_at: TS("2026-11-02T10:07:00Z"),
	archived_at: null,
};

const projectBoard = {
	org_id: ORG,
	project_id: project.id,
	board_id: board.id,
	position: 0,
	import_source: null,
	created_at: TS("2026-11-02T10:08:00Z"),
};

const comment = {
	id: "comment_1",
	org_id: ORG,
	ticket_id: ticket.id,
	body: "schema looks good",
	import_source: "kaneo:comment_9",
	created_by: P2,
	created_at: TS("2026-11-02T10:09:00Z"),
	updated_at: TS("2026-11-02T10:09:00Z"),
};

const activity = {
	id: "activity_1",
	org_id: ORG,
	ticket_id: null,
	type: "ticket.created",
	payload: { key: "NEVR-430", board: board.id },
	import_source: null,
	actor_principal_id: P1,
	created_at: TS("2026-11-02T10:10:00Z"),
};

const subscriber = {
	org_id: ORG,
	ticket_id: ticket.id,
	principal_id: P2,
	import_source: null,
	created_at: TS("2026-11-02T10:11:00Z"),
};

const grant = {
	org_id: ORG,
	principal_id: P2,
	resource_type: "board",
	resource_id: board.id,
	capability: "edit",
	import_source: null,
	created_at: TS("2026-11-02T10:12:00Z"),
};

let sql: Sql;

beforeAll(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	await runMigration(sql);
	// Minimal identity fixture: two humans (principals) in one organization.
	await sql`INSERT INTO "user" (id, name, email) VALUES
		('user_alice', 'Alice', 'alice@nevr.dev'),
		('user_bob', 'Bob', 'bob@nevr.dev')`;
	await sql`INSERT INTO organization (id, name, slug, created_at)
		VALUES (${ORG}, 'Nevr Labs', 'nevr-430', now())`;
	await sql`INSERT INTO principal (id, kind, user_id) VALUES
		(${P1}, 'human', 'user_alice'),
		(${P2}, 'human', 'user_bob')`;
}, 60000);

afterAll(async () => {
	await sql?.end();
});

/** Quote one of our own identifiers (never user input). */
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function insert(
	table: string,
	row: Record<string, unknown>,
	options?: { onConflictDoNothing?: boolean },
) {
	const keys = Object.keys(row);
	const params = keys.map((k) =>
		typeof row[k] === "object" && row[k] !== null && !(row[k] instanceof Date)
			? sqlJSON(row[k])
			: row[k],
	);
	const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
	return sql.unsafe(
		`INSERT INTO ${q(table)} (${keys.map(q).join(", ")}) VALUES (${placeholders})${
			options?.onConflictDoNothing ? " ON CONFLICT DO NOTHING" : ""
		} RETURNING *`,
		params as Parameters<typeof sql.unsafe>[1],
	);
}

/** Idempotent ticket prerequisites so the duplicate test stands alone. */
async function ensureTicketFixture() {
	await insert("board", board, { onConflictDoNothing: true });
	await insert("status", status, { onConflictDoNothing: true });
	await insert("milestone", milestone, { onConflictDoNothing: true });
	await insert("ticket", ticket, { onConflictDoNothing: true });
}

// sql.json marks a parameter as jsonb (OID 3802); resolved lazily from the
// shared sql instance so this module has no import cycle with the fixture.
let sqlJson: ((value: unknown) => unknown) | undefined;
function sqlJSON(value: unknown) {
	sqlJson ??= (sql as unknown as { json: (v: unknown) => unknown }).json.bind(
		sql,
	);
	return sqlJson(value);
}

/** Read a row back with calendar-date columns as canonical text. */
async function selectRow(
	table: string,
	where: string,
	params: unknown[],
	dateColumns: readonly string[],
) {
	const catalog = await columnsOf(table);
	const selection = Object.keys(catalog)
		.map((c) => (dateColumns.includes(c) ? `${q(c)}::text` : q(c)))
		.join(", ");
	const rows = await sql.unsafe<Record<string, unknown>[]>(
		`SELECT ${selection} FROM ${q(table)} WHERE ${where}`,
		params as Parameters<typeof sql.unsafe>[1],
	);
	return rows[0];
}

async function columnsOf(table: string) {
	const rows = await sql<{ column_name: string }[]>`
		SELECT column_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = ${table}`;
	return Object.fromEntries(rows.map((r) => [r.column_name, true]));
}

/** Dates compare by instant; everything else structurally. */
function comparable(value: unknown): unknown {
	if (value instanceof Date) return { __instant: value.getTime() };
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, comparable(v)]),
		);
	}
	return value;
}

test("migrates a disposable PostgreSQL from zero through 0009", async () => {
	const versions = await sql<{ version: string; checksum: string }[]>`
		SELECT version, checksum FROM stellarc_migration ORDER BY version`;
	expect(versions.map((v) => v.version)).toEqual([
		"0001_foundation",
		"0002_identity",
		"0003_agents",
		"0004_budgets",
		"0005_pushes",
		"0006_permissions",
		"0007_resumed_from",
		"0008_stellarc_domain",
		"0009_context_receipt",
	]);
	for (const v of versions) expect(v.checksum).toMatch(/^[0-9a-f]{64}$/);
});

test("every domain table is org-scoped and carries import_source", async () => {
	const columns = await sql<
		{ table_name: string; column_name: string; is_nullable: string }[]
	>`
		SELECT table_name, column_name, is_nullable FROM information_schema.columns
		WHERE table_schema = 'public'
			AND column_name IN ('org_id', 'import_source')
			AND table_name = ANY(${[...STELLARC_DOMAIN_TABLES]})`;
	const byTable = new Map<string, { org_id: string; import_source: string }>(
		STELLARC_DOMAIN_TABLES.map((t) => [t, { org_id: "", import_source: "" }]),
	);
	for (const c of columns) {
		const entry = byTable.get(c.table_name);
		expect(entry, `${c.table_name} is a 0008 table`).toBeDefined();
		if (!entry) continue;
		if (c.column_name === "org_id") {
			expect(c.is_nullable, `${c.table_name}.org_id must be NOT NULL`).toBe(
				"NO",
			);
			entry.org_id = "present";
		} else {
			expect(
				c.is_nullable,
				`${c.table_name}.import_source must be nullable`,
			).toBe("YES");
			entry.import_source = "present";
		}
	}
	for (const [table, entry] of byTable)
		expect(entry, `${table} must define both columns`).toEqual({
			org_id: "present",
			import_source: "present",
		});

	// org-scoped means enforced: every domain table foreign-keys org_id to
	// organization(id), not just carries the column.
	const fkTables = await sql<{ table_name: string }[]>`
		SELECT DISTINCT rel.relname AS table_name
		FROM pg_constraint con
		JOIN pg_class rel ON rel.oid = con.conrelid
		JOIN pg_class ref ON ref.oid = con.confrelid
		WHERE con.contype = 'f'
			AND ref.relname = 'organization'
			AND con.connamespace = 'public'::regnamespace`;
	const fkSet = new Set(fkTables.map((r) => r.table_name));
	for (const table of STELLARC_DOMAIN_TABLES)
		expect(
			fkSet.has(table),
			`${table} must FK org_id to organization(id)`,
		).toBe(true);
});

test("round-trips one row per table through the Effect Schema", async () => {
	const cases = [
		{
			table: "board",
			schema: Board,
			row: board,
			where: "id = $1",
			params: [board.id],
			dates: [],
		},
		{
			table: "status",
			schema: Status,
			row: status,
			where: "id = $1",
			params: [status.id],
			dates: [],
		},
		{
			table: "milestone",
			schema: Milestone,
			row: milestone,
			where: "id = $1",
			params: [milestone.id],
			dates: ["due_date"],
		},
		{
			table: "ticket",
			schema: Ticket,
			row: ticket,
			where: "id = $1",
			params: [ticket.id],
			dates: ["start_date", "due_date"],
		},
		// A second ticket (no milestone, plain fields) so ticket_relation has
		// a legal non-self edge target; it round-trips through Ticket too.
		{
			table: "ticket",
			schema: Ticket,
			row: {
				...ticket,
				id: "ticket_431",
				number: 431,
				title: "Kaneo one-shot import",
				milestone_id: null,
				import_source: "kaneo:task_431",
			},
			where: "id = $1",
			params: ["ticket_431"],
			dates: ["start_date", "due_date"],
		},
		{
			table: "ticket_relation",
			schema: TicketRelation,
			row: ticketRelation,
			where: "id = $1",
			params: [ticketRelation.id],
			dates: [],
		},
		{
			table: "label",
			schema: Label,
			row: label,
			where: "id = $1",
			params: [label.id],
			dates: [],
		},
		{
			table: "ticket_label",
			schema: TicketLabel,
			row: ticketLabel,
			where: "ticket_id = $1 AND label_id = $2",
			params: [ticketLabel.ticket_id, ticketLabel.label_id],
			dates: [],
		},
		{
			table: "project",
			schema: Project,
			row: project,
			where: "id = $1",
			params: [project.id],
			dates: [],
		},
		{
			table: "project_board",
			schema: ProjectBoard,
			row: projectBoard,
			where: "project_id = $1 AND board_id = $2",
			params: [projectBoard.project_id, projectBoard.board_id],
			dates: [],
		},
		{
			table: "comment",
			schema: Comment,
			row: comment,
			where: "id = $1",
			params: [comment.id],
			dates: [],
		},
		{
			table: "activity",
			schema: Activity,
			row: activity,
			where: "id = $1",
			params: [activity.id],
			dates: [],
		},
		{
			table: "subscriber",
			schema: Subscriber,
			row: subscriber,
			where: "ticket_id = $1 AND principal_id = $2",
			params: [subscriber.ticket_id, subscriber.principal_id],
			dates: [],
		},
		{
			table: "grant",
			schema: Grant,
			row: grant,
			where:
				"org_id = $1 AND principal_id = $2 AND resource_type = $3 AND resource_id = $4 AND capability = $5",
			params: [
				grant.org_id,
				grant.principal_id,
				grant.resource_type,
				grant.resource_id,
				grant.capability,
			],
			dates: [],
		},
	] as const;

	for (const c of cases) {
		// Write the domain row, read it back, decode through the Schema, and
		// demand the decode equal what we wrote: the round trip.
		await insert(c.table, c.row);
		const read = await selectRow(c.table, c.where, [...c.params], c.dates);
		expect(read, `${c.table}: row not read back`).toBeDefined();
		const decoded = Schema.decodeUnknownSync(
			c.schema as Parameters<typeof Schema.decodeUnknownSync>[0],
		)(read);
		expect(comparable(decoded), `${c.table} round-trip`).toEqual(
			comparable(c.row),
		);
	}
}, 30000);

test("rejects a duplicate (org_id, key, number) ticket", async () => {
	await ensureTicketFixture();
	await expect(
		insert("ticket", { ...ticket, id: "ticket_dup", title: "duplicate key" }),
	).rejects.toThrow(/ticket_org_key_number_unique/);
}, 30000);
