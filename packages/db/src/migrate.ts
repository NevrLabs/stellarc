import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Sql } from "postgres";

export async function migrate(sql: Sql) {
	const source = await readFile(
		new URL("../migrations/0001_foundation.sql", import.meta.url),
		"utf8",
	);
	const checksum = createHash("sha256").update(source).digest("hex");
	await sql.begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(7414030914)`;
		await tx`CREATE TABLE IF NOT EXISTS stellarc_migration (
      version text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
		const [existing] =
			await tx`SELECT checksum FROM stellarc_migration WHERE version = '0001_foundation'`;
		if (existing) {
			if (existing.checksum !== checksum)
				throw new Error("Migration checksum mismatch");
			return;
		}
		await tx.unsafe(source);
		await tx`INSERT INTO stellarc_migration(version, checksum) VALUES ('0001_foundation', ${checksum})`;
	});
}
