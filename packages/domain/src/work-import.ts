import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { DEFAULT_SEED_STATUSES, type Tx } from "./work";
import { STATUS_DEFINITIONS } from "./status-taxonomy";

/** Per-table digest ledger (STL-15 `identity_import` pattern): reruns compare
 * digests instead of re-applying; identical source = zero new events. */
export type ImportBoardRow = {
	organization_id: string;
	id: string;
	slug: string;
	name: string;
	last_task_number: number;
};

export type WorkSourceData = {
	boards: ImportBoardRow[];
};

export type ImportReport = {
	aborted: boolean;
	errors: string[];
	imported: number;
	ledger: Array<{ table: string; pk: string; digest: string }>;
};

function digestOf(row: unknown): string {
	return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

/** Import work board-slice rows from a source snapshot (already read into
 * `data`) into the destination in ONE transaction. Preflight (slug/alias/
 * number collisions, FK resolvability) runs before any write and aborts the
 * whole run with a sanitized report (error text names tables/columns, never
 * row values). Reruns with unchanged sources import nothing. */
export async function importWork(
	sql: Sql,
	sourceId: string,
	data: WorkSourceData,
): Promise<ImportReport> {
	const report: ImportReport = { aborted: false, errors: [], imported: 0, ledger: [] };

	// --- Preflight (no writes) -------------------------------------------------
	const preflight: Array<{ table: string; pk: string; digest: string }> = [];
	const seenSlugs = new Map<string, string>(); // `${org}:${lower(slug)}` -> board id
	for (const board of data.boards) {
		const key = `${board.organization_id}:${board.slug.toLowerCase()}`;
		if (seenSlugs.has(key)) {
			report.errors.push(
				`preflight: duplicate (organization_id, lower(slug)) in boards table`,
			);
			continue;
		}
		seenSlugs.set(key, board.id);
		if (board.last_task_number < 0) {
			report.errors.push(`preflight: negative last_task_number in boards table`);
		}
		preflight.push({ table: "board", pk: board.id, digest: digestOf(board) });
	}
	if (report.errors.length > 0) {
		report.aborted = true;
		return report;
	}
	// DB-backed preflight: existing same-org lower(slug) or destination PK clash
	for (const board of data.boards) {
		const [clash] = (await sql`
			SELECT id FROM "board"
			WHERE organization_id = ${board.organization_id}
				AND lower(slug) = ${board.slug.toLowerCase()} AND id <> ${board.id}`) as unknown as Array<{ id: string }>;
		if (clash) {
			report.errors.push(
				`preflight: board slug collides with an existing board in organization`,
			);
			report.aborted = true;
			return report;
		}
	}

	// --- Import (one destination transaction; preflight failures abort all) ----
	await sql.begin(async (tx) => {
		for (const entry of preflight) {
			if (entry.table !== "board") continue;
			const board = data.boards.find((b) => b.id === entry.pk);
			if (!board) continue;
			// Ledger hit = unchanged source; skip re-apply (rerun = zero events).
			const [existing] = (await tx`
				SELECT digest FROM work_import
				WHERE source_id = ${sourceId} AND table_name = 'board' AND source_pk = ${board.id}`) as Array<{ digest: string }> | unknown as Array<{ digest: string }>;
			if (existing && existing.digest === entry.digest) continue;

			const [orgExists] = (await tx`
				SELECT id FROM organization WHERE id = ${board.organization_id}`) as unknown as Array<{ id: string }>;
			if (!orgExists) {
				report.errors.push(
					`preflight: board organization unresolved against identity data`,
				);
				report.aborted = true;
				throw new Error("ABORT");
			}
			await tx`
				INSERT INTO "board" (id, organization_id, slug, name, last_task_number, created_at)
				VALUES (${board.id}, ${board.organization_id}, ${board.slug}, ${board.name}, ${board.last_task_number}, now())`;
			// Seed the four default statuses positionally, done is_final.
			for (let position = 0; position < DEFAULT_SEED_STATUSES.length; position++) {
				const slug = DEFAULT_SEED_STATUSES[position];
				const definition = STATUS_DEFINITIONS.find((d: { slug: string }) => d.slug === slug);
				await tx`
					INSERT INTO "column" (id, board_id, name, slug, position, is_final, created_at, updated_at)
					VALUES (${"st-" + board.id + "-" + position}, ${board.id}, ${definition?.name ?? slug}, ${slug}, ${position}, ${slug === "done"}, now(), now())`;
			}
			await tx`
				INSERT INTO work_import (source_id, table_name, source_pk, digest)
				VALUES (${sourceId}, 'board', ${board.id}, ${entry.digest})`;
			report.imported += 1;
			report.ledger.push(entry);
		}
		if (report.aborted) throw new Error("ABORT");
	}).catch((error) => {
		if ((error as Error).message !== "ABORT") throw error;
	});

	if (report.aborted) report.imported = 0;
	return report;
}

