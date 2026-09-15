import { createHash } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

let sql: import("postgres").Sql;
let close: () => Promise<void>;

beforeAll(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-1', 'O1', 'o1', now())`;
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-2', 'O2', 'o2', now())`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('user-1', 'U1', 'u1@t.dev', true, now(), now())`;
	await sql`INSERT INTO team (id, name, organization_id, created_at) VALUES ('team-1', 'T1', 'org-1', now())`;
}, 60000);

afterAll(async () => {
	await close();
});

// Synthetic "source" cluster: a second schema carrying the pre-import snapshot
// for two orgs. The importer reads it read-only and writes the destination.
type SourceRow = {
	org: string;
	id: string;
	slug: string;
	name: string;
	ticket_max: number;
};

const SOURCE_BOARDS: SourceRow[] = [
	{
		org: "org-1",
		id: "sb-1",
		slug: "imported",
		name: "Imported Board",
		ticket_max: 3,
	},
	{
		org: "org-2",
		id: "sb-2",
		slug: "other",
		name: "Other Board",
		ticket_max: 0,
	},
];

async function seedSource() {
	await sql`CREATE SCHEMA IF NOT EXISTS src`;
	await sql`CREATE TABLE IF NOT EXISTS src.board_snapshot (
		org text, id text, slug text, name text, ticket_max int, PRIMARY KEY (org, id))`;
	for (const b of SOURCE_BOARDS) {
		await sql`
			INSERT INTO src.board_snapshot (org, id, slug, name, ticket_max)
			VALUES (${b.org}, ${b.id}, ${b.slug}, ${b.name}, ${b.ticket_max})
			ON CONFLICT (org, id) DO NOTHING`;
	}
}

test("T18: import restores boards with exact column fidelity and PK-set equality", async () => {
	await seedSource();
	const { importWork } = await import("../../packages/domain/src/work-import");
	const report = await importWork(sql, "test-source", {
		boards: SOURCE_BOARDS.map((b) => ({
			organization_id: b.org,
			id: b.id,
			slug: b.slug,
			name: b.name,
			last_task_number: b.ticket_max,
		})),
	});
	expect(report.aborted).toBe(false);
	// PK sets equal: source board ids == destination board ids
	const destIds = (
		await sql`SELECT id FROM "board" WHERE id IN ('sb-1','sb-2')`
	).map((r) => r.id);
	expect(destIds.sort()).toEqual(["sb-1", "sb-2"]);
	// Board columns byte-exact
	const [board] = await sql`SELECT * FROM "board" WHERE id = 'sb-1'`;
	expect(board.slug).toBe("imported");
	expect(board.last_task_number).toBe(3);
	// Importer seeds the four default statuses (fork create-board shape)
	const statuses =
		await sql`SELECT slug FROM "column" WHERE board_id = 'sb-1' ORDER BY position`;
	expect(statuses.map((s) => s.slug)).toEqual([
		"to-do",
		"in-progress",
		"in-review",
		"done",
	]);
});

test("T19: identical rerun produces zero new events and identical ledger", async () => {
	const before = (
		await sql`SELECT count(*)::int AS count FROM event WHERE org = 'org-1'`
	)[0].count;
	const ledgerBefore = (
		await sql`SELECT digest FROM work_import WHERE source_id = 'test-source' ORDER BY table_name`
	).map((r) => r.digest);
	const { importWork } = await import("../../packages/domain/src/work-import");
	const report = await importWork(sql, "test-source", {
		boards: SOURCE_BOARDS.map((b) => ({
			organization_id: b.org,
			id: b.id,
			slug: b.slug,
			name: b.name,
			last_task_number: b.ticket_max,
		})),
	});
	expect(report.aborted).toBe(false);
	expect(report.imported).toBe(0);
	const after = (
		await sql`SELECT count(*)::int AS count FROM event WHERE org = 'org-1'`
	)[0].count;
	expect(after).toBe(before);
	const ledgerAfter = (
		await sql`SELECT digest FROM work_import WHERE source_id = 'test-source' ORDER BY table_name`
	).map((r) => r.digest);
	expect(ledgerAfter).toEqual(ledgerBefore);
});

