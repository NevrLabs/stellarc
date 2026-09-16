import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import { makeAuth } from "../../packages/domain/src/better-auth";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T29/T07: identity HTTP routes decode real requests/responses
// through the §3 error union; org switch validates membership; foreign orgs
// return the same 404 as absent entities; unauthenticated is 401.

let sql: Sql;
let handler: (request: Request) => Promise<Response>;
const resources: Array<() => Promise<void>> = [];

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	resources.push(db.close);
	await runMigration(sql);
	const auth = makeAuth(sql, {
		secret: "test-secret-do-not-use-in-production-0123456789",
		baseURL: "http://127.0.0.1:4173",
	});
	const { identityHandler } = await import(
		"../../apps/stellarc-api/src/identity-http"
	);
	handler = identityHandler(sql, auth);
});

afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

const ORG = "org-http-1";
const USER = "u-http-1";

async function seed() {
	const bcrypt = await import("bcryptjs");
	const hash = await bcrypt.hash("correct-horse-battery", 10);
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES (${USER}, 'Http User', 'http@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES ('acc-http-1', 'acc-http-1', 'credential', ${USER}, ${hash}, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES (${ORG}, 'Http Org', 'http-org', false, false, false, 'manage', false, 1024, 4000, '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-http-1', ${ORG}, ${USER}, 'owner', '2026-01-01 00:00:00')`;
	// Structural projection exactly as the importer/org-create provisions it
	// (§2: human principal + org:member structural grant).
	await sql`INSERT INTO principal (id, kind, user_id, apikey_id)
		VALUES ('human:' || ${USER}, 'human', ${USER}, null)
		ON CONFLICT (id) DO NOTHING`;
	await sql`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
		VALUES ('role-http-viewer', ${ORG}, 'viewer', '{}', '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	// Owner capability set (static role caps ∩ structural grant).
	const ownerCaps = [
		"org:member",
		"organization:read",
		"organization:update",
		"organization:manage_settings",
		"organization:manage_connections",
		"organization:manage_members",
		"member:read",
		"member:create",
		"member:update",
		"member:delete",
		"invitation:read",
		"invitation:create",
		"invitation:update",
		"team:read",
		"team:create",
		"team:update",
		"team:delete",
		"apikey:read",
		"apikey:create",
		"apikey:delete",
	];
	for (const cap of ownerCaps) {
		await sql`INSERT INTO identity_grant (org_id, principal_id, capability)
			VALUES (${ORG}, 'human:' || ${USER}, ${cap})
			ON CONFLICT DO NOTHING`;
	}
}

async function signIn() {
	const auth = makeAuth(sql, {
		secret: "test-secret-do-not-use-in-production-0123456789",
		baseURL: "http://127.0.0.1:4173",
	});
	const { makeAuthHandler } = await import(
		"../../apps/stellarc-api/src/auth-http"
	);
	const authHandler = makeAuthHandler(auth);
	const response = await authHandler(
		new Request("http://127.0.0.1:4173/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "http@test.invalid",
				password: "correct-horse-battery",
			}),
		}),
	);
	expect(response.status).toBe(200);
	const cookie = response.headers.get("set-cookie") ?? "";
	return cookie.split(";")[0];
}

async function get(path: string, cookie = "") {
	return handler(
		new Request(`http://127.0.0.1:4173${path}`, {
			headers: cookie ? { cookie } : {},
		}),
	);
}

test("unauthenticated identity requests are 401 with the error union", async () => {
	await seed();
	const response = await get("/api/identity/orgs/org-http-1/members");
	expect(response.status).toBe(401);
	const body = await response.json();
	expect(body._tag).toBe("Unauthenticated");
});

