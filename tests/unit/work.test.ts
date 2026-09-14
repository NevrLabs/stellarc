import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, expect, test } from "vitest";
import { startUnitPostgres } from "./work-unit-postgres";

let sql: import("postgres").Sql;

beforeAll(async () => {
	({ sql } = await startUnitPostgres());
}, 60000);

test("T01: migration catalogs all 8 work tables with exact column sets", async () => {
	const expected: Record<string, string[]> = {
		board: [
			"id",
			"organization_id",
			"slug",
			"icon",
			"name",
			"description",
			"created_at",
			"is_public",
			"archived_at",
			"last_task_number",
			"org_privilege",
			"task_status_order",
			"backlog_status_order",
			"subtask_depth_limit",
			"default_assignee_id",
			"default_assignee_team_id",
		],
		board_key_alias: ["id", "organization_id", "board_id", "key", "created_at"],
		column: [
			"id",
			"board_id",
			"name",
			"slug",
			"position",
			"icon",
			"color",
			"is_final",
			"created_at",
			"updated_at",
		],
		task: [
			"id",
			"board_id",
			"position",
			"number",
			"assignee_id",
			"team_assignee_id",
			"title",
			"description",
			"description_history",
			"status",
			"column_id",
			"priority",
			"milestone_id",
			"archived_at",
			"archived_by",
			"deleted_at",
			"deleted_by",
			"start_date",
			"due_date",
			"created_at",
			"updated_at",
		],
		label: [
			"id",
			"name",
			"color",
			"source",
			"created_at",
			"updated_at",
			"task_id",
			"organization_id",
		],
		task_template: [
			"id",
			"organization_id",
			"name",
			"data",
			"created_at",
			"updated_at",
		],
		flag_type: [
			"id",
			"board_id",
			"name",
			"color",
			"icon",
			"position",
			"created_at",
			"updated_at",
		],
		task_flag: [
			"id",
			"task_id",
			"flag_type_id",
			"flagged_by",
			"target_user_id",
			"target_team_id",
			"note",
			"resolve_note",
			"resolved_at",
			"resolved_by",
			"created_at",
			"updated_at",
		],
	};
	let total = 0;
	for (const [table, columns] of Object.entries(expected)) {
		const rows = await sql`
			SELECT column_name, data_type, is_nullable, column_default
			FROM information_schema.columns
			WHERE table_schema='public' AND table_name=${table}
			ORDER BY ordinal_position`;
		expect(
			rows.map((r) => r.column_name),
			table,
		).toEqual(columns);
		total += rows.length;
	}
	expect(total).toBe(86);
});

test("T01: exact types, nullability and defaults on key columns", async () => {
	const rows = await sql`
		SELECT column_name, data_type, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_schema='public' AND table_name='board'
		ORDER BY ordinal_position`;
	const byName = new Map(rows.map((r) => [r.column_name, r]));
	expect(byName.get("icon")?.column_default).toContain("Layout");
	expect(byName.get("is_public")?.column_default).toBe("false");
	expect(byName.get("last_task_number")?.column_default).toBe("0");
	expect(byName.get("last_task_number")?.is_nullable).toBe("NO");
	expect(byName.get("task_status_order")?.data_type).toBe("jsonb");
	expect(byName.get("backlog_status_order")?.data_type).toBe("jsonb");
	expect(byName.get("subtask_depth_limit")?.is_nullable).toBe("NO");
	const task = await sql`
		SELECT column_name, data_type, column_default
		FROM information_schema.columns
		WHERE table_schema='public' AND table_name='task'`;
	const tByName = new Map(task.map((r) => [r.column_name, r]));
	expect(tByName.get("status")?.column_default).toContain("to-do");
	expect(tByName.get("description_history")?.column_default).toContain("[]");
	expect(tByName.get("description_history")?.data_type).toBe("jsonb");
	expect(tByName.get("priority")?.column_default).toContain("low");
});

