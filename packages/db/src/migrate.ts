import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import type { Sql } from "postgres";

/** Ordered migration list. 0001 bytes must never change (checksum registered on
 * migrated clusters); each entry is checksum-registered inside one advisory-lock
 * transaction and rejected on drift. */
const MIGRATIONS = [
	{ version: "0001_foundation", file: "../migrations/0001_foundation.sql" },
	{ version: "0002_identity", file: "../migrations/0002_identity.sql" },
	{ version: "0005_repository", file: "../migrations/0005_repository.sql" },
] as const;

/** Owner-only provisioning; the runtime principal must already exist. */
export async function grantRuntime(sql: Sql, role: string) {
	if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role))
		throw new Error("Invalid runtime role");
	await sql.begin(async (tx) => {
		const [principal] =
			await tx`SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=${role}`;
		const [ownership] =
			await tx`SELECT count(*)::int AS count FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname=${role} AND c.relnamespace='public'::regnamespace`;
		const [membership] =
			await tx`SELECT count(*)::int AS count FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=${role}`;
		if (
			!principal ||
			principal.rolsuper ||
			principal.rolcreaterole ||
			principal.rolcreatedb ||
			principal.rolbypassrls ||
			ownership.count > 0 ||
			membership.count > 0
		)
			throw new Error(
				"Runtime role must be unprivileged and separate from owner",
			);
		await tx.unsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
		await tx.unsafe(`REVOKE ALL ON event, stellarc_migration FROM "${role}"`);
		await tx.unsafe(`GRANT SELECT, INSERT ON event TO "${role}"`);
		await tx.unsafe(
			`GRANT SELECT, INSERT, UPDATE ON org_event_counter TO "${role}"`,
		);
		await tx.unsafe(
			`GRANT SELECT, INSERT, UPDATE, DELETE ON sync_probe TO "${role}"`,
		);
	});
}

export const applyMigration = Effect.fn("stellarc.migrate.apply")(function* (
	sql: Sql,
) {
	const applied = yield* Effect.tryPromise({
		try: () => runMigration(sql),
		catch: (cause) => cause,
	});
	yield* Effect.annotateCurrentSpan(
		"stellarc.migration.version",
		applied.map((entry) => entry.version).join(","),
	);
	return applied;
});

export function migrate(sql: Sql) {
	return Effect.runPromise(applyMigration(sql));
}

/** One entry per migration in MIGRATIONS, in order: applied this run or already
 * registered (verified). Returned so callers can annotate spans per run. */
export interface AppliedMigration {
	readonly version: string;
	readonly checksum: string;
}

export async function runMigration(sql: Sql): Promise<AppliedMigration[]> {
	const sources = await Promise.all(
		MIGRATIONS.map((m) => readFile(new URL(m.file, import.meta.url), "utf8")),
	);
	const results: AppliedMigration[] = [];
	await sql.begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(7414030914)`;
		await tx`CREATE TABLE IF NOT EXISTS stellarc_migration (
      version text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
		for (let i = 0; i < MIGRATIONS.length; i++) {
			const entry = MIGRATIONS[i];
			const source = sources[i];
			const checksum = createHash("sha256").update(source).digest("hex");
			const [existing] =
				await tx`SELECT checksum FROM stellarc_migration WHERE version = ${entry.version}`;
			if (existing) {
				if (existing.checksum !== checksum)
					throw new Error("Migration checksum mismatch");
				results.push({ version: entry.version, checksum });
				continue;
			}
			await tx.unsafe(source);
			await tx`INSERT INTO stellarc_migration(version, checksum) VALUES (${entry.version}, ${checksum})`;
			results.push({ version: entry.version, checksum });
		}
	});
	return results;
}