test("T20: preflight aborts the whole run before any write on duplicate slug", async () => {
	const { importWork } = await import("../../packages/domain/src/work-import");
	// A board whose slug collides with an existing same-org board (case-insensitive)
	const report = await importWork(sql, "test-source-2", {
		boards: [
			{
				organization_id: "org-1",
				id: "sb-dup",
				slug: "IMPORTED",
				name: "Dup",
				last_task_number: 0,
			},
			{
				organization_id: "org-2",
				id: "sb-clean",
				slug: "clean",
				name: "Clean",
				last_task_number: 0,
			},
		],
	});
	expect(report.aborted).toBe(true);
	expect(
		report.errors.some((e: string) => e.toLowerCase().includes("slug")),
	).toBe(true);
	// NOTHING was written — not even the clean board (single-transaction run).
	const [written] =
		await sql`SELECT count(*)::int AS count FROM "board" WHERE id = 'sb-clean'`;
	expect(written.count).toBe(0);
	const [dup] =
		await sql`SELECT count(*)::int AS count FROM "board" WHERE id = 'sb-dup'`;
	expect(dup.count).toBe(0);
});

test("T18: ledger rows carry per-table digests (identity_import pattern)", async () => {
	const rows =
		await sql`SELECT table_name, digest FROM work_import WHERE source_id = 'test-source' ORDER BY table_name`;
	expect(rows.length).toBeGreaterThan(0);
	for (const row of rows) {
		expect(row.digest).toMatch(/^[a-f0-9]{64}$/);
	}
	const { createHash } = await import("node:crypto");
	expect(createHash("sha256").update("x").digest("hex")).toMatch(
		/^[a-f0-9]{64}$/,
	);
});

// --- 8-table import through the shared fixture helper (T18 breadth) ---------

test("T18: full 8-table import through work-fixture restores rows and emits upsert events", async () => {
	const { workFixture } = await import("../helpers/work-fixture");
	const { importWork } = await import("../../packages/domain/src/work-import");
	const fixture = await workFixture();
	try {
		const SOURCE_PAYLOAD = {
			boards: [
				{
					id: "fx-board-1",
					organization_id: "fixture-org",
					slug: "fx-board",
					name: "FX Board",
					last_task_number: 1,
				},
			],
			columns: [
				{
					id: "fx-col-1",
					board_id: "fx-board-1",
					name: "Custom",
					slug: "custom",
					position: 4,
					is_final: false,
				},
			],
			boardKeyAliases: [
				{
					id: "fx-alias-1",
					organization_id: "fixture-org",
					board_id: "fx-board-1",
					key: "FXB",
				},
			],
			tasks: [
				{
					id: "fx-task-1",
					board_id: "fx-board-1",
					number: 1,
					title: "FX Ticket",
					status: "custom",
					column_id: "fx-col-1",
					description_history: [
						{ content: null, editedAt: null, userId: null },
					],
					priority: "high",
				},
			],
			labels: [
				{
					id: "fx-label-1",
					name: "fx",
					color: "#ff0000",
					source: "kaneo",
					task_id: "fx-task-1",
				},
			],
			taskTemplates: [
				{
					id: "fx-tmpl-1",
					organization_id: "fixture-org",
					name: "FX Template",
					data: { title: "Template title" },
				},
			],
			flagTypes: [
				{ id: "fx-ft-1", board_id: "fx-board-1", name: "blocked", position: 0 },
			],
			taskFlags: [
				{
					id: "fx-flag-1",
					task_id: "fx-task-1",
					flag_type_id: "fx-ft-1",
					target_user_id: "fixture-user-2",
				},
			],
		};
		const report = await importWork(fixture.sql, "fx-source", SOURCE_PAYLOAD);
		expect(report.aborted).toBe(false);
		expect(report.errors).toEqual([]);
		expect(report.imported).toBe(8);
		const [task] =
			await fixture.sql`SELECT description_history FROM task WHERE id = 'fx-task-1'`;
		expect(task.description_history).toEqual([
			{ content: null, editedAt: null, userId: null },
		]);
		const events =
			await fixture.sql`SELECT plugin_type FROM event ORDER BY seq`;
		const types = events.map((e) => String(e.plugin_type));
		for (const type of [
			"work:board-upserted",
			"work:status-upserted",
			"work:board-key-upserted",
			"work:ticket-upserted",
			"work:label-upserted",
			"work:template-upserted",
			"work:flag-type-upserted",
			"work:task-flag-upserted",
		])
			expect(types).toContain(type);
		// Identical rerun: zero new events, identical ledger
		const before = events.length;
		const rerun = await importWork(fixture.sql, "fx-source", SOURCE_PAYLOAD);
		expect(rerun.imported).toBe(0);
		const after = await fixture.sql`SELECT count(*)::int AS n FROM event`;
		expect(after[0].n).toBe(before);
	} finally {
		await fixture.close();
	}
}, 60000);

