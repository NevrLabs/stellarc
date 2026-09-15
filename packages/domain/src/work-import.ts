import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { STATUS_DEFINITIONS, STATUS_SLUGS } from "./status-taxonomy";
import {
	boardPublic,
	flagTypePublic,
	keyAliasPublic,
	labelPublic,
	statusPublic,
	taskFlagPublic,
	templatePublic,
	ticketPublic,
	DEFAULT_SEED_STATUSES,
	type Tx,
} from "./work";

/** Per-table digest ledger (STL-15 `identity_import` pattern): reruns compare
 * digests instead of re-applying; identical source = zero new events. */

/** A raw source row keyed by SQL column name. Values are preserved verbatim
 * (jsonb, nulls, timestamps byte-exact); only preflight inspects them. */
export type RawRow = Record<string, unknown>;

export type WorkSourceData = {
	boards: RawRow[];
	columns?: RawRow[];
	boardKeyAliases?: RawRow[];
	tasks?: RawRow[];
	labels?: RawRow[];
	taskTemplates?: RawRow[];
	flagTypes?: RawRow[];
	taskFlags?: RawRow[];
};

export type ImportReport = {
	aborted: boolean;
	errors: string[];
	imported: number;
	events: number;
	ledger: Array<{ table: string; pk: string; digest: string }>;
};