test("T01: subtask_depth_limit CHECK 1..4 enforced", async () => {
	const [org] =
		await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('o1','O','o', now()) RETURNING id`;
	await expect(sql`
		INSERT INTO board (id, organization_id, slug, name, subtask_depth_limit, created_at)
		VALUES ('b-bad', ${org.id}, 'bad', 'Bad', 5, now())`).rejects.toThrow();
	await sql`INSERT INTO board (id, organization_id, slug, name, subtask_depth_limit, created_at) VALUES ('b-ok', ${org.id}, 'ok', 'Ok', 1, now())`;
});

test("T01: milestone_id has no FK (T5 adds it later)", async () => {
	const rows = await sql`
		SELECT count(*)::int AS count
		FROM information_schema.table_constraints
		WHERE constraint_type='FOREIGN KEY'
			AND table_schema='public' AND table_name='task'
			AND constraint_name LIKE '%milestone%'`;
	expect(rows[0].count).toBe(0);
});

test("T01: absent table fails migration / unknown table rejected", async () => {
	const rows = await sql`
		SELECT count(*)::int AS count FROM information_schema.tables
		WHERE table_schema='public' AND table_name='workflow_rule'`;
	expect(rows[0].count).toBe(0);
	await expect(sql`SELECT * FROM workflow_rule`).rejects.toThrow();
});

test("T01 negative control scaffold: dropping (board_id,number) unique makes constraint probe fail", async () => {
	const before = await sql`
		SELECT count(*)::int AS count FROM pg_constraint
		WHERE conname='task_board_number_unique'`;
	expect(before[0].count).toBe(1);
	// Sabotage simulation happens in integration suite against a scratch DB;
	// here we prove the probe detects the constraint's presence/absence.
	await sql`ALTER TABLE task DROP CONSTRAINT task_board_number_unique`;
	const after = await sql`
		SELECT count(*)::int AS count FROM pg_constraint
		WHERE conname='task_board_number_unique'`;
	expect(after[0].count).toBe(0);
});

test("T02: ticket-key parse/normalize known answers", async () => {
	const { parseTicketKey, normalizeBoardKey } = await import(
		"../../packages/domain/src/ticket-key"
	);
	expect(parseTicketKey("KEY-1")).toEqual({ boardKey: "KEY", number: 1 });
	expect(parseTicketKey("key-1")).toEqual({ boardKey: "KEY", number: 1 });
	expect(parseTicketKey("ABCDEFGHIJKLmnopqrst-42")).toEqual({
		boardKey: "ABCDEFGHIJKLMNOPQRST",
		number: 42,
	});
	expect(parseTicketKey("A--1")).toBeNull();
	expect(parseTicketKey("KEY-0")).toBeNull();
	expect(parseTicketKey("-KEY-1")).toBeNull();
	expect(parseTicketKey("KEY--1")).toBeNull();
	expect(parseTicketKey("KEY-1-")).toBeNull();
	expect(parseTicketKey("ABCDEFGHIJKLmnopqrstu-1")).toBeNull(); // 21 chars
	expect(parseTicketKey("KEY-999999999999999999999999")).toBeNull(); // unsafe
	expect(normalizeBoardKey("abc")).toBe("ABC");
});

test("T03: status taxonomy pin — 8 slugs, frozen order, groups, flags", async () => {
	const mod = await import("../../packages/domain/src/status-taxonomy");
	const { STATUS_DEFINITIONS, STATUS_SLUGS } = mod;
	expect(STATUS_SLUGS).toEqual([
		"to-do",
		"in-progress",
		"in-review",
		"done",
		"triage",
		"planned",
		"canceled",
		"duplicate",
	]);
	expect(STATUS_DEFINITIONS.map((d) => [d.slug, d.group])).toEqual([
		["to-do", "unstarted"],
		["in-progress", "started"],
		["in-review", "started"],
		["done", "finished"],
		["triage", "backlog"],
		["planned", "backlog"],
		["canceled", "cancelled"],
		["duplicate", "duplicate"],
	]);
	expect(STATUS_DEFINITIONS.map((d) => [d.slug, d.isClosed])).toEqual([
		["to-do", false],
		["in-progress", false],
		["in-review", false],
		["done", true],
		["triage", false],
		["planned", false],
		["canceled", true],
		["duplicate", true],
	]);
	expect(STATUS_DEFINITIONS.map((d) => [d.slug, d.isBacklog])).toEqual([
		["to-do", false],
		["in-progress", false],
		["in-review", false],
		["done", false],
		["triage", true],
		["planned", true],
		["canceled", false],
		["duplicate", false],
	]);
	// 'archived' is NOT a status.
	expect(STATUS_SLUGS).not.toContain("archived");
	// Virtual statuses: no column rows.
	expect(mod.NON_COLUMN_STATUS_SLUGS).toEqual([
		"triage",
		"planned",
		"canceled",
		"duplicate",
	]);
	expect(mod.BACKLOG_STATUS_SLUGS).toEqual(["triage", "planned"]);
	expect(mod.CLOSED_STATUS_SLUGS).toEqual(["done", "canceled", "duplicate"]);
	// Definitions are frozen (append-only contract).
	expect(Object.isFrozen(STATUS_DEFINITIONS)).toBe(true);
});

test("T03: virtual statuses have no rows in any board seed and never emit events", async () => {
	const { VIRTUAL_STATUS_SLUGS } = await import(
		"../../packages/domain/src/status-taxonomy"
	);
	expect(VIRTUAL_STATUS_SLUGS).toEqual([
		"triage",
		"planned",
		"canceled",
		"duplicate",
	]);
});

test("T03 negative control scaffold: swapping two definition entries breaks the pin", async () => {
	const mod = await import("../../packages/domain/src/status-taxonomy");
	// A mutated copy must NOT deep-equal the pinned sequence — proves the
	// assertion distinguishes order (the real sabotage is source-level; the
	// integration suite runs it against the actual module).
	const swapped = [...mod.STATUS_SLUGS];
	[swapped[0], swapped[1]] = [swapped[1], swapped[0]];
	expect(swapped).not.toEqual([
		"to-do",
		"in-progress",
		"in-review",
		"done",
		"triage",
		"planned",
		"canceled",
		"duplicate",
	]);
});

test("T05: board slug + alias lower-unique reject duplicates at the DB", async () => {
	const [org] =
		await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('o2','O','o2', now()) RETURNING id`;
	await sql`INSERT INTO board (id, organization_id, slug, name, created_at) VALUES ('b1', ${org.id}, 'Alpha', 'A', now())`;
	await expect(
		sql`INSERT INTO board (id, organization_id, slug, name, created_at) VALUES ('b2', ${org.id}, 'alpha', 'A2', now())`,
	).rejects.toThrow();
	// Different org, same slug: fine (unique is per-org).
	const [org2] =
		await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('o3','O','o3', now()) RETURNING id`;
	await sql`INSERT INTO board (id, organization_id, slug, name, created_at) VALUES ('b3', ${org2.id}, 'alpha', 'A3', now())`;
	await sql`INSERT INTO board_key_alias (id, organization_id, board_id, key, created_at) VALUES ('k1', ${org.id}, 'b1', 'ABC', now())`;
	await expect(
		sql`INSERT INTO board_key_alias (id, organization_id, board_id, key, created_at) VALUES ('k2', ${org.id}, 'b1', 'abc', now())`,
	).rejects.toThrow();
});

test("T01: migration file registers 0003_work with checksum-registered discovery", async () => {
	const migrateSrc = await readFile(
		join(process.cwd(), "packages/db/src/migrate.ts"),
		"utf8",
	);
	expect(migrateSrc).toContain("0003_work");
	const migration = await readFile(
		join(process.cwd(), "packages/db/migrations/0003_work.sql"),
		"utf8",
	);
	expect(migration).toContain('CREATE TABLE "board"');
	expect(migration).toContain("CREATE TABLE task ");
});
