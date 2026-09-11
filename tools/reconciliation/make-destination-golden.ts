// Generates tests/fixtures/reconciliation/stellarc-destination-golden.pgdump:
// the merged Stellarc schema (T0 foundation applied via migrate.ts) plus the
// destination domain/ledger tables materialized per sibling-spec contracts, seeded
// with a correct import of the legacy fixture. PKs preserved verbatim where the
// ledger contract holds.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "../../packages/db/src/migrate.ts";
import { disposablePostgres } from "../../tests/helpers/postgres.ts";
import {
	DESTINATION_SCHEMA_SQL,
	destinationSeedSql,
	repoRoot,
} from "./canon.ts";

const outPath = () =>
	join(
		repoRoot(),
		"tests",
		"fixtures",
		"reconciliation",
		"stellarc-destination-golden.pgdump",
	);

async function main() {
	const db = await disposablePostgres();
	try {
		await migrate(db.sql);
		await db.sql.unsafe(DESTINATION_SCHEMA_SQL);
		await db.sql.unsafe(destinationSeedSql());
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
