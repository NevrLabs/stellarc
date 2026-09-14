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
	await sql`INSERT INTO organization_role (id, organization_id, role, permission, created_at, updated_at)
		VALUES ('role-http-viewer', ${ORG}, 'viewer', '{}', '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
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
