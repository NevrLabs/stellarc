import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §4 / review c9 defect 1: the nine identity projections are
// org-scoped, capability-filtered shapes on the stock /orgs/:org/v1/shape
// endpoint. This suite exercises the ShapeEngine against real identity data
// through the same Electric message contract as the frozen probe path.

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

const ORG = "org-shapes-1";

async function seedOrg() {
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-s1', 'Shape Owner', 'owner@shapes.test', true, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES (${ORG}, 'Shapes Org', 'shapes-org', false, false, false, 'manage', false, 1024, 4000, '2025-06-01 10:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-s1', ${ORG}, 'u-s1', 'owner', '2025-06-01 10:00:00')`;
}

async function page(
	engine: unknown,
	table: string,
	params: Record<string, string> = {},
) {
	const url = new URL(
		`http://test/orgs/${ORG}/v1/shape?table=${table}&offset=-1`,
	);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	const response = await (
		engine as unknown as {
			shape: (org: string, url: URL) => Promise<Response>;
		}
	).shape(ORG, url);
	return response;
}

test("identity shape snapshot serves org-scoped rows for the nine projections", async () => {
	await seedOrg();
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const engine = new ShapeEngine(sql);

	for (const table of [
		"organization",
		"organization_member",
		"organization_role",
		"team",
		"team_member",
		"invitation",
		"apikey",
		"principal",
		"user",
	]) {
		const response = await page(engine, table);
		expect(response.status, table).toBe(200);
		const messages = (await response.json()) as Array<{
			headers: Record<string, unknown>;
			value?: Record<string, unknown>;
		}>;
		expect(
			messages.some((m) => m.headers.control === "up-to-date"),
			table,
		).toBe(true);
	}
	// organization snapshot carries the org row; members carries the member.
	const orgResponse = await page(engine, "organization");
	const orgMessages = (await orgResponse.json()) as Array<{
		headers: { operation?: string };
		value?: { id?: string };
	}>;
	expect(orgMessages.some((m) => m.value?.id === ORG)).toBe(true);

	const memberResponse = await page(engine, "organization_member");
	const memberMessages = (await memberResponse.json()) as Array<{
		value?: { id?: string; organizationId?: string };
	}>;
	expect(memberMessages.some((m) => m.value?.id === "m-s1")).toBe(true);
});

test("unknown table still 404s; account/session/verification are never shapes", async () => {
	await seedOrg();
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const engine = new ShapeEngine(sql);
	for (const table of [
		"account",
		"session",
		"verification",
		"identity_grant",
		"nope",
	]) {
		const response = await page(engine, table);
		expect(response.status, table).toBe(404);
	}
});

test("secret columns never leak: apikey shape has no key digest or userId", async () => {
	await seedOrg();
	await sql`INSERT INTO apikey (id, config_id, name, reference_id, "key", created_at, updated_at)
		VALUES ('k-s1', 'default', 'shape-key', 'u-s1', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const engine = new ShapeEngine(sql);
	const response = await page(engine, "apikey");
	expect(response.status).toBe(200);
	const messages = (await response.json()) as Array<{
		value?: Record<string, unknown>;
	}>;
	const serialized = JSON.stringify(messages);
	expect(serialized).not.toContain(
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
	);
	expect(serialized).not.toMatch(/"(key|userId)":/);
});

test("tail delivers identity events after the snapshot boundary (member update)", async () => {
	await seedOrg();
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const engine = new ShapeEngine(sql);
	const initial = await page(engine, "organization_member");
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	expect(offset).toMatch(/^\d+_0$/);

	// A domain mutation (event-producing) after the boundary. A second
	// member is added first: the last owner cannot be demoted (correct
	// domain guard), so we mutate the non-owner member instead.
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('u-s2', 'Second Member', 'second@shapes.test', true, '2025-06-01 10:00:00', '2025-06-01 10:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-s2', ${ORG}, 'u-s2', 'member', '2025-06-01 10:05:00')`;
	// updateMemberRole writes grants for an existing principal only.
	await sql`INSERT INTO principal (id, kind, user_id)
		VALUES ('human:u-s2', 'human', 'u-s2')`;
	const { updateMemberRole } = await import(
		"../../packages/domain/src/identity/mutations"
	);
	await updateMemberRole(sql, ORG, "m-s2", "admin", "principal:human:u-s1");

	const url = new URL(
		`http://test/orgs/${ORG}/v1/shape?table=organization_member&offset=${offset}&handle=${handle}`,
	);
	const tail = await engine.shape(ORG, url);
	expect(tail.status).toBe(200);
	const messages = (await tail.json()) as Array<{
		headers: { operation?: string; txids?: number[] };
		value?: { id?: string; role?: string };
	}>;
	const update = messages.find((m) => m.value?.id === "m-s2");
	expect(update?.headers.operation).toBe("update");
	expect(update?.value?.role).toBe("admin");
	expect(update?.headers.txids?.[0]).toBeGreaterThan(0);
});
