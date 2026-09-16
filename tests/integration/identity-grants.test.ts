import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import {
	agentPrincipalId,
	apiKeyDigest,
} from "../../packages/domain/src/identity/auth";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §2/§7 rework c10: the rework-9 review's defect 4 negative control.
// authenticateApiKey must be READ-ONLY (defect 5): grants exist only via
// createApiKey/importer, so the capabilities.ts intersection can actually
// remove a capability the ceiling still names (T06 control goes red).
// Defect 6: removeMember revokes every principal derived from the removed
// user's keys (T12 at the domain layer). Defect 7: humans authorize through
// membership role PLUS structural org:member - a fresh org owner is not
// locked out. Defect 13: role changes re-derive grants with events.

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

const ORG = "org-c10";
const USER = "u-c10";

async function seedOrgAndOwner() {
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES (${USER}, 'Owner', 'owner@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES (${ORG}, 'C10 Org', 'c10-org', false, false, false, 'manage', false, 1024, 4000, '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-c10-1', ${ORG}, ${USER}, 'owner', '2026-01-01 00:00:00')`;
}

async function seedAgentKey(
	permissions: string | null,
	keyId: string,
	userId = USER,
) {
	const raw = `stl15-c10-${keyId}`;
	await sql`INSERT INTO apikey (id, config_id, name, reference_id, prefix, "key", permissions, enabled, created_at, updated_at)
		VALUES (${keyId}, 'cfg-c10', 'Agent Key', ${userId}, 'stl15_', ${apiKeyDigest(raw)}, ${permissions}, true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	return raw;
}

// --- Defect 5 / negative-control root cause (D4) -----------------------------

test("authenticateApiKey performs NO writes: no principal, no grants", async () => {
	await seedOrgAndOwner();
	const raw = await seedAgentKey(
		JSON.stringify({ organization: ["read"] }),
		"key-c10-a",
	);
	const { authenticateApiKey } = await import(
		"../../packages/domain/src/identity/auth"
	);
	const before = Number(
		(await sql`SELECT count(*)::int AS n FROM identity_grant`)[0].n,
	);
	const result = await authenticateApiKey(sql, raw);
	expect(result).not.toBeNull();
	expect(result?.principal.id).toBe(agentPrincipalId("key-c10-a"));
	// Read-only: no structural rows were minted from the key ceiling.
	const grants = Number(
		(await sql`SELECT count(*)::int AS n FROM identity_grant`)[0].n,
	);
	expect(grants).toBe(before);
	const principals =
		await sql`SELECT id FROM principal WHERE id = ${agentPrincipalId("key-c10-a")}`;
	expect(principals).toHaveLength(0);
});

// --- Defect 4 / T06 negative control (union vs intersect) ----------------------

test("agent capability is ceiling INTERSECT structural: a ceiling grant without identity_grant authorizes nothing", async () => {
	await seedOrgAndOwner();
	const raw = await seedAgentKey(
		JSON.stringify({ organization: ["read"], member: ["delete"] }),
		"key-c10-b",
	);
	// Structural grants exist ONLY via createApiKey - none here. The ceiling
	// names member:delete, but no grant backs it, so the intersection removes
	// it. With the c9 mint-on-auth behavior this scenario is impossible.
	const { effectiveCapabilities } = await import(
		"../../packages/domain/src/identity/capabilities"
	);
	const caps = await effectiveCapabilities(
		sql,
		{
			principalId: agentPrincipalId("key-c10-b"),
			kind: "agent",
			userId: USER,
			keyCeiling: { organization: ["read"], member: ["delete"] },
			apikeyId: "key-c10-b",
		},
		ORG,
	);
	expect(caps.has("member:delete")).toBe(false);
	expect(caps.has("organization:read")).toBe(false);
	const ctx = await import("../../apps/stellarc-api/src/identity-context");
	const resolution = await ctx.resolveRequestContext(sql, {
		"x-api-key": raw,
	});
	expect(resolution.ok).toBe(true);
});

// --- Defect 7: fresh-org owner lockout ----------------------------------------

test("fresh createOrganization owner holds organization:update (role plus structural)", async () => {
	await seedOrgAndOwner();
	await sql`UPDATE "user" SET role = 'admin' WHERE id = ${USER}`;
	const { createOrganization } = await import(
		"../../packages/domain/src/identity/mutations"
	);
	const created = await createOrganization(sql, USER, {
		name: "Fresh",
		slug: "fresh-org",
	});
	expect(created.txid).toBeGreaterThan(0);
	const { effectiveCapabilities } = await import(
		"../../packages/domain/src/identity/capabilities"
	);
	const caps = await effectiveCapabilities(
		sql,
		{
			principalId: `human:${USER}`,
			kind: "human",
			userId: USER,
		},
		created.data.id as string,
	);
	expect(caps.has("organization:update")).toBe(true);
	expect(caps.has("org:member")).toBe(true);
	expect(caps.has("member:delete")).toBe(true);
});

// --- Defect 6: revocation hole (T12 domain layer) ------------------------------

test("removeMember deletes grants for the user's human principal AND every agent principal from their keys, with grant-deleted events", async () => {
	await seedOrgAndOwner();
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-c10-2', 'Second', 'second@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-c10-2', ${ORG}, 'u-c10-2', 'member', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO principal (id, kind, user_id, apikey_id)
		VALUES ('human:u-c10-2', 'human', 'u-c10-2', null)`;
	await sql`INSERT INTO identity_grant (org_id, principal_id, capability)
		VALUES (${ORG}, 'human:u-c10-2', 'org:member'), (${ORG}, 'human:u-c10-2', 'member:read')`;
	await sql`INSERT INTO apikey (id, config_id, name, reference_id, prefix, "key", permissions, enabled, created_at, updated_at)
		VALUES ('key-c10-2', 'cfg-c10-2', 'K', 'u-c10-2', 'stl15_', 'digest-c10', '{"organization":["read"]}', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO principal (id, kind, user_id, apikey_id)
		VALUES (${agentPrincipalId("key-c10-2")}, 'agent', 'u-c10-2', 'key-c10-2')`;
	await sql`INSERT INTO identity_grant (org_id, principal_id, capability)
		VALUES (${ORG}, ${agentPrincipalId("key-c10-2")}, 'org:member'), (${ORG}, ${agentPrincipalId("key-c10-2")}, 'organization:read')`;

	const { removeMember } = await import(
		"../../packages/domain/src/identity/mutations"
	);
	const result = await removeMember(sql, ORG, "mem-c10-2", "human:u-c10-1");
	expect(result.data.id).toBe("mem-c10-2");
	const remaining =
		await sql`SELECT principal_id FROM identity_grant WHERE org_id = ${ORG} AND (principal_id = 'human:u-c10-2' OR principal_id = ${agentPrincipalId("key-c10-2")})`;
	expect(remaining).toHaveLength(0);
	const events =
		await sql`SELECT plugin_type FROM event WHERE org = ${ORG} AND plugin_type = 'identity:grant-deleted'`;
	// 2 human + 2 agent grants revoked, each with a matching event.
	expect(events).toHaveLength(4);
});

