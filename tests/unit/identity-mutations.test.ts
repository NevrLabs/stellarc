import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import {
	createOrganization,
	removeMember,
} from "../../packages/domain/src/identity/mutations";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T34 (org creation atomically seeds owner/defaults/principal
// grants/events; failed slug collision leaves no artifacts) and T14 (two
// concurrent last-owner removals cannot leave zero owners).

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

async function seedUser(id: string, email: string) {
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES (${id}, 'Creator', ${email}, true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
}

test("T34 createOrganization seeds owner membership, default roles, principal and grants in one tx", async () => {
	await seedUser("u-create-1", "creator@t34.test");
	const result = await createOrganization(sql, "u-create-1", {
		name: "Atom Org",
		slug: "atom-org",
	});
	expect(result.data.slug).toBe("atom-org");
	// §3 OrganizationPublic allowlist: the provider secret is never in `data`.
	expect("aiProviderApiKey" in result.data).toBe(false);
	expect(JSON.stringify(result.data)).not.toContain("aiProviderApiKey");
	expect(result.txid).toBeGreaterThan(0);

	const members =
		await sql`SELECT role FROM organization_member WHERE organization_id = ${String(result.data.id ?? "")}`;
	expect(members.map((m) => m.role).sort()).toEqual(["owner"]);
	const roles =
		await sql`SELECT role FROM organization_role WHERE organization_id = ${String(result.data.id ?? "")} ORDER BY role`;
	expect(roles.map((r) => r.role)).toEqual(["admin", "member", "viewer"]);
	const principal =
		await sql`SELECT id, kind FROM principal WHERE user_id = 'u-create-1'`;
	expect(principal).toHaveLength(1);
	expect(principal[0]?.kind).toBe("human");
	const grants =
		await sql`SELECT capability FROM identity_grant WHERE principal_id = ${principal[0]?.id}`;
	expect(grants.map((g) => g.capability)).toEqual(["org:member"]);

	// Events for the new org, sanitized public payloads. The actor is the
	// caller's stable principal id (human:<userId>), not the raw user id.
	const orgId = String(result.data.id);
	const events =
		await sql`SELECT plugin_type, actor FROM event WHERE org = ${orgId} ORDER BY seq`;
	for (const event of events) expect(event.actor).toBe("human:u-create-1");
	expect(events.map((e) => e.plugin_type).sort()).toEqual([
		"identity:grant-upserted",
		"identity:member-upserted",
		"identity:organization-upserted",
		"identity:principal-upserted",
		"identity:role-upserted",
		"identity:role-upserted",
		"identity:role-upserted",
	]);
	const payloads = await sql`SELECT payload FROM event WHERE org = ${orgId}`;
	for (const event of payloads) {
		const text = JSON.stringify(event.payload);
		expect(text).not.toContain("ai_provider_api_key");
		expect(text).not.toContain("aiProviderApiKey");
	}
});

test("T34 slug collision conflicts and leaves zero artifacts", async () => {
	await seedUser("u-create-2", "creator2@t34.test");
	await createOrganization(sql, "u-create-2", {
		name: "First Org",
		slug: "shared-slug",
	});
	const eventsBefore = await sql`SELECT count(*)::int AS n FROM event`;
	const failure = await createOrganization(sql, "u-create-2", {
		name: "Second Org",
		slug: "SHARED-SLUG",
	}).catch((error: unknown) => error);
	expect(failure).toMatchObject({
		_tag: "Conflict",
		code: "Duplicate",
	});
	const orgs =
		await sql`SELECT count(*)::int AS n FROM organization WHERE lower(slug) = 'shared-slug'`;
	expect(Number(orgs[0]?.n)).toBe(1);
	const roles = await sql`SELECT count(*)::int AS n FROM organization_role`;
	const eventsAfter = await sql`SELECT count(*)::int AS n FROM event`;
	// No events for the failed org beyond the first creation's.
	expect(Number(eventsAfter[0]?.n)).toBe(Number(eventsBefore[0]?.n));
	// Roles belong only to the first org.
	const firstOrg =
		await sql`SELECT id FROM organization WHERE lower(slug) = 'shared-slug'`;
	const rolesFirst =
		await sql`SELECT count(*)::int AS n FROM organization_role WHERE organization_id = ${firstOrg[0]?.id}`;
	expect(Number(roles[0]?.n)).toBe(Number(rolesFirst[0]?.n));
});

test("T14 concurrent removals cannot leave zero owners", async () => {
	await seedUser("u-owner-a", "ownera@t14.test");
	await seedUser("u-owner-b", "ownerb@t14.test");
	await createOrganization(sql, "u-owner-a", { name: "Duel", slug: "duel" });
	const org = (
		await sql<{ id: string }[]>`SELECT id FROM organization WHERE slug = 'duel'`
	)[0];
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-t14-b', ${org.id}, 'u-owner-b', 'owner', '2026-01-01 00:00:00')`;

	const [a, b] = await Promise.allSettled([
		removeMember(sql, org.id, "m-t14-b", "human:u-owner-a"),
		removeMember(
			sql,
			org.id,
			(
				await sql`SELECT id FROM organization_member WHERE organization_id = ${org.id} AND user_id = 'u-owner-a'`
			)[0]?.id ?? "",
			"human:u-owner-b",
		),
	]);
	const outcomes = [a, b].map((r) =>
		r.status === "fulfilled" ? "removed" : "conflict",
	);
	outcomes.sort();
	expect(outcomes).toEqual(["conflict", "removed"]);
	const owners =
		await sql`SELECT count(*)::int AS n FROM organization_member WHERE organization_id = ${org.id} AND role = 'owner'`;
	expect(Number(owners[0]?.n)).toBe(1);
});

test("T14 removing the only owner is always blocked", async () => {
	await seedUser("u-solo", "solo@t14.test");
	await createOrganization(sql, "u-solo", { name: "Solo", slug: "solo" });
	const org = (
		await sql<{ id: string }[]>`SELECT id FROM organization WHERE slug = 'solo'`
	)[0];
	const member = (
		await sql`SELECT id FROM organization_member WHERE organization_id = ${org.id} AND role = 'owner'`
	)[0];
	const failure = await removeMember(
		sql,
		org.id,
		String(member?.id),
		"human:u-solo",
	).catch((error: unknown) => error);
	expect(failure).toMatchObject({ _tag: "Conflict", code: "LastOwner" });
	const owners =
		await sql`SELECT count(*)::int AS n FROM organization_member WHERE organization_id = ${org.id} AND role = 'owner'`;
	expect(Number(owners[0]?.n)).toBe(1);
});

test("T10 removeMember emits identity:member-deleted under the authenticated principal actor", async () => {
	await seedUser("u-rm-a", "rma@actor.test");
	await seedUser("u-rm-b", "rmb@actor.test");
	await createOrganization(sql, "u-rm-a", {
		name: "ActorOrg",
		slug: "actor-org",
	});
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('m-actor-b', (SELECT id FROM organization WHERE slug = 'actor-org'), 'u-rm-b', 'member', '2026-01-01 00:00:00')`;
	const result = await removeMember(
		sql,
		"actor-org",
		"m-actor-b",
		"human:u-rm-a",
	);
	expect(result.data).toEqual({ id: "m-actor-b" });
	const events =
		await sql`SELECT actor, plugin_type FROM event WHERE org = (SELECT id FROM organization WHERE slug = 'actor-org') AND plugin_type = 'identity:member-deleted'`;
	expect(events).toHaveLength(1);
	expect(events[0]?.actor).toBe("human:u-rm-a");
});

test("T10 removeMember without an authenticated actor is rejected", async () => {
	await seedUser("u-rm-c", "rmc@actor.test");
	await createOrganization(sql, "u-rm-c", {
		name: "NoActor",
		slug: "no-actor",
	});
	const member = (
		await sql`SELECT id FROM organization_member WHERE organization_id = (SELECT id FROM organization WHERE slug = 'no-actor')`
	)[0];
	const failure = await removeMember(
		sql,
		"no-actor",
		String(member?.id),
		"",
	).catch((error: unknown) => error);
	// §3 error union: Unauthenticated is its own tag, not a Conflict code.
	expect(failure).toMatchObject({ _tag: "Unauthenticated" });
	const deleted =
		await sql`SELECT count(*)::int AS n FROM organization_member WHERE id = ${String(member?.id)}`;
	expect(Number(deleted[0]?.n)).toBe(1);
});