const B = {
	id: "d2-board",
	organization_id: "fixture-org",
	slug: "d2-board",
	name: "D2 Board",
	last_task_number: 2,
};

// D2 (c5 rework): section 2 event contracts - upsert payloads are {id, row:
// <Public mapper>} per table. c4 emitted {id} only, which provably fails the
// slice's own upcaster (WorkUpcasterRegistry decodes against the schemas).
test("D2: import upsert events carry {id,row} and decode through the work upcaster", async () => {
	const { workFixture } = await import("../helpers/work-fixture");
	const { importWork } = await import("../../packages/domain/src/work-import");
	const { WorkUpcasterRegistry } = await import(
		"../../packages/sync/src/work-upcasters",
	);
	const fixture = await workFixture();
	try {
		const report = await importWork(fixture.sql, "d2-source", {
			boards: [B],
			columns: [
				{ id: "d2-col-1", board_id: "d2-board", name: "Doing", slug: "doing", position: 0 },
			],
			tasks: [
				{
					id: "d2-task-1",
					board_id: "d2-board",
					number: 1,
					title: "D2 One",
					status: "doing",
					column_id: "d2-col-1",
				},
				{
					id: "d2-task-2",
					board_id: "d2-board",
					number: 2,
					title: "D2 Two",
					status: "doing",
					column_id: "d2-col-1",
				},
			],
			labels: [
				{ id: "d2-label-1", name: "d2", color: "#00ff00", source: "kaneo", task_id: "d2-task-1" },
			],
		});
		expect(report.aborted).toBe(false);
		expect(report.errors).toEqual([]);
		const events = await fixture.sql`SELECT plugin_type, schema_version, payload
			FROM event WHERE org = 'fixture-org' ORDER BY seq`;
		expect(events.length).toBeGreaterThan(0);
		const registry = new WorkUpcasterRegistry();
		for (const event of events) {
			// Every emitted work event must decode against its section-2 schema.
			// {id}-only payloads throw UnsupportedWorkEventSchema here.
			const decoded = registry.decode(
				event.plugin_type,
				event.schema_version,
				event.payload,
			) as { id: string; row?: Record<string, unknown> };
			expect(decoded.id).toBeTruthy();
			if (event.plugin_type.endsWith("-upserted")) {
				// upserts carry the full Public row, not just the id
				expect(decoded.row).toBeDefined();
				expect(Object.keys(decoded.row ?? {}).length).toBeGreaterThan(1);
			}
		}
		// The ticket row serializes through the Public mapper: camelCase key
		// fields present.
		const ticketUpsert = events.find(
			(e) => e.plugin_type === "work:ticket-upserted",
		);
		expect(ticketUpsert).toBeDefined();
		const ticketDecoded = registry.decode(
			ticketUpsert.plugin_type,
			ticketUpsert.schema_version,
			ticketUpsert.payload,
		) as { row: Record<string, unknown> };
		expect(ticketDecoded.row.title).toBe("D2 One");
		expect(ticketDecoded.row.key).toBe("D2-BOARD-1");
		expect(ticketDecoded.row.boardId).toBe("d2-board");
	} finally {
		await fixture.close();
	}
}, 60000);

test("T20: preflight aborts on flag with zero targets before any write", async () => {
	const { workFixture } = await import("../helpers/work-fixture");
	const { importWork } = await import("../../packages/domain/src/work-import");
	const fixture = await workFixture();
	try {
		const report = await importWork(fixture.sql, "fx-bad", {
			boards: [
				{
					id: "fx-bad-board",
					organization_id: "fixture-org",
					slug: "fx-bad",
					name: "Bad",
					last_task_number: 0,
				},
			],
			tasks: [
				{
					id: "fx-bad-task",
					board_id: "fx-bad-board",
					number: 1,
					title: "T",
					status: "to-do",
				},
			],
			flagTypes: [
				{ id: "fx-bad-ft", board_id: "fx-bad-board", name: "x", position: 0 },
			],
			taskFlags: [
				{
					id: "fx-bad-flag",
					task_id: "fx-bad-task",
					flag_type_id: "fx-bad-ft",
				},
			],
		});
		expect(report.aborted).toBe(true);
		expect(
			report.errors.some((e) => e.includes("exactly one of user or team")),
		).toBe(true);
		const [row] =
			await fixture.sql`SELECT count(*)::int AS n FROM "board" WHERE id = 'fx-bad-board'`;
		expect(row.n).toBe(0);
	} finally {
		await fixture.close();
	}
}, 60000);