test("membership-authorized routes: members list, org list, active-org switch (T07)", async () => {
	await seed();
	const cookie = await signIn();

	const members = await get(`/api/identity/orgs/${ORG}/members`, cookie);
	expect(members.status).toBe(200);
	const membersBody = await members.json();
	expect(membersBody.members).toHaveLength(1);
	expect(membersBody.members[0].role).toBe("owner");
	expect(membersBody.members[0].user.email).toBe("http@test.invalid");
	expect(membersBody.members[0].principalId).toBe(`human:${USER}`);

	const orgs = await get("/api/identity/organizations", cookie);
	expect(orgs.status).toBe(200);
	const orgsBody = await orgs.json();
	expect(orgsBody.organizations).toHaveLength(1);
	// §3: the provider secret never appears in OrganizationPublic.
	expect(JSON.stringify(orgsBody)).not.toContain("aiProviderApiKey");

	const switchRes = await handler(
		new Request("http://127.0.0.1:4173/api/identity/active-org", {
			method: "POST",
			headers: { "content-type": "application/json", cookie },
			body: JSON.stringify({ organizationId: ORG }),
		}),
	);
	expect(switchRes.status).toBe(200);
	const switched = await switchRes.json();
	expect(switched.organization.id).toBe(ORG);
	// Session row actually updated.
	const session = await sql`SELECT active_organization_id FROM session`;
	expect(session[0]?.active_organization_id).toBe(ORG);
});

test("org switch to a foreign org is Forbidden; unknown org is 404 (T07)", async () => {
	await seed();
	const cookie = await signIn();
	// Second org the user does NOT belong to.
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES ('org-http-2', 'Other Org', 'other-org', false, false, false, 'manage', false, 1024, 4000, '2026-01-01 00:00:00')`;
	const foreign = await handler(
		new Request("http://127.0.0.1:4173/api/identity/active-org", {
			method: "POST",
			headers: { "content-type": "application/json", cookie },
			body: JSON.stringify({ organizationId: "org-http-2" }),
		}),
	);
	expect(foreign.status).toBe(403);
	expect((await foreign.json())._tag).toBe("Forbidden");

	const absent = await handler(
		new Request("http://127.0.0.1:4173/api/identity/active-org", {
			method: "POST",
			headers: { "content-type": "application/json", cookie },
			body: JSON.stringify({ organizationId: "org-absent" }),
		}),
	);
	expect(absent.status).toBe(404);
	expect((await absent.json())._tag).toBe("NotFound");
});

test("member removal endpoint: last owner is Conflict LastOwner; happy path deletes with txid (T14/T10)", async () => {
	await seed();
	const cookie = await signIn();
	const last = await handler(
		new Request(
			`http://127.0.0.1:4173/api/identity/orgs/${ORG}/members/mem-http-1`,
			{
				method: "DELETE",
				headers: { cookie },
			},
		),
	);
	expect(last.status).toBe(409);
	const body = await last.json();
	expect(body._tag).toBe("Conflict");
	expect(body.code).toBe("LastOwner");

	// Add a second owner, then removal succeeds.
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-http-2', 'Second', 'second@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-http-2', ${ORG}, 'u-http-2', 'owner', '2026-01-01 00:00:00')`;
	const ok = await handler(
		new Request(
			`http://127.0.0.1:4173/api/identity/orgs/${ORG}/members/mem-http-1`,
			{
				method: "DELETE",
				headers: { cookie },
			},
		),
	);
	expect(ok.status).toBe(200);
	const deleted = await ok.json();
	expect(deleted.data.id).toBe("mem-http-1");
	expect(deleted.txid).toBeGreaterThan(0);
	const rows =
		await sql`SELECT count(*)::int AS n FROM organization_member WHERE id = 'mem-http-1'`;
	expect(Number(rows[0]?.n)).toBe(0);
});

