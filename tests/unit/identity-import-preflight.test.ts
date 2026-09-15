import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T25: importer preflight rejects duplicate source pairs, broken
// FKs, malformed role-permission JSON, non-bcrypt hashes, bad avatar
// MIME/length and malformed key digests — BEFORE any destination write,
// with a sanitized report (no emails/hashes/bytes). D12: per-table
// projection-seeding events and an accurate eventCount.

let sql: Sql;
const resources: Array<() => Promise<void>> = [];

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	resources.push(db.close);
	await runMigration(sql);
});

afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

async function freshSource() {
	const source = await disposablePostgres();
	resources.push(source.close);
	await runMigration(source.sql);
	return source.sql;
}

async function seedCleanBase(s: Sql) {
	await s`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-p1', 'Preflight One', 'one@preflight.test', true, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES ('o-p1', 'Preflight Org', 'preflight-org', false, false, false, 'manage', false, 1024, 4000, '2025-06-01 10:00:00')`;
}

async function destinationIsEmpty(): Promise<boolean> {
	const tables = [
		'"user"',
		"account",
		"organization",
		"organization_member",
		"organization_role",
		"team",
		"team_member",
		"invitation",
		"apikey",
		"user_avatar",
		"event",
	];
	for (const table of tables) {
		const rows = await sql.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
		if (Number(rows[0]?.n) > 0) return false;
	}
	return true;
}

