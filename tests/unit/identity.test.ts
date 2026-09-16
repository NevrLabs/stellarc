import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import {
	apiKeyDigest,
	authenticateApiKey,
	humanPrincipalId,
} from "../../packages/domain/src/identity/auth";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T04 (known-answer + shape), T06 (scope derivation),
// T23 (importer digest, FK order, idempotence) — structural core.

// Known-answer vectors computed independently (Python hashlib, base64url no pad).
const RAW_KEY = "n2f7Kp9Qw3Zr8Ts5Vx1Mn4Bc6Ld0Hg2J";
const RAW_KEY_DIGEST = "_XFTCL1gj0SA0KiG08gXBtO54oGur6MwtEckbhi8ch0";
const HEX_DIGEST =
	"fd715308bd608f4480d0a886d3c81706d3b9e281aeafa330b447246e18bc721d";

let ctx: { sql: Sql; close: () => Promise<void> };
const resources: Array<() => Promise<void>> = [];

beforeEach(async () => {
	ctx = await disposablePostgres();
	resources.push(ctx.close);
	await runMigration(ctx.sql);
});

afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

const USER_ID = "u-t04-alice";
const ORG_ID = "o-t04";
const KEY_ID = "k-t04";

async function seedKeyRow(
	sql: Sql,
	opts: {
		key?: string;
		enabled?: boolean | null;
		expiresAt?: string | null;
		permissions?: string | null;
		suffix?: string;
	} = {},
) {
	const uid = USER_ID + (opts.suffix ?? "");
	const oid = ORG_ID + (opts.suffix ?? "");
	const kid = KEY_ID + (opts.suffix ?? "");
	const mid = `m-t04${opts.suffix ?? ""}`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES (${uid}, 'Alice', ${`alice@${opts.suffix ?? ""}t04.test`}, true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES (${oid}, 'Org T04', ${`org-t04${opts.suffix ?? ""}`}, false, false, false, 'manage', false, 1024, 4000, '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES (${mid}, ${oid}, ${uid}, 'admin', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO apikey (id, config_id, name, reference_id, "key", enabled, expires_at,
		permissions, created_at, updated_at)
		VALUES (${kid}, 'default', 'CI key', ${uid}, ${opts.key ?? RAW_KEY_DIGEST},
			${opts.enabled ?? true}, ${opts.expiresAt ?? null}, ${opts.permissions ?? null},
			'2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
}

test("T04 apiKeyDigest matches the SHA-256 base64url known-answer vector exactly", () => {
	expect(apiKeyDigest(RAW_KEY)).toBe(RAW_KEY_DIGEST);
	// Hex of the same digest must NOT be accepted/produced.
	expect(apiKeyDigest(RAW_KEY)).not.toBe(HEX_DIGEST);
	expect(apiKeyDigest(RAW_KEY)).not.toMatch(/^[0-9a-f]{64}$/);
});

test("T04 authenticateApiKey verifies raw key against stored b64url digest; rejects wrong/double-hashed", async () => {
	await seedKeyRow(ctx.sql);
	const ok = await authenticateApiKey(ctx.sql, RAW_KEY);
	expect(ok).not.toBeNull();
	expect(ok?.key.id).toBe(KEY_ID);
	// Wrong raw key must fail.
	const wrong = await authenticateApiKey(
		ctx.sql,
		"stl-15-bad-key-do-not-match",
	);
	expect(wrong).toBeNull();
	// A double-hash (digesting the digest) must not authenticate.
	const doubleHashed = apiKeyDigest(RAW_KEY_DIGEST);
	const double = await authenticateApiKey(ctx.sql, doubleHashed);
	expect(double).toBeNull();
});

test("T04 hex-encoded digest does not authenticate (encoding not padded/hex)", async () => {
	await seedKeyRow(ctx.sql, { key: HEX_DIGEST });
	const hexStored = await authenticateApiKey(ctx.sql, RAW_KEY);
	expect(hexStored).toBeNull();
});

test("T05 disabled or expired keys are denied before scope derivation", async () => {
	await seedKeyRow(ctx.sql, { enabled: false });
	const disabled = await authenticateApiKey(ctx.sql, RAW_KEY);
	expect(disabled).toBeNull();

	const expiredRaw = "stl-15-expired-key-vector-x9q2";
	await seedKeyRow(ctx.sql, {
		key: apiKeyDigest(expiredRaw),
		expiresAt: "2026-01-02 00:00:00",
		suffix: "-expired",
	});
	const expired = await authenticateApiKey(ctx.sql, expiredRaw);
	expect(expired).toBeNull();
});

test("T06 key auth is read-only; grants exist only via the createApiKey mutation", async () => {
	// Rework c10 (defects 4/5): authenticateApiKey never mints principal or
	// identity_grant rows. The fixture provisions the agent key through the
	// createApiKey mutation (the only grant source besides the importer).
	const { createApiKey } = await import(
		"../../packages/domain/src/identity/mutations"
	);
	await seedKeyRow(ctx.sql, {
		permissions: JSON.stringify({ board: ["read"] }),
	});
	const auth = await authenticateApiKey(ctx.sql, RAW_KEY);
	expect(auth).not.toBeNull();
	expect(auth?.principal.kind).toBe("agent");
	expect(auth?.principal.userId).toBe(USER_ID);
	expect(auth?.orgIds).toEqual([ORG_ID]);
	// Deterministic separate agent namespace (never collides with human ids).
	expect(auth?.principal.id).toMatch(/^agent:/);
	expect(auth?.principal.id).not.toBe(humanPrincipalId(USER_ID));
	// Read-only: authenticating a hand-seeded key row mints NO principal and
	// NO structural grants (T06 negative-control foundation — the union
	// sabotage in identity-http stays red because the intersection is real).
	const seeded = await ctx.sql`SELECT count(*)::int AS n FROM principal
		WHERE id = ${auth?.principal.id ?? ""}`;
	expect(seeded[0]?.n).toBe(0);
	const grants = await ctx.sql`SELECT capability FROM identity_grant
		WHERE org_id=${ORG_ID} AND principal_id=${auth?.principal.id ?? ""} ORDER BY capability`;
	expect(grants.map((g) => g.capability)).toEqual([]);
	// The mutation path is the grant source: createApiKey through the domain
	// service mints principal + ceiling-derived structural grants.
	const created = await createApiKey(
		ctx.sql,
		ORG_ID,
		{ name: "Mut key", permissions: { board: ["read"] }, expiresAt: null },
		{ principalId: `human:${USER_ID}`, kind: "human", userId: USER_ID },
	);
	const mintedKey = created.data.key as { id: string };
	expect(typeof created.data.secret).toBe("string");
	const auth2 = await authenticateApiKey(ctx.sql, created.data.secret);
	expect(auth2?.principal.id).toBe(`agent:${mintedKey.id}`);
	const grants2 = await ctx.sql`SELECT capability FROM identity_grant
		WHERE org_id=${ORG_ID} AND principal_id=${auth2?.principal.id ?? ""} ORDER BY capability`;
	expect(grants2.map((g) => g.capability)).toEqual([
		"board:read",
		"org:member",
	]);
});

test("D8 importer verifies all ten PK sets/values and rejects destination extras", async () => {
	// Same synthetic source as T23 (reuse the builder inline, minimal rows).
	const source = await disposablePostgres();
	resources.push(source.close);
	await runMigration(source.sql);
	const s = source.sql;
	await s`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-d8', 'D8', 'd8@src.test', true, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES ('o-d8', 'D8 Org', 'd8-org', false, false, false, 'manage', false, 1024, 4000, '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('om-d8', 'o-d8', 'u-d8', 'owner', '2025-06-01 10:00:00')`;
	const { importIdentity, fixtureSourceId } = await import(
		"../../packages/domain/src/identity/import"
	);
	// Destination carries an EXTRA user row the source does not have.
	await ctx.sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-extra', 'Extra', 'extra@dest.test', true, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await expect(
		importIdentity(s, ctx.sql, fixtureSourceId("d8")),
	).rejects.toThrow(/verification failed/);
	// The whole transaction aborted: no ledger rows landed.
	const ledger = await ctx.sql`SELECT count(*)::int AS n FROM identity_import`;
	expect(Number(ledger[0]?.n)).toBe(0);
});

test("T23 identityImporter: FK-order import, exact all-column preservation, ledger + idempotence", async () => {
	// Build a synthetic source cluster with the same 0002 schema and seed every
	// one of the ten imported tables, including edge rows (nullable everything,
	// bcrypt hash verbatim, avatar bytes).
	const source = await disposablePostgres();
	resources.push(source.close);
	await runMigration(source.sql);
	const s = source.sql;
	await s`INSERT INTO "user" (id, name, email, email_verified, image, locale, created_at, updated_at, is_anonymous, role, banned, ban_reason, ban_expires)
		VALUES ('u-src-1', 'Ada Source', 'ada@src.test', true, null, 'en', '2025-06-01 10:00:00', '2025-06-02 11:00:00', false, 'admin', false, null, null)`;
	await s`INSERT INTO "user" (id, name, email, email_verified, image, locale, created_at, updated_at)
		VALUES ('u-src-2', 'Lin Source', 'lin@src.test', false, null, null, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	const bcryptHash =
		"$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
	await s`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES ('a-src-1', 'a-src-1', 'credential', 'u-src-1', ${bcryptHash}, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization (id, name, slug, logo, metadata, description, repos_enabled, tables_enabled, work_enabled, default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, ai_provider_base_url, ai_provider_model, ai_provider_api_key, created_at)
		VALUES ('o-src-1', 'Source Org', 'source-org', null, null, 'desc', true, false, false, 'manage', false, 1024, 4000, null, null, null, '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_member (id, organization_id, user_id, role, ai_token_limit, ai_character_limit, joined_at)
		VALUES ('om-src-1', 'o-src-1', 'u-src-1', 'owner', null, null, '2025-06-01 10:00:00')`;
	await s`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
		VALUES ('or-src-1', 'o-src-1', 'viewer', ${JSON.stringify({ board: ["read"] })}, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await s`INSERT INTO team (id, name, organization_id, source, icon, parent_team_id, created_at, updated_at)
		VALUES ('t-src-1', 'Core', 'o-src-1', 'kaneo', 'rocket', null, '2025-06-01 10:00:00', null)`;
	await s`INSERT INTO team (id, name, organization_id, source, icon, parent_team_id, created_at, updated_at)
		VALUES ('t-src-2', 'Sub', 'o-src-1', 'kaneo', null, 't-src-1', '2025-06-01 10:00:00', null)`;
	await s`INSERT INTO team_member (id, team_id, user_id, created_at)
		VALUES ('tm-src-1', 't-src-1', 'u-src-1', '2025-06-01 10:00:00')`;
	await s`INSERT INTO invitation (id, organization_id, email, role, team_id, status, expires_at, created_at, inviter_id)
		VALUES ('i-src-1', 'o-src-1', 'new@src.test', 'member', null, 'pending', '2026-12-31 00:00:00', '2025-06-01 10:00:00', 'u-src-1')`;
	await s`INSERT INTO apikey (id, config_id, name, start, reference_id, prefix, "key", enabled, expires_at, permissions, created_at, updated_at)
		VALUES ('k-src-1', 'default', 'legacy key', 'n2f7Kp9Q', 'u-src-1', 'kaneo', ${RAW_KEY_DIGEST}, true, null, null, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	const avatarBytes = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
	]);
	await s`INSERT INTO user_avatar (id, user_id, mime_type, size, data, created_at, updated_at)
		VALUES ('av-src-1', 'u-src-1', 'image/png', ${avatarBytes.length}, ${avatarBytes}, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;

	const { importIdentity, fixtureSourceId } = await import(
		"../../packages/domain/src/identity/import"
	);
	const run1 = await importIdentity(s, ctx.sql, fixtureSourceId("t23"));
	expect(run1.status).toBe("imported");
	expect(run1.tableCounts.user).toBe(2);
	expect(run1.tableCounts.apikey).toBe(1);
	expect(run1.eventCount).toBeGreaterThan(0);

	// All-column exactness for sampled rows (hashes verbatim, timestamps
	// unperturbed, bytes exact).
	const acct = await ctx.sql`SELECT * FROM account WHERE id='a-src-1'`;
	expect(acct[0]?.password).toBe(bcryptHash);
	const av =
		await ctx.sql`SELECT size, data FROM user_avatar WHERE id='av-src-1'`;
	expect(av[0]?.size).toBe(avatarBytes.length);
	expect(Buffer.from(av[0]?.data ?? "").equals(avatarBytes)).toBe(true);
	const importedKey =
		await ctx.sql`SELECT "key" FROM apikey WHERE id='k-src-1'`;
	expect(importedKey[0]?.key).toBe(RAW_KEY_DIGEST);
	const teamSub =
		await ctx.sql`SELECT parent_team_id FROM team WHERE id='t-src-2'`;
	expect(teamSub[0]?.parent_team_id).toBe("t-src-1");

	// Structural rows derived per key/org.
	const principals =
		await ctx.sql`SELECT id, kind, user_id, apikey_id FROM principal WHERE kind='agent'`;
	expect(principals).toHaveLength(1);
	expect(principals[0]?.apikey_id).toBe("k-src-1");
	const grants =
		await ctx.sql`SELECT count(*)::int AS n FROM identity_grant WHERE org_id='o-src-1'`;
	expect(Number(grants[0]?.n)).toBeGreaterThan(0);

	// Identical rerun: zero new events, zero changed rows.
	const eventsBefore = await ctx.sql`SELECT count(*)::int AS n FROM event`;
	const run2 = await importIdentity(s, ctx.sql, fixtureSourceId("t23"));
	expect(run2.status).toBe("unchanged");
	const eventsAfter = await ctx.sql`SELECT count(*)::int AS n FROM event`;
	expect(Number(eventsAfter[0]?.n)).toBe(Number(eventsBefore[0]?.n));

	// No secrets/PII in report output.
	const report = JSON.stringify([run1, run2]);
	expect(report).not.toContain(RAW_KEY);
	expect(report).not.toContain(bcryptHash);
	expect(report).not.toContain("ada@src.test");
});