test("foreign-org member list is the same 404 as an absent org (§3)", async () => {
	await seed();
	const cookie = await signIn();
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES ('org-http-2', 'Other Org', 'other-org', false, false, false, 'manage', false, 1024, 4000, '2026-01-01 00:00:00')`;
	const foreign = await get("/api/identity/orgs/org-http-2/members", cookie);
	expect(foreign.status).toBe(404);
	const foreignBody = await foreign.json();
	expect(foreignBody._tag).toBe("NotFound");
	const absent = await get("/api/identity/orgs/org-absent/members", cookie);
	expect(absent.status).toBe(404);
	const absentBody = await absent.json();
	expect(foreignBody).toEqual(absentBody);
});

test("unsupported identity paths fail closed with 404 (T29)", async () => {
	await seed();
	const cookie = await signIn();
	const res = await get("/api/identity/orgs/org-http-1/nonexistent", cookie);
	expect(res.status).toBe(404);
	const res2 = await get("/api/identity/stuff", cookie);
	expect(res2.status).toBe(404);
});

test("roles list decodes through RolePublic with parsed permission (T15 read side)", async () => {
	await seed();
	const cookie = await signIn();
	const res = await get(`/api/identity/orgs/${ORG}/roles`, cookie);
	expect(res.status).toBe(200);
	const body = await res.json();
	expect(body.roles).toHaveLength(1);
	expect(body.roles[0].role).toBe("viewer");
	expect(body.roles[0].permission).toEqual({});
});

test("avatar round-trips exact bytes/MIME/length; unrelated user is 404 (T22)", async () => {
	await seed();
	const cookie = await signIn();
	const bytes = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
	]);
	await sql`INSERT INTO user_avatar (id, user_id, mime_type, size, data, created_at, updated_at)
		VALUES ('av-http-1', ${USER}, 'image/png', ${bytes.length}, ${bytes}, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	const ok = await get(`/api/identity/users/${USER}/avatar`, cookie);
	expect(ok.status).toBe(200);
	expect(ok.headers.get("content-type")).toBe("image/png");
	expect(ok.headers.get("content-length")).toBe(String(bytes.length));
	expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
	const body = Buffer.from(await ok.arrayBuffer());
	expect(body.equals(bytes)).toBe(true);

	// Unrelated user (no shared org) is the same 404 as a missing avatar.
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-stranger', 'Stranger', 'stranger@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	const stranger = await get("/api/identity/users/u-stranger/avatar", cookie);
	expect(stranger.status).toBe(404);
	const missing = await get(
		`/api/identity/users/${USER}/avatar`.replace(USER, "u-nobody"),
		cookie,
	);
	expect(missing.status).toBe(404);
});

// --- Rework c4: D1/D2/D9/D10 ---------------------------------------------------

async function seedAgentKey(
	permissions: string | null,
	opts: { keyId?: string; banned?: boolean } = {},
) {
	const { apiKeyDigest } = await import(
		"../../packages/domain/src/identity/auth"
	);
	const raw = `stl15-agent-raw-${opts.keyId ?? Math.random().toString(36).slice(2)}`;
	if (opts.banned) {
		// Banned owners never reach the mutation path; the raw key must fail
		// authentication outright (T03), so mint nothing.
		await sql`UPDATE "user" SET banned = true WHERE id = ${USER}`;
		const { apiKeyDigest: bannedDigest } = await import(
			"../../packages/domain/src/identity/auth"
		);
		await sql`INSERT INTO apikey (id, config_id, name, reference_id, prefix, "key", permissions, enabled, created_at, updated_at)
			VALUES ('key-c4-banned', 'cfg-c4', 'Agent Key', ${USER}, 'stl15_', ${bannedDigest(raw)}, ${permissions}, true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
		return { raw, keyId: "key-c4-banned" };
	}
	// Rework c10 (defects 4/5): authenticateApiKey is read-only, so the
	// agent principal + ceiling-derived grants exist ONLY through the
	// createApiKey mutation path. The fixture provisions through that same
	// path and reports the minted id (no FK-circular renames).
	const { createApiKey } = await import(
		"../../packages/domain/src/identity/mutations"
	);
	const parsed = permissions === null ? {} : JSON.parse(permissions);
	const created = await createApiKey(
		sql,
		ORG,
		{ name: "Agent Key", permissions: parsed, expiresAt: null },
		{ principalId: `human:${USER}`, kind: "human", userId: USER },
	);
	const mintedId = String(
		(created.data.key as { id: string; secret: string }).id,
	);
	// Pin the stored digest to the fixture's raw key so the suite signs with
	// it; the id stays the minted one.
	await sql`UPDATE apikey SET "key" = ${apiKeyDigest(raw)} WHERE id = ${mintedId}`;
	return { raw, keyId: mintedId };
}

function agentGet(path: string, rawKey: string) {
	return handler(
		new Request(`http://127.0.0.1:4173${path}`, {
			headers: { "x-api-key": rawKey },
		}),
	);
}

