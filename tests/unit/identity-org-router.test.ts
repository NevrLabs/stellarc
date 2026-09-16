import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import { orgRouter } from "../../packages/domain/src/identity/org-router";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T08: OrgRouter returns {schema:"public", orgId} only after
// verifying existence and caller membership; unknown org fails; an
// injection-like org ID never becomes an SQL identifier.

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

async function seedOrg(orgId: string, slug: string) {
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-router', 'Router User', 'router@t08.test', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES (${orgId}, 'Router Org', ${slug}, false, false, false, 'manage', false, 1024, 4000, '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-router', ${orgId}, 'u-router', 'member', '2026-01-01 00:00:00')`;
}

test("T08 resolve returns public schema binding plus bound org ID for a member", async () => {
	await seedOrg("o-t08", "router-org");
	const resolved = await orgRouter(sql, "u-router", "o-t08");
	expect(resolved).toEqual({ schema: "public", orgId: "o-t08" });
});

test("T08 unknown org fails closed", async () => {
	const result = await orgRouter(sql, "u-router", "o-missing").catch(
		(error: unknown) => error,
	);
	expect(result).toMatchObject({ _tag: "NotFound" });
});

test("T08 non-member caller gets Forbidden, not the binding", async () => {
	await seedOrg("o-t08b", "router-org-b");
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-outsider', 'Outsider', 'out@t08.test', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	const result = await orgRouter(sql, "u-outsider", "o-t08b").catch(
		(error: unknown) => error,
	);
	expect(result).toMatchObject({ _tag: "Forbidden" });
});

test("T08 injection-like org ID is rejected as a value, never used as an identifier", async () => {
	await seedOrg("o-t08c", "router-org-c");
	for (const malicious of [
		"o; DROP TABLE organization; --",
		'o-t08c" OR "1"="1',
		"public.organization",
		"",
		// Quote-breaking vector: under interpolation this becomes
		// WHERE id = 'o' OR '1'='1' and resolves ANY org; under binding
		// it is just an absent literal ID.
		"o' OR '1'='1",
		"o-t08c' AND '1'='2",
	]) {
		const result = await orgRouter(sql, "u-router", malicious).catch(
			(error: unknown) => error,
		);
		expect(result).toMatchObject({ _tag: "NotFound" });
	}
	// The table survived the injection attempts.
	const orgs = await sql`SELECT count(*)::int AS n FROM organization`;
	expect(Number(orgs[0]?.n)).toBe(1);
});
