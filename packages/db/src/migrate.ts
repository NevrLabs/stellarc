import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Sql } from "postgres";

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