test("D2 agent key with read-only ceiling cannot remove members (no owner authority)", async () => {
	await seed();
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-http-2', 'Second', 'second@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-http-2', ${ORG}, 'u-http-2', 'member', '2026-01-01 00:00:00')`;
	const { raw } = await seedAgentKey(
		JSON.stringify({ organization: ["read"] }),
	);
	const res = await handler(
		new Request(
			`http://127.0.0.1:4173/api/identity/orgs/${ORG}/members/mem-http-2`,
			{ method: "DELETE", headers: { "x-api-key": raw } },
		),
	);
	expect(res.status).toBe(403);
	expect((await res.json())._tag).toBe("Forbidden");
	// The member is still there.
	const rows =
		await sql`SELECT count(*)::int AS n FROM organization_member WHERE id = 'mem-http-2'`;
	expect(Number(rows[0]?.n)).toBe(1);
});

test("D2 agent key with manage_members ceiling CAN remove members; reads work with read ceiling", async () => {
	await seed();
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-http-2', 'Second', 'second@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-http-2', ${ORG}, 'u-http-2', 'member', '2026-01-01 00:00:00')`;
	// read ceiling grants the member list
	const { raw: readRaw } = await seedAgentKey(
		JSON.stringify({ organization: ["read"] }),
		{ keyId: "key-c4-read" },
	);
	const list = await agentGet(`/api/identity/orgs/${ORG}/members`, readRaw);
	expect(list.status).toBe(200);

	const { raw } = await seedAgentKey(
		JSON.stringify({ organization: ["read", "manage_members"] }),
		{ keyId: "key-c4-mgmt" },
	);
	const res = await handler(
		new Request(
			`http://127.0.0.1:4173/api/identity/orgs/${ORG}/members/mem-http-2`,
			{ method: "DELETE", headers: { "x-api-key": raw } },
		),
	);
	expect(res.status).toBe(200);
	const body = await res.json();
	expect(body.data.id).toBe("mem-http-2");
});

test("D2 banned owner denies the agent key path", async () => {
	await seed();
	const { raw } = await seedAgentKey(
		JSON.stringify({ organization: ["read"] }),
		{
			keyId: "key-c4-ban",
			banned: true,
		},
	);
	const res = await agentGet(`/api/identity/orgs/${ORG}/members`, raw);
	expect(res.status).toBe(401);
});