// --- Defect 13: role-change grant drift -----------------------------------------

test("updateMemberRole to owner re-derives grants and emits grant-upserted; demotion revokes owner-granted capabilities", async () => {
	await seedOrgAndOwner();
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-c10-3', 'Third', 'third@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-c10-3', ${ORG}, 'u-c10-3', 'member', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO principal (id, kind, user_id, apikey_id)
		VALUES ('human:u-c10-3', 'human', 'u-c10-3', null)`;
	await sql`INSERT INTO identity_grant (org_id, principal_id, capability)
		VALUES (${ORG}, 'human:u-c10-3', 'org:member')`;

	const { updateMemberRole } = await import(
		"../../packages/domain/src/identity/mutations"
	);
	const promoted = await updateMemberRole(
		sql,
		ORG,
		"mem-c10-3",
		"owner",
		"human:u-c10-1",
	);
	expect(promoted.data.role).toBe("owner");
	const ownerCaps =
		await sql`SELECT capability FROM identity_grant WHERE org_id = ${ORG} AND principal_id = 'human:u-c10-3'`;
	const caps = new Set(ownerCaps.map((row) => row.capability));
	expect(caps.has("organization:update")).toBe(true);
	expect(caps.has("member:delete")).toBe(true);
	const upserts =
		await sql`SELECT count(*)::int AS n FROM event WHERE org = ${ORG} AND plugin_type = 'identity:grant-upserted'`;
	expect(Number(upserts[0].n)).toBeGreaterThan(0);

	const demoted = await updateMemberRole(
		sql,
		ORG,
		"mem-c10-3",
		"member",
		"human:u-c10-1",
	);
	expect(demoted.data.role).toBe("member");
	const afterCaps = new Set(
		(
			await sql`SELECT capability FROM identity_grant WHERE org_id = ${ORG} AND principal_id = 'human:u-c10-3'`
		).map((row) => row.capability),
	);
	expect(afterCaps.has("organization:update")).toBe(false);
	expect(afterCaps.has("member:delete")).toBe(false);
	expect(afterCaps.has("org:member")).toBe(true);
	const deletes =
		await sql`SELECT count(*)::int AS n FROM event WHERE org = ${ORG} AND plugin_type = 'identity:grant-deleted'`;
	expect(Number(deletes[0].n)).toBeGreaterThan(0);
});