test("T25 preflight aborts duplicate source pairs before any write, with sanitized report", async () => {
	const s = await freshSource();
	await seedCleanBase(s);
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-p1a', 'o-p1', 'u-p1', 'owner', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-p1b', 'o-p1', 'u-p1', 'member', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
		VALUES ('r-p1a', 'o-p1', 'viewer', '{}', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
		VALUES ('r-p1b', 'o-p1', 'viewer', '{}', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;

	const { importIdentity, fixtureSourceId } = await import(
		"../../packages/domain/src/identity/import"
	);
	let report = "";
	try {
		await importIdentity(s, sql, fixtureSourceId("t25-dup"));
		expect.unreachable("duplicate source pairs must abort the import");
	} catch (error) {
		report = String(error);
	}
	expect(report).toContain("organization_member");
	expect(report).toContain("duplicate");
	expect(report).toContain("organization_role");
	// Sanitized: no PII from the failing rows.
	expect(report).not.toContain("one@preflight.test");
	expect(await destinationIsEmpty()).toBe(true);
});

test("T25 preflight aborts broken FK references before any write", async () => {
	const s = await freshSource();
	// Simulate a drifted snapshot: FK constraints removed at the source, so
	// rows referencing absent parents can exist (as in a partial restore).
	await s.unsafe(
		"ALTER TABLE invitation DROP CONSTRAINT invitation_organization_id_fkey",
	);
	await s.unsafe(
		"ALTER TABLE organization_member DROP CONSTRAINT organization_member_user_id_fkey",
	);
	await seedCleanBase(s);
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-p1', 'o-p1', 'u-p1', 'owner', '2025-06-01 10:00:00')`;
	// Invitation pointing at an org that does not exist in the snapshot.
	await s`INSERT INTO invitation (id, organization_id, email, role, team_id, status, expires_at, created_at, inviter_id)
		VALUES ('i-bad', 'o-missing', 'ghost@preflight.test', 'member', null, 'pending', '2026-12-31 00:00:00', '2025-06-01 10:00:00', 'u-p1')`;
	// Member referencing an unknown user.
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-bad', 'o-p1', 'u-missing', 'member', '2025-06-01 10:00:00')`;

	const { importIdentity, fixtureSourceId } = await import(
		"../../packages/domain/src/identity/import"
	);
	let report = "";
	try {
		await importIdentity(s, sql, fixtureSourceId("t25-fk"));
		expect.unreachable("broken FKs must abort the import");
	} catch (error) {
		report = String(error);
	}
	expect(report).toContain("invitation");
	expect(report).toContain("organization_member");
	expect(report).not.toContain("ghost@preflight.test");
	expect(await destinationIsEmpty()).toBe(true);
});

test("T25 preflight aborts malformed permission JSON, non-bcrypt hash, bad avatar MIME, bad digest", async () => {
	const s = await freshSource();
	await seedCleanBase(s);
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-p1', 'o-p1', 'u-p1', 'owner', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
		VALUES ('r-bad', 'o-p1', 'custom', 'not-json', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES ('a-bad', 'a-bad', 'credential', 'u-p1', 'plaintext-not-bcrypt', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO user_avatar (id, user_id, mime_type, size, data, created_at, updated_at)
		VALUES ('av-bad', 'u-p1', 'application/pdf', 4, '\\x00112233', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO apikey (id, config_id, name, reference_id, "key", created_at, updated_at)
		VALUES ('k-bad', 'default', 'bad digest', 'u-p1', 'not-a-sha256-digest!', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;

	const { importIdentity, fixtureSourceId } = await import(
		"../../packages/domain/src/identity/import"
	);
	let report = "";
	try {
		await importIdentity(s, sql, fixtureSourceId("t25-format"));
		expect.unreachable("malformed values must abort the import");
	} catch (error) {
		report = String(error);
	}
	expect(report).toContain("organization_role");
	expect(report).toContain("account");
	expect(report).toContain("user_avatar");
	expect(report).toContain("apikey");
	expect(report).not.toContain("plaintext-not-bcrypt");
	expect(await destinationIsEmpty()).toBe(true);
});

test("D12 import emits per-table identity events for every changed row and counts them exactly", async () => {
	const s = await freshSource();
	await seedCleanBase(s);
	await s`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-p2', 'Preflight Two', 'two@preflight.test', true, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-p1', 'o-p1', 'u-p1', 'owner', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
		VALUES ('r-p1', 'o-p1', 'viewer', ${JSON.stringify({ board: ["read"] })}, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO team (id, name, organization_id, source, icon, parent_team_id, created_at, updated_at)
		VALUES ('t-p1', 'Core', 'o-p1', 'kaneo', null, null, '2025-06-01 10:00:00', null)`;
	await s`INSERT INTO team_member (id, team_id, user_id, created_at)
		VALUES ('tm-p1', 't-p1', 'u-p1', '2025-06-01 10:00:00')`;
	await s`INSERT INTO apikey (id, config_id, name, reference_id, "key", created_at, updated_at)
		VALUES ('k-p1', 'default', 'ci', 'u-p1', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;

	const { importIdentity, fixtureSourceId } = await import(
		"../../packages/domain/src/identity/import"
	);
	const run = await importIdentity(s, sql, fixtureSourceId("d12"));
	expect(run.status).toBe("imported");

	const types =
		await sql`SELECT plugin_type, count(*)::int AS n FROM event GROUP BY plugin_type`;
	const byType = new Map(types.map((r) => [r.plugin_type, Number(r.n)]));
	// §2 event contract: one upsert event per changed row per table (plus the
	// derived structural principals/grants), not a single org-only event.
	expect(byType.get("identity:organization-upserted")).toBe(1);
	expect(byType.get("identity:member-upserted")).toBe(1);
	expect(byType.get("identity:role-upserted")).toBe(1);
	expect(byType.get("identity:team-upserted")).toBe(1);
	expect(byType.get("identity:team-member-upserted")).toBe(1);
	expect(byType.get("identity:apikey-upserted")).toBe(1);
	expect(byType.get("identity:principal-upserted")).toBeGreaterThan(0);
	expect(byType.get("identity:grant-upserted")).toBeGreaterThan(0);
	// user events only for users with a membership org (u-p1, not u-p2).
	expect(byType.get("identity:user-upserted")).toBe(1);

	// eventCount reports emitted events exactly (D12: it used to count rows).
	const total = await sql`SELECT count(*)::int AS n FROM event`;
	expect(run.eventCount).toBe(Number(total[0]?.n));

	// Payloads are sanitized public rows: no bcrypt hashes, no key digests,
	// no avatar bytes ever enter an event payload.
	const payloads = await sql`SELECT payload::text AS p FROM event`;
	const all = payloads.map((r) => r.p).join("\n");
	expect(all).not.toContain("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

	// Idempotence preserved: rerun emits nothing.
	const run2 = await importIdentity(s, sql, fixtureSourceId("d12"));
	expect(run2.status).toBe("unchanged");
	expect(run2.eventCount).toBe(0);
	const total2 = await sql`SELECT count(*)::int AS n FROM event`;
	expect(Number(total2[0]?.n)).toBe(Number(total[0]?.n));
});
