// STL-16 §2 importer CLI: reads the source board-slice read-only, runs
// preflight, and imports into the destination in one transaction with a
// digest ledger. Usage:
//   bun tools/import-work.ts --src postgres://... --dest postgres://... \
//     [--source-id kaneo-2504e645] [--replace]
// --replace truncates the eight work tables + work_import on the DESTINATION
// only; the source connection is never written (§2: read-only).
import postgres from "postgres";
import { importWork } from "../packages/domain/src/work-import";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

const src = flag("src");
const dest = flag("dest");
const sourceId = flag("source-id") ?? "kaneo-source";
const replace = args.includes("--replace");

if (!src || !dest) {
	console.error(
		"usage: bun tools/import-work.ts --src URL --dest URL [--source-id ID] [--replace]",
	);
	process.exit(2);
}

// Read-only source: statements that write are rejected server-side.
const source = postgres(src, { prepare: false, readonly: true });
const destination = postgres(dest, { prepare: false });

type TableRow = Record<string, unknown>;

async function readTable(
	client: ReturnType<typeof postgres>,
	table: string,
): Promise<TableRow[]> {
	return (await client`SELECT * FROM ${client(table)}`) as TableRow[];
}

async function main() {
	const data = {
		boards: await readTable(source, "board"),
		columns: await readTable(source, '"column"'),
		boardKeyAliases: await readTable(source, "board_key_alias"),
		tasks: await readTable(source, "task"),
		labels: await readTable(source, "label"),
		taskTemplates: await readTable(source, "task_template"),
		flagTypes: await readTable(source, "flag_type"),
		taskFlags: await readTable(source, "task_flag"),
	};
	console.log(
		`source: ${data.boards.length} boards, ${data.columns.length} columns, ${data.tasks.length} tasks`,
	);

	if (replace) {
		await destination.begin(async (tx) => {
			await tx`TRUNCATE task_flag, flag_type, task_template, label, task, board_key_alias, "column", "board" CASCADE`;
			await tx`DELETE FROM work_import WHERE source_id = ${sourceId}`;
		});
		console.log("replace mode: destination work tables truncated");
	}

	const report = await importWork(destination, sourceId, data);
	await destination.end();
	await source.end();

	if (report.aborted) {
		console.error("preflight aborted — no writes performed:");
		for (const error of report.errors) console.error(`  - ${error}`);
		process.exit(1);
	}
	console.log(
		`imported ${report.imported} rows, ${report.events} events; ledger ${report.ledger.length} entries`,
	);
}

main().catch(async (error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	await destination.end().catch(() => {});
	await source.end().catch(() => {});
	process.exit(1);
});