function digestOf(row: unknown): string {
	return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

// §2 import order: board → column → board_key_alias → task → label,
// task_template, flag_type → task_flag.
const TABLE_ORDER = [
	"board",
	"column",
	"board_key_alias",
	"task",
	"label",
	"task_template",
	"flag_type",
	"task_flag",
] as const;

type TableName = (typeof TABLE_ORDER)[number];

// `column` is a reserved word — always quoted.
const SQL_NAME: Record<TableName, string> = {
	board: '"board"',
	column: '"column"',
	board_key_alias: "board_key_alias",
	task: "task",
	label: "label",
	task_template: "task_template",
	flag_type: "flag_type",
	task_flag: "task_flag",
};

const PRIORITIES = ["no-priority", "low", "medium", "high", "urgent"];
const VIRTUAL_STATUSES = ["triage", "planned", "canceled", "duplicate"];

function rowsOf(data: WorkSourceData, table: TableName): RawRow[] {
	switch (table) {
		case "board":
			return data.boards;
		case "column":
			return data.columns ?? [];
		case "board_key_alias":
			return data.boardKeyAliases ?? [];
		case "task":
			return data.tasks ?? [];
		case "label":
			return data.labels ?? [];
		case "task_template":
			return data.taskTemplates ?? [];
		case "flag_type":
			return data.flagTypes ?? [];
		case "task_flag":
			return data.taskFlags ?? [];
	}
}

async function emit(
	tx: Tx,
	org: string,
	type: string,
	payload: unknown,
): Promise<void> {
	await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
	const [counter] =
		await tx`UPDATE org_event_counter SET seq = seq + 1 WHERE org = ${org} RETURNING seq::text AS seq`;
	const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
	await tx`INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
		VALUES (${org}, ${counter.seq}, ${type}, 'import', ${tx.json(payload as never)}, 1, ${transaction.txid})`;
}

/** Import work board-slice rows from a source snapshot (already read into
 * `data`) into the destination in ONE destination transaction. Preflight
 * (column sets, FK resolvability, duplicate slug/alias/number/name pairs,
 * status/priority vocabulary, template data shape, flag exactly-one-target)
 * runs before any write and aborts the whole run with a sanitized report
 * (error text names tables/columns, never row values). Reruns with unchanged
 * sources import nothing and emit zero events. Changed sources require an
 * explicit replace mode on a disposable destination (§2). */
export async function importWork(
	db: Sql,
	sourceId: string,
	data: WorkSourceData,
): Promise<ImportReport> {
	const report: ImportReport = {
		aborted: false,
		errors: [],
		imported: 0,
		events: 0,
		ledger: [],
	};
	const fail = (message: string) => {
		report.errors.push(message);
		report.aborted = true;
	};

	// --- Preflight (no writes; sanitized messages name tables, never values) --
	const boardIds = new Set(data.boards.map((b) => String(b.id)));
	const columnIds = new Set((data.columns ?? []).map((c) => String(c.id)));
	const columnSlugsByBoard = new Map<string, Set<string>>();

	for (const board of data.boards) {
		if (typeof board.id !== "string" || board.id.length === 0)
			fail("preflight: board row without id");
		if (typeof board.organization_id !== "string")
			fail("preflight: board row without organization_id");
	}
	const seenBoardSlugs = new Set<string>();
	for (const board of data.boards) {
		const key = `${board.organization_id}:${String(board.slug).toLowerCase()}`;
		if (seenBoardSlugs.has(key))
			fail(
				"preflight: duplicate (organization_id, lower(slug)) in boards table",
			);
		seenBoardSlugs.add(key);
		if (
			typeof board.last_task_number === "number" &&
			board.last_task_number < 0
		)
			fail("preflight: negative last_task_number in boards table");
	}
	for (const column of data.columns ?? []) {
		if (!boardIds.has(String(column.board_id)))
			fail("preflight: column references unknown board");
		const set =
			columnSlugsByBoard.get(String(column.board_id)) ?? new Set<string>();
		if (set.has(String(column.slug)))
			fail("preflight: duplicate (board_id, slug) in columns table");
		set.add(String(column.slug));
		columnSlugsByBoard.set(String(column.board_id), set);
	}
	const seenAliases = new Set<string>();
	for (const alias of data.boardKeyAliases ?? []) {
		if (!boardIds.has(String(alias.board_id)))
			fail("preflight: board_key_alias references unknown board");
		const key = `${alias.organization_id}:${String(alias.key).toLowerCase()}`;
		if (seenAliases.has(key))
			fail(
				"preflight: duplicate (organization_id, lower(key)) in board_key_alias table",
			);
		seenAliases.add(key);
	}
	const seenNumbers = new Set<string>();
	for (const task of data.tasks ?? []) {
		if (!boardIds.has(String(task.board_id)))
			fail("preflight: task references unknown board");
		if (task.column_id != null && !columnIds.has(String(task.column_id)))
			fail("preflight: task references unknown column");
		const key = `${task.board_id}:${task.number}`;
		if (seenNumbers.has(key))
			fail("preflight: duplicate (board_id, number) in tasks table");
		seenNumbers.add(key);
		// Boards whose source carries no column rows keep the fork create-board
		// seed slugs (to-do/in-progress/in-review/done) as their valid set.
		const boardHasColumns = (data.columns ?? []).some(
			(c) => String(c.board_id) === String(task.board_id),
		);
		const valid = boardHasColumns
			? (columnSlugsByBoard.get(String(task.board_id)) ?? new Set<string>())
			: new Set<string>(DEFAULT_SEED_STATUSES);
		if (
			typeof task.status === "string" &&
			!valid.has(task.status) &&
			!VIRTUAL_STATUSES.includes(task.status)
		)
			fail("preflight: task status outside taxonomy and board columns");
		if (task.priority != null && !PRIORITIES.includes(String(task.priority)))
			fail("preflight: task priority outside vocabulary");
	}
	const seenLabelNames = new Set<string>();
	for (const label of data.labels ?? []) {
		if (label.task_id != null && label.organization_id != null)
			fail("preflight: label row scoped to both task and organization");
		if (label.task_id == null && label.organization_id == null)
			fail(
				"preflight: label row scoped to neither task nor organization (reported, not coerced)",
			);
		if (label.task_id != null) {
			const key = `${label.task_id}:${label.name}`;
			if (seenLabelNames.has(key))
				fail("preflight: duplicate (task_id, name) in labels table");
			seenLabelNames.add(key);
		}
	}
	const seenTemplateNames = new Set<string>();
	for (const template of data.taskTemplates ?? []) {
		if (typeof template.organization_id !== "string")
			fail("preflight: task_template row without organization_id");
		const key = `${template.organization_id}:${template.name}`;
		if (seenTemplateNames.has(key))
			fail(
				"preflight: duplicate (organization_id, name) in task_template table",
			);
		seenTemplateNames.add(key);
		const d = template.data as Record<string, unknown> | null | undefined;
		if (d == null || typeof d !== "object" || typeof d.title !== "string")
			fail("preflight: task_template data shape invalid");
	}
	const seenFlagTypeNames = new Set<string>();
	for (const flagType of data.flagTypes ?? []) {
		if (!boardIds.has(String(flagType.board_id)))
			fail("preflight: flag_type references unknown board");
		const key = `${flagType.board_id}:${flagType.name}`;
		if (seenFlagTypeNames.has(key))
			fail("preflight: duplicate (board_id, name) in flag_type table");
		seenFlagTypeNames.add(key);
	}
	const taskIds = new Set((data.tasks ?? []).map((t) => String(t.id)));
	const flagTypeIds = new Set((data.flagTypes ?? []).map((f) => String(f.id)));
	for (const flag of data.taskFlags ?? []) {
		if (!taskIds.has(String(flag.task_id)))
			fail("preflight: task_flag references unknown task");
		if (!flagTypeIds.has(String(flag.flag_type_id)))
			fail("preflight: task_flag references unknown flag_type");
		const hasUser = flag.target_user_id != null;
		const hasTeam = flag.target_team_id != null;
		if (hasUser === hasTeam)
			fail("preflight: task_flag target must be exactly one of user or team");
	}
	if (report.aborted) return report;

	// DB-backed preflight: FK resolvability (orgs/assignees/teams/targets
	// against merged T1 data) + destination slug clashes. Abort before writes.
	for (const board of data.boards) {
		const [orgExists] = (await db`
			SELECT id FROM organization WHERE id = ${String(board.organization_id)}`) as unknown as Array<{
			id: string;
		}>;
		if (!orgExists) {
			fail("preflight: board organization unresolved against identity data");
			break;
		}
		const [clash] = (await db`
			SELECT id FROM "board"
			WHERE organization_id = ${String(board.organization_id)}
				AND lower(slug) = ${String(board.slug).toLowerCase()} AND id <> ${String(board.id)}`) as unknown as Array<{
			id: string;
		}>;
		if (clash) {
			fail(
				"preflight: board slug collides with an existing board in organization",
			);
			break;
		}
	}
	if (report.aborted) return report;
	for (const task of data.tasks ?? []) {
		for (const [column, value] of [
			["assignee_id", task.assignee_id],
			["team_assignee_id", task.team_assignee_id],
		] as const) {
			if (value == null) continue;
			const [row] =
				column === "assignee_id"
					? ((await db`SELECT id FROM "user" WHERE id = ${String(value)}`) as unknown as Array<{
							id: string;
						}>)
					: ((await db`SELECT id FROM team WHERE id = ${String(value)}`) as unknown as Array<{
							id: string;
						}>);
			if (!row) {
				fail(`preflight: task ${column} unresolved against identity data`);
				break;
			}
		}
		if (report.aborted) break;
	}
	if (report.aborted) return report;

	// Explicit per-table INSERT (§2 column lists; jsonb via tx.json; `column`
	// quoted as the reserved word it is). Byte-exact nulls: absent keys insert
	// NULL — preflight has already validated required columns.
	const JSONB_COLUMNS = new Set([
		"description_history",
		"task_status_order",
		"backlog_status_order",
		"data",
	]);

	async function insertRow(
		tx: Tx,
		table: TableName,
		row: RawRow,
	): Promise<void> {
		const keys = Object.keys(row);
		const cols = keys.map((k) => `"${k}"`).join(", ");
		const params: unknown[] = keys.map((k) =>
			JSONB_COLUMNS.has(k) && row[k] != null
				? tx.json(row[k] as never)
				: row[k] === undefined
					? null
					: row[k],
		);
		const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
		await tx.unsafe(
			`INSERT INTO ${SQL_NAME[table]} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
			params as never[],
		);
	}

	// --- Import (one destination transaction; failures abort all) -------------
	// Section 2 event contracts: upsert payloads are {id, row: <Public mapper>}
	// per table — the same payload shape the live domain services emit, so the
	// shape tail and T3 consumers see one wire contract for imported and live
	// rows alike. The emitted row is read back inside the import transaction
	// (defaults applied by the destination, not the source).
	type Emitter = (tx: Tx, org: string, row: RawRow) => Promise<void>;
	const EMITTERS: Partial<Record<TableName, Emitter>> = {
		board: async (tx, org, row) => {
			const [board] = (await tx`SELECT * FROM "board" WHERE id = ${row.id}`) as never[];
			await emit(tx, org, "work:board-upserted", {
				id: String(row.id),
				row: boardPublic(board as never),
			});
		},
		column: async (tx, org, row) => {
			const [column] = (await tx`SELECT * FROM "column" WHERE id = ${row.id}`) as never[];
			await emit(tx, org, "work:status-upserted", {
				id: String(row.id),
				row: statusPublic(column as never),
			});
		},
		board_key_alias: async (tx, org, row) => {
			const [alias] = (await tx`SELECT * FROM board_key_alias WHERE id = ${row.id}`) as never[];
			await emit(tx, org, "work:board-key-upserted", {
				id: String(row.id),
				row: keyAliasPublic(alias as never),
			});
		},
		task: async (tx, org, row) => {
			const [task] = (await tx`SELECT t.*, b.slug AS board_slug FROM task t
				JOIN "board" b ON b.id = t.board_id WHERE t.id = ${row.id}`) as never[];
			await emit(tx, org, "work:ticket-upserted", {
				id: String(row.id),
				row: ticketPublic(task as never),
			});
		},
		label: async (tx, org, row) => {
			const [label] = (await tx`SELECT * FROM label WHERE id = ${row.id}`) as never[];
			await emit(tx, org, "work:label-upserted", {
				id: String(row.id),
				row: labelPublic(label as never),
			});
		},
		task_template: async (tx, org, row) => {
			const [template] = (await tx`SELECT * FROM task_template WHERE id = ${row.id}`) as never[];
			await emit(tx, org, "work:template-upserted", {
				id: String(row.id),
				row: templatePublic(template as never),
			});
		},
		flag_type: async (tx, org, row) => {
			const [flagType] = (await tx`SELECT * FROM flag_type WHERE id = ${row.id}`) as never[];
			await emit(tx, org, "work:flag-type-upserted", {
				id: String(row.id),
				row: flagTypePublic(flagType as never),
			});
		},
		task_flag: async (tx, org, row) => {
			const [taskFlag] = (await tx`SELECT * FROM task_flag WHERE id = ${row.id}`) as never[];
			await emit(tx, org, "work:task-flag-upserted", {
				id: String(row.id),
				row: taskFlagPublic(taskFlag as never),
			});
		},
	};

	// Org resolution per row (board-scoped tables join through their board).
	async function orgFor(
		tx: Tx,
		table: TableName,
		row: RawRow,
	): Promise<string | null> {
		if (table === "task_flag") {
			const [found] = (await tx`
				SELECT b.organization_id FROM task_flag f
				JOIN task t ON t.id = f.task_id
				JOIN "board" b ON b.id = t.board_id
				WHERE f.id = ${row.id}`) as unknown as Array<{
				organization_id: string;
			}>;
			return found?.organization_id ?? null;
		}
		const boardId =
			table === "board"
				? row.id
				: ((row.board_id as string | undefined) ??
					(table === "column" || table === "flag_type"
						? (row.board_id as string)
						: undefined));
		if (table === "label" && row.board_id == null && row.task_id != null) {
			const [found] = (await tx`
				SELECT b.organization_id FROM label l
				JOIN task t ON t.id = l.task_id
				JOIN "board" b ON b.id = t.board_id
				WHERE l.id = ${row.id}`) as unknown as Array<{
				organization_id: string;
			}>;
			return found?.organization_id ?? null;
		}
		if (!boardId) return (row.organization_id as string) ?? null;
		const [found] = (await tx`
			SELECT organization_id FROM "board" WHERE id = ${boardId}`) as unknown as Array<{
			organization_id: string;
		}>;
		return found?.organization_id ?? null;
	}

	await db.begin(async (tx) => {
		for (const table of TABLE_ORDER) {
			for (const row of rowsOf(data, table)) {
				const pk = String(row.id);
				const digest = digestOf(row);
				// Ledger hit with identical digest = unchanged source; skip
				// re-apply (identical rerun = zero new events).
				const [existing] = (await tx`
					SELECT digest FROM work_import
					WHERE source_id = ${sourceId} AND table_name = ${table} AND source_pk = ${pk}`) as unknown as Array<{
					digest: string;
				}>;
				if (existing && existing.digest === digest) continue;

				await insertRow(tx, table, row);
				await tx`
					INSERT INTO work_import (source_id, table_name, source_pk, digest)
					VALUES (${sourceId}, ${table}, ${pk}, ${digest})
					ON CONFLICT (source_id, table_name, source_pk)
					DO UPDATE SET digest = ${digest}`;
				report.imported += 1;
				report.ledger.push({ table, pk, digest });
				// Board rows without explicit source columns keep the fork
				// create-board shape: four default statuses seeded positionally.
				if (table === "board" && !columnSlugsByBoard.has(pk)) {
					for (
						let position = 0;
						position < DEFAULT_SEED_STATUSES.length;
						position++
					) {
						const slug = DEFAULT_SEED_STATUSES[position];
						const definition = STATUS_DEFINITIONS.find((d) => d.slug === slug);
						await insertRow(tx, "column", {
							id: `st-${pk}-${position}`,
							board_id: pk,
							name: definition?.name ?? slug,
							slug,
							position,
							is_final: slug === "done",
							created_at: new Date(),
							updated_at: new Date(),
						});
					}
				}
			}
		}
		// Events only for newly imported rows (ledger) — reruns emit nothing.
		for (const entry of report.ledger) {
			const table = entry.table as TableName;
			const row = rowsOf(data, table).find((r) => String(r.id) === entry.pk);
			if (!row) continue;
			const org = await orgFor(tx, table, row);
			if (!org) continue;
			const emitter = EMITTERS[table];
			if (emitter) {
				await emitter(tx, org, row);
				report.events += 1;
			}
		}
	});

	return report;
}

export { DEFAULT_SEED_STATUSES, STATUS_DEFINITIONS, STATUS_SLUGS };
