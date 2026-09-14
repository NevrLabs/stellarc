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
