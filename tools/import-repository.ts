#!/usr/bin/env bun
// STL-18 §5: dump importer CLI. Mirrors packages/db/src/migrate.ts's
// DATABASE_URL convention. Reads the production dump restored as schema
// `kaneo_src` in the target database and applies the atomic idempotent
// import (packages/domain/src/repository-import). Exit codes: 0 imported
// (or idempotent no-op), 1 any failure — nothing partial is committed.

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is required (see packages/db/src/migrate.ts)");
	process.exit(1);
}
const schema = process.env.KANEO_SRC_SCHEMA ?? "kaneo_src";

const sql = postgres(url, { max: 4, onnotice: () => {} });
try {
	const hasSchema = await sql`SELECT 1 FROM information_schema.schemata
    WHERE schema_name=${schema}`;
	if (hasSchema.length === 0) {
		console.error(`Source schema ${schema} not found — restore the dump first`);
		process.exit(1);
	}
	const { importRepositoryDumpEffect } = await import(
		"../packages/domain/src/repository-import"
	);
	const { Effect } = await import("effect");
	const result = await Effect.runPromise(
		importRepositoryDumpEffect(sql, "import-cli"),
	);
	console.log(`import committed txid=${result.txid}`);
} catch (error) {
	console.error(
		error instanceof Error
			? `import failed: ${error.message}`
			: "import failed",
	);
	process.exitCode = 1;
} finally {
	await sql.end();
}
