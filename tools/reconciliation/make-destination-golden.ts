// Generates tests/fixtures/reconciliation/stellarc-destination-golden.pgdump:
// the MERGED Stellarc schema (all migrations under packages/db/migrations applied
// via migrate() — including 0002_identity) plus the destination domain/ledger
// tables materialized per sibling-spec contracts, seeded with a correct import of
// the legacy fixture. PKs preserved verbatim where the ledger contract holds.
// The identity-table DDL comes from the merged migrations only (review cycle 6,
// defect 1); the mirror guard fails the generator on any drift.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { migrate } from "../../packages/db/src/migrate.ts";
import { disposablePostgres } from "../../tests/helpers/postgres.ts";
import {
	assertIdentityMirror,
	DESTINATION_EXTRA_DDL,
	destinationSeedSql,
	repoRoot,
} from "./canon.ts";

const outPath = () =>
	join(
		process.env.RECON_FIXTURE_DIR ??
			join(repoRoot(), "tests", "fixtures", "reconciliation"),
		"stellarc-destination-golden.pgdump",
	);

async function main() {
	const db = await disposablePostgres();
	try {
		await migrate(db.sql);
		// Non-migration destination machinery (extra ledger columns) still applied
		// explicitly; identity tables are NOT re-created — they come from the merge.
		await db.sql.unsafe(DESTINATION_EXTRA_DDL);
		const drift = await assertIdentityMirror(db.sql);
		if (drift.length > 0) {
			throw new Error(
				`destination identity schema drifts from the merged migrations:\n${drift.join("\n")}`,
			);
		}
		await db.sql.unsafe(destinationSeedSql());
		const bin = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
		const socketDir = db.sql.options.host[0];
		const out = outPath();
		mkdirSync(dirname(out), { recursive: true });
		execFileSync(
			join(bin, "pg_dump"),
			[
				"-h",
				socketDir,
				"-U",
				"stellarc_owner",
				"-d",
				"postgres",
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
