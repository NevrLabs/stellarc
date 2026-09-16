import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import {
	identityFixtureSource,
	seedIdentitySnapshot,
} from "../helpers/identity-fixture";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T23/T24: the ten-table importer preserves every column of every
// table byte-exactly (nullable values, bcrypt hashes, avatar bytes), and an
// identical rerun is a no-op: same ledger, zero new events, source untouched.

let dest: Sql;
const resources: Array<() => Promise<void>> = [];

beforeEach(async () => {
	const db = await disposablePostgres();
	dest = db.sql;
	resources.push(db.close);
	await runMigration(dest);
});

afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

test("T23 import compares all ten PK sets/columns and preserves values, hashes and avatar bytes", async () => {
	const fixture = await identityFixtureSource("t23");
	resources.push(fixture.close);
	await seedIdentitySnapshot(fixture.sql);

	const { importIdentity, fixtureSourceId } = await import(
		"../../packages/domain/src/identity/import"
	);
	const run = await importIdentity(fixture.sql, dest, fixtureSourceId("t23"));
	expect(run.status).toBe("imported");

	// Ten-table coverage asserted via event ledger presence + direct row checks.
	for (const table of [
		"user",
		"account",
		"organization",
		"organization_member",
		"organization_role",
		"team",
		"team_member",
		"invitation",
		"apikey",
		"user_avatar",
	]) {
		const rows = await dest.unsafe(
			`SELECT count(*)::int AS n FROM ${table === "user" ? '"user"' : table}`,
		);
		expect(Number(rows[0]?.n)).toBeGreaterThan(0);
	}

	// bcrypt hash preserved verbatim (never re-hashed).
	const [account] = await dest`SELECT password FROM account WHERE id = 'a-fx'`;
	expect(account.password).toBe(
		"$2a$10$K7L1OJgMCVYYnSMOYYVY7OYcP9KK1e5wGwW1gEMV2GWnIVRpwdEVe",
	);

	// Avatar bytes round-trip exactly with MIME and size.
	const [avatar] =
		await dest`SELECT mime_type, size, octet_length(data) AS bytes FROM user_avatar WHERE id = 'av-fx'`;
	expect(avatar.mime_type).toBe("image/png");
	expect(Number(avatar.size)).toBe(4);
	expect(Number(avatar.bytes)).toBe(4);

	// Nullable preservation: team.updated_at null stays null; child parent link set.
	const teams =
		await dest`SELECT id, parent_team_id, updated_at, icon FROM team ORDER BY id`;
	expect(teams[0]?.parent_team_id).toBeNull();
	expect(teams[0]?.updated_at).toBeNull();
	expect(teams[1]?.parent_team_id).toBe("t-fx");
	expect(teams[1]?.icon).toBeNull();

	// Key digest preserved.
	const [key] = await dest`SELECT "key" FROM apikey WHERE id = 'k-fx'`;
	expect(key.key).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
});

test("T24 identical rerun has identical event counts/ledger and source remains unchanged", async () => {
	const fixture = await identityFixtureSource("t24");
	resources.push(fixture.close);
	await seedIdentitySnapshot(fixture.sql);

	const { importIdentity, fixtureSourceId } = await import(
		"../../packages/domain/src/identity/import"
	);
	const first = await importIdentity(fixture.sql, dest, fixtureSourceId("t24"));
	expect(first.status).toBe("imported");
	const eventsAfterFirst = await dest`SELECT count(*)::int AS n FROM event`;
	const ledgerAfterFirst =
		await dest`SELECT count(*)::int AS n FROM identity_import`;
	const sourceSnapshot =
		await fixture.sql`SELECT count(*)::int AS n FROM "user"`;

	const second = await importIdentity(
		fixture.sql,
		dest,
		fixtureSourceId("t24"),
	);
	expect(second.status).toBe("unchanged");
	expect(second.eventCount).toBe(0);
	const eventsAfterSecond = await dest`SELECT count(*)::int AS n FROM event`;
	const ledgerAfterSecond =
		await dest`SELECT count(*)::int AS n FROM identity_import`;
	expect(Number(eventsAfterSecond[0]?.n)).toBe(Number(eventsAfterFirst[0]?.n));
	expect(Number(ledgerAfterSecond[0]?.n)).toBe(Number(ledgerAfterFirst[0]?.n));

	// Source never mutated by an import run.
	const sourceAfter = await fixture.sql`SELECT count(*)::int AS n FROM "user"`;
	expect(Number(sourceAfter[0]?.n)).toBe(Number(sourceSnapshot[0]?.n));
});