test("D1 apikey listing is org-scoped: agent sees only its own key, and only in orgs it holds grants", async () => {
	await seed();
	// second org the owner belongs to
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES ('org-http-2', 'Other Org', 'other-org', false, false, false, 'manage', false, 1024, 4000, '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-http-x2', 'org-http-2', ${USER}, 'owner', '2026-01-01 00:00:00')`;
	// a second key owned by the same user (must NOT appear for the agent)
	await seedAgentKey(JSON.stringify({ organization: ["read"] }), {
		keyId: "key-c4-other",
	});
	const { raw, keyId } = await seedAgentKey(
		JSON.stringify({ organization: ["read"] }),
		{ keyId: "key-c4-self" },
	);
	// Human sees own keys (both).
	const cookie = await signIn();
	const humanList = await get(`/api/identity/orgs/${ORG}/apikeys`, cookie);
	expect(humanList.status).toBe(200);
	const humanBody = await humanList.json();
	expect(humanBody.keys).toHaveLength(2);
	// Agent sees ONLY its own key (never the owner's other key).
	const agentList = await agentGet(`/api/identity/orgs/${ORG}/apikeys`, raw);
	expect(agentList.status).toBe(200);
	const agentBody = await agentList.json();
	expect(agentBody.keys).toHaveLength(1);
	expect(agentBody.keys[0].id).toBe(keyId);
});

test("D9 unsupported method on a known identity path is 405 with Allow", async () => {
	await seed();
	const cookie = await signIn();
	const res = await handler(
		new Request(`http://127.0.0.1:4173/api/identity/orgs/${ORG}/members`, {
			method: "POST",
			headers: { cookie, "content-type": "application/json" },
			body: "{}",
		}),
	);
	expect(res.status).toBe(405);
	expect(res.headers.get("allow")).toBeTruthy();
	// Unsupported PATH is still 404 (fail closed).
	const res2 = await get(`/api/identity/orgs/${ORG}/nonexistent`, cookie);
	expect(res2.status).toBe(404);
});

test("D10 org slug is bounded to 256 chars on create", async () => {
	await seed();
	await sql`UPDATE "user" SET role = 'admin' WHERE id = ${USER}`;
	const cookie = await signIn();
	const res = await handler(
		new Request("http://127.0.0.1:4173/api/identity/organizations", {
			method: "POST",
			headers: { cookie, "content-type": "application/json" },
			body: JSON.stringify({
				name: "Bound Test",
				slug: "x".repeat(257),
			}),
		}),
	);
	expect(res.status).toBe(400);
	expect((await res.json())._tag).toBe("ValidationError");
});

// --- Rework c12 (D8): Schema decode / excess-write-key rejection ------------------------

test("D8 write bodies decode through contracts schemas; excess keys rejected (role create)", async () => {
	await seed();
	const cookie = await signIn();
	// Excess property on a write body must be rejected, not silently dropped.
	const response = await handler(
		new Request(`http://127.0.0.1:4173/api/identity/orgs/${ORG}/roles`, {
			method: "POST",
			headers: { "content-type": "application/json", cookie },
			body: JSON.stringify({
				role: "schema-probe",
				permission: { organization: ["read"] },
				admin: true, // excess write key
			}),
		}),
	);
	expect(response.status).toBe(400);
	const body = (await response.json()) as { _tag: string };
	expect(body._tag).toBe("ValidationError");
	// Nothing was written.
	const [row] = await sql`SELECT id FROM organization_role
		WHERE organization_id = ${ORG} AND role = 'schema-probe'`;
	expect(row).toBeUndefined();
});

test("D8 invitation create validates email format through the schema", async () => {
	await seed();
	const cookie = await signIn();
	const response = await handler(
		new Request(`http://127.0.0.1:4173/api/identity/orgs/${ORG}/invitations`, {
			method: "POST",
			headers: { "content-type": "application/json", cookie },
			body: JSON.stringify({ email: "not-an-email", role: "member" }),
		}),
	);
	expect(response.status).toBe(400);
	const body = (await response.json()) as { _tag: string };
	expect(body._tag).toBe("ValidationError");
});

test("D8 team create rejects nonempty bounded name violations via schema", async () => {
	await seed();
	const cookie = await signIn();
	const response = await handler(
		new Request(`http://127.0.0.1:4173/api/identity/orgs/${ORG}/teams`, {
			method: "POST",
			headers: { "content-type": "application/json", cookie },
			body: JSON.stringify({ name: "" }),
		}),
	);
	expect(response.status).toBe(400);
});
