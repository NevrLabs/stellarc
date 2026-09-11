// Generates tests/fixtures/reconciliation/legacy-snapshot.pgdump:
// a synthetic, snapshot-shaped legacy (fork) database in schema `legacy`.
// Mirrors the fork schema DDL (apps/api/src/database/schema.ts) and seeds
// deterministic synthetic rows. No production data is ever committed.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { disposablePostgres } from "../../tests/helpers/postgres.ts";
import { LEGACY_SCHEMA_SQL, legacySeedSql, repoRoot } from "./canon.ts";

const outPath = () =>
	join(
		repoRoot(),
		"tests",
		"fixtures",
		"reconciliation",
		"legacy-snapshot.pgdump",
	);

async function main() {
	const db = await disposablePostgres();
	try {
		await db.sql.unsafe(LEGACY_SCHEMA_SQL);
		await db.sql.unsafe(legacySeedSql());
		const bin = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
		const socketDir = db.sql.options.host[0];
		const out = outPath();
		mkdirSync(join(repoRoot(), "tests", "fixtures", "reconciliation"), {
			recursive: true,
		});
		execFileSync(
			join(bin, "pg_dump"),
			[
				"-h",
				socketDir,
				"-U",
				"stellarc_owner",
				"-d",
				"postgres",
				"--schema=legacy",
				"--format=custom",
				"--file",
				out,
			],
			{ stdio: "pipe" },
		);
		process.stdout.write(`wrote ${out}\n`);
	} finally {
		await db.close();
	}
}

main().catch((error) => {
	process.stderr.write(`${error}\n`);
	process.exitCode = 1;
});
