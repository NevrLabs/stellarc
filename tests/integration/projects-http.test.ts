import { Effect, Layer, ManagedRuntime } from "effect";
import type { Sql } from "postgres";
import { afterEach, expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

// Self-contained composition (mirrors test-server.ts) that also exposes the
// raw sql handle so projects fixtures can be seeded relationally.
async function startProjectsServer() {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const telemetry = TelemetryTest();
	const memoMap = await Effect.runPromise(Layer.makeMemoMap);
	const runtime = ManagedRuntime.make(telemetry.layer, memoMap);
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const http = foundationHandler(
		db.sql,
		new ShapeEngine(db.sql),
		(org, headers) => {
			if (!headers.authorization) return "unauthenticated";
			return headers.authorization.startsWith(`Bearer ${org} `)
				? "ok"
				: "forbidden";
		},
		undefined,
		telemetry.layer,
		memoMap,
		(org, authorization) => {
			const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
			return token.startsWith(`${org} `) ? token.slice(org.length + 1) : "";
		},
	);
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 30,
		fetch: (request) => http.handler(request),
	});
	return {
		url: server.url.origin,
		sql: db.sql,
		telemetry,
		async eventCount(org: string) {
			const [row] =
				await db.sql`SELECT count(*)::int AS count FROM event WHERE org=${org}`;
			return row.count as number;
		},
		async close() {
			server.stop(true);
			await http.dispose();
			await runtime.dispose();
			await db.close();
		},
	};
}

const resources: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of resources.splice(0).reverse()) await close();
});

async function seedOrg(
	sql: Sql,
	org: string,
	users: Array<[id: string, name: string]>,
) {
	for (const [id, name] of users)
		await sql`INSERT INTO "user" (id, name, email) VALUES (${id}, ${name}, ${`${id}@example.test`})`;
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES (${org}, ${`Org ${org}`}, ${org}, now())`;
	for (const [id] of users)
		await sql`INSERT INTO organization_member (id, organization_id, user_id, joined_at) VALUES (${`${org}-m-${id}`}, ${org}, ${id}, now())`;
}

function auth(org: string, principal: string) {
	return { authorization: `Bearer ${org} ${principal}` };
}

const json = (r: Response) => r.json() as Promise<unknown>;

test("T03a HTTP list: auth gate, org scope, empty list", async () => {
	const server = await startProjectsServer();
	resources.push(server.close);
	await seedOrg(server.sql, "orgA", [["user-1", "Ada"]]);

	const anon = await fetch(`${server.url}/api/project?organizationId=orgA`);
	expect(anon.status).toBe(401);
	const bad = await fetch(`${server.url}/api/project?organizationId=orgA`, {
		headers: { authorization: "Bearer orgB user-1" },
	});
	expect(bad.status).toBe(403);
	const ok = await fetch(`${server.url}/api/project?organizationId=orgA`, {
		headers: auth("orgA", "user-1"),
	});
	expect(ok.status).toBe(200);
	expect(await json(ok)).toEqual([]);
});

test("T03b HTTP resolve: canonical then alias, no-leak 404 identical bodies", async () => {
	const server = await startProjectsServer();
	resources.push(server.close);
	await seedOrg(server.sql, "orgA", [["user-1", "Ada"]]);
	await seedOrg(server.sql, "orgB", [["user-b1", "Bob"]]);
	const { createProject, renameProjectSlug } = await import(
		"../../packages/domain/src/projects"
	);
	const project = await createProject(server.sql, {
		organizationId: "orgA",
		name: "Alpha Rollout",
		summary: "s",
		leadUserId: "user-1",
		createdBy: "user-1",
	});
	await renameProjectSlug(server.sql, {
		id: project.id,
		organizationId: "orgA",
		slug: "alpha-two",
		userId: "user-1",
	});

	const canonical = (await json(
		await fetch(
			`${server.url}/api/project/resolve?organizationId=orgA&slug=Alpha-Two`,
			{ headers: auth("orgA", "user-1") },
		),
	)) as { slug: string; usedSlugAlias: boolean };
	expect(canonical.slug).toBe("alpha-two");
	expect(canonical.usedSlugAlias).toBe(false);

	const viaAlias = (await json(
		await fetch(
			`${server.url}/api/project/resolve?organizationId=orgA&slug=alpha-rollout`,
			{ headers: auth("orgA", "user-1") },
		),
	)) as { usedSlugAlias: boolean };
	expect(viaAlias.usedSlugAlias).toBe(true);

	const unknown = await fetch(
		`${server.url}/api/project/resolve?organizationId=orgA&slug=missing`,
		{ headers: auth("orgA", "user-1") },
	);
	const crossOrg = await fetch(
		`${server.url}/api/project/resolve?organizationId=orgB&slug=alpha-two`,
		{ headers: auth("orgB", "user-b1") },
	);
	expect(unknown.status).toBe(404);
	expect(crossOrg.status).toBe(404);
	// identical no-leak body for unknown and cross-org
	const unknownBody = await json(unknown);
	expect(unknownBody).toEqual(await json(crossOrg));

	const byId = await fetch(
		`${server.url}/api/project/${project.id}?organizationId=orgA`,
		{ headers: auth("orgA", "user-1") },
	);
	expect(byId.status).toBe(200);
	const crossId = await fetch(
		`${server.url}/api/project/${project.id}?organizationId=orgB`,
		{ headers: auth("orgB", "user-b1") },
	);
	expect(crossId.status).toBe(404);
	expect(await json(crossId)).toEqual(unknownBody);
});

test("T04 HTTP create: Mutation envelope, txid, validation, collision, lead check", async () => {
	const server = await startProjectsServer();
	resources.push(server.close);
	await seedOrg(server.sql, "orgA", [["user-1", "Ada"]]);
	await seedOrg(server.sql, "orgB", [["user-b1", "Bob"]]);

	const before = await server.eventCount("orgA");
	const res = await fetch(`${server.url}/api/project?organizationId=orgA`, {
		method: "POST",
		headers: { ...auth("orgA", "user-1"), "content-type": "application/json" },
		body: JSON.stringify({
			organizationId: "orgA",
			name: "Alpha Rollout",
			summary: "first",
			leadUserId: "user-1",
		}),
	});
	expect(res.status).toBe(200);
	const body = (await json(res)) as {
		data: { id: string; slug: string; status: string; leadUserName: string };
		txid: number;
	};
	expect(body.data.slug).toBe("alpha-rollout");
	expect(body.data.status).toBe("planned");
	expect(body.data.leadUserName).toBe("Ada");
	expect(Number.isFinite(body.txid)).toBe(true);
	expect(await server.eventCount("orgA")).toBe(before + 1);

	// invalid slug -> 400
	const badSlug = await fetch(`${server.url}/api/project?organizationId=orgA`, {
		method: "POST",
		headers: { ...auth("orgA", "user-1"), "content-type": "application/json" },
		body: JSON.stringify({
			organizationId: "orgA",
			name: "X",
			summary: "s",
			leadUserId: "user-1",
			slug: "9bad",
		}),
	});
	expect(badSlug.status).toBe(400);

	// duplicate slug -> 409
	const dup = await fetch(`${server.url}/api/project?organizationId=orgA`, {
		method: "POST",
		headers: { ...auth("orgA", "user-1"), "content-type": "application/json" },
		body: JSON.stringify({
			organizationId: "orgA",
			name: "Alpha Rollout 2",
			summary: "s",
			leadUserId: "user-1",
			slug: "alpha-rollout",
		}),
	});
	expect(dup.status).toBe(409);

	// alias-namespace collision: p1 renamed away leaves "alpha-rollout" as an
	// alias row; a new project claiming that slug must still 409
	const { renameProjectSlug } = await import(
		"../../packages/domain/src/projects"
	);
	const first = (await json(
		await fetch(`${server.url}/api/project?organizationId=orgA`, {
			method: "POST",
			headers: {
				...auth("orgA", "user-1"),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				organizationId: "orgA",
				name: "Alias Donor",
				summary: "s",
				leadUserId: "user-1",
				slug: "donor-slug",
			}),
		}),
	)) as { data: { id: string } };
	await renameProjectSlug(server.sql, {
		id: first.data.id,
		organizationId: "orgA",
		slug: "donor-renamed",
		userId: "user-1",
	});
	const aliasCollision = await fetch(
		`${server.url}/api/project?organizationId=orgA`,
		{
			method: "POST",
			headers: {
				...auth("orgA", "user-1"),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				organizationId: "orgA",
				name: "Alias Claim",
				summary: "s",
				leadUserId: "user-1",
				slug: "donor-slug",
			}),
		},
	);
	expect(aliasCollision.status).toBe(409);

	// cross-org lead -> 409
	const badLead = await fetch(`${server.url}/api/project?organizationId=orgA`, {
		method: "POST",
		headers: { ...auth("orgA", "user-1"), "content-type": "application/json" },
		body: JSON.stringify({
			organizationId: "orgA",
			name: "Cross",
			summary: "s",
			leadUserId: "user-b1",
		}),
	});
	expect(badLead.status).toBe(409);
});

test("T05+T06 HTTP update + rename slug via API", async () => {
	const server = await startProjectsServer();
	resources.push(server.close);
	await seedOrg(server.sql, "orgA", [
		["user-1", "Ada"],
		["user-2", "Grace"],
	]);
	const { createProject } = await import("../../packages/domain/src/projects");
	const project = await createProject(server.sql, {
		organizationId: "orgA",
		name: "Alpha Rollout",
		summary: "s",
		leadUserId: "user-1",
		createdBy: "user-1",
	});

	const badPriv = await fetch(
		`${server.url}/api/project/${project.id}?organizationId=orgA`,
		{
			method: "PUT",
			headers: {
				...auth("orgA", "user-1"),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				name: "Alpha Rollout",
				summary: "s",
				status: "started",
				priority: null,
				icon: null,
				color: null,
				description: null,
				successCriteria: null,
				leadUserId: "user-2",
				leadTeamId: null,
				startDate: null,
				targetDate: null,
				orgPrivilege: "superuser",
			}),
		},
	);
	expect(badPriv.status).toBe(400);

	const upd = (await json(
		await fetch(`${server.url}/api/project/${project.id}?organizationId=orgA`, {
			method: "PUT",
			headers: {
				...auth("orgA", "user-1"),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				name: "Alpha Rollout",
				summary: "updated summary",
				status: "started",
				priority: "high",
				icon: null,
				color: null,
				description: "d",
				successCriteria: null,
				leadUserId: "user-2",
				leadTeamId: null,
				startDate: null,
				targetDate: null,
				orgPrivilege: "view",
			}),
		}),
	)) as { data: { summary: string; leadUserName: string; status: string } };
	expect(upd.data.summary).toBe("updated summary");
	expect(upd.data.leadUserName).toBe("Grace");
	expect(upd.data.status).toBe("started");

	const renamed = (await json(
		await fetch(
			`${server.url}/api/project/${project.id}/slug?organizationId=orgA`,
			{
				method: "PUT",
				headers: {
					...auth("orgA", "user-1"),
					"content-type": "application/json",
				},
				body: JSON.stringify({ slug: "alpha-two" }),
			},
		),
	)) as { data: { slug: string } };
	expect(renamed.data.slug).toBe("alpha-two");

	const oldSlug = (await json(
		await fetch(
			`${server.url}/api/project/resolve?organizationId=orgA&slug=alpha-rollout`,
			{ headers: auth("orgA", "user-1") },
		),
	)) as { id: string; usedSlugAlias: boolean };
	expect(oldSlug.id).toBe(project.id);
	expect(oldSlug.usedSlugAlias).toBe(true);
});

test("T07 HTTP archive/unarchive + list filtering", async () => {
	const server = await startProjectsServer();
	resources.push(server.close);
	await seedOrg(server.sql, "orgA", [["user-1", "Ada"]]);
	const { createProject } = await import("../../packages/domain/src/projects");
	const project = await createProject(server.sql, {
		organizationId: "orgA",
		name: "Alpha Rollout",
		summary: "s",
		leadUserId: "user-1",
		createdBy: "user-1",
	});

	const archived = (await json(
		await fetch(
			`${server.url}/api/project/${project.id}/archive?organizationId=orgA`,
			{ method: "PUT", headers: auth("orgA", "user-1") },
		),
	)) as { data: { archivedAt: string | null; archivedByName: string | null } };
	expect(archived.data.archivedAt).not.toBeNull();
	expect(archived.data.archivedByName).toBe("Ada");

	const list = (await json(
		await fetch(`${server.url}/api/project?organizationId=orgA`, {
			headers: auth("orgA", "user-1"),
		}),
	)) as unknown[];
	expect(list).toHaveLength(0);
	const withArchived = (await json(
		await fetch(
			`${server.url}/api/project?organizationId=orgA&includeArchived=1`,
			{ headers: auth("orgA", "user-1") },
		),
	)) as unknown[];
	expect(withArchived).toHaveLength(1);

	const un = (await json(
		await fetch(
			`${server.url}/api/project/${project.id}/unarchive?organizationId=orgA`,
			{ method: "PUT", headers: auth("orgA", "user-1") },
		),
	)) as { data: { archivedAt: string | null } };
	expect(un.data.archivedAt).toBeNull();
});

test("T09+T11 HTTP milestones and updates lifecycle", async () => {
	const server = await startProjectsServer();
	resources.push(server.close);
	await seedOrg(server.sql, "orgA", [["user-1", "Ada"]]);
	const { createProject } = await import("../../packages/domain/src/projects");
	const project = await createProject(server.sql, {
		organizationId: "orgA",
		name: "Alpha Rollout",
		summary: "s",
		leadUserId: "user-1",
		createdBy: "user-1",
	});
	const base = `${server.url}/api/project/${project.id}`;
	const h = auth("orgA", "user-1");

	const ms = (await json(
		await fetch(`${base}/milestones?organizationId=orgA`, {
			method: "POST",
			headers: { ...h, "content-type": "application/json" },
			body: JSON.stringify({ name: "M1", rank: 3 }),
		}),
	)) as { data: { id: string; rank: number } };
	expect(ms.data.rank).toBe(3);

	const done = (await json(
		await fetch(
			`${base}/milestones/${ms.data.id}/complete?organizationId=orgA`,
			{
				method: "PUT",
				headers: h,
			},
		),
	)) as {
		data: { completedAt: string | null; completedBy: { name: string } | null };
	};
	expect(done.data.completedAt).not.toBeNull();
	expect(done.data.completedBy?.name).toBe("Ada");

	await fetch(`${base}/milestones/${ms.data.id}/reopen?organizationId=orgA`, {
		method: "PUT",
		headers: h,
	});

	const badHealth = await fetch(`${base}/updates?organizationId=orgA`, {
		method: "POST",
		headers: { ...h, "content-type": "application/json" },
		body: JSON.stringify({ content: "x", health: "fine" }),
	});
	expect(badHealth.status).toBe(400);

	const up = (await json(
		await fetch(`${base}/updates?organizationId=orgA`, {
			method: "POST",
			headers: { ...h, "content-type": "application/json" },
			body: JSON.stringify({ content: "all good", health: "on-track" }),
		}),
	)) as { data: { id: string; authorName: string; editHistory: unknown[] } };
	expect(up.data.authorName).toBe("Ada");
	expect(up.data.editHistory).toHaveLength(0);

	const edited = (await json(
		await fetch(`${base}/updates/${up.data.id}?organizationId=orgA`, {
			method: "PUT",
			headers: { ...h, "content-type": "application/json" },
			body: JSON.stringify({ content: "actually risky", health: "at-risk" }),
		}),
	)) as { data: { content: string; editHistory: Array<{ content: string }> } };
	expect(edited.data.content).toBe("actually risky");
	expect(edited.data.editHistory).toHaveLength(1);
	expect(edited.data.editHistory[0].content).toBe("all good");

	const updates = (await json(
		await fetch(`${base}/updates?organizationId=orgA`, { headers: h }),
	)) as Array<{ content: string }>;
	expect(updates).toHaveLength(1);

	const del = await fetch(`${base}/updates/${up.data.id}?organizationId=orgA`, {
		method: "DELETE",
		headers: h,
	});
	expect(del.status).toBe(200);
});

test("T15 HTTP telemetry: request spans annotate org, principal.kind, no query text", async () => {
	const server = await startProjectsServer();
	resources.push(server.close);
	await seedOrg(server.sql, "orgA", [["user-1", "Ada"]]);
	await fetch(`${server.url}/api/project?organizationId=orgA`, {
		method: "POST",
		headers: { ...auth("orgA", "user-1"), "content-type": "application/json" },
		body: JSON.stringify({
			organizationId: "orgA",
			name: "Alpha Rollout",
			summary: "s",
			leadUserId: "user-1",
		}),
	});
	await new Promise((r) => setTimeout(r, 100));
	const spans = server.telemetry.spans.getFinishedSpans();
	const request = spans.find((s) => s.name === "stellarc.http.request");
	expect(request).toBeDefined();
	expect(request?.attributes["stellarc.org"]).toBe("orgA");
	expect(request?.attributes["stellarc.principal.kind"]).toBe("actor");
	const dbSpans = spans.filter((s) => s.name.startsWith("db."));
	expect(dbSpans.length).toBeGreaterThan(0);
	for (const span of spans)
		expect(span.attributes).not.toHaveProperty("db.query.text");
});

test("T16 frozen client contract: sub-resource reads carry no organizationId and still resolve org from the project row", async () => {
	const server = await startProjectsServer();
	resources.push(server.close);
	await seedOrg(server.sql, "orgA", [["user-1", "Ada"]]);
	await seedOrg(server.sql, "orgB", [["user-2", "Lin"]]);
	const { createProject } = await import("../../packages/domain/src/projects");
	const project = await createProject(server.sql, {
		organizationId: "orgA",
		name: "Alpha Rollout",
		summary: "s",
		leadUserId: "user-1",
		createdBy: "user-1",
	});
	const base = `${server.url}/api/project/${project.id}`;
	// The frozen fetchers (get-project-milestones/resources, list-project-updates)
	// send only the path id — org must come from the row, guard against the
	// derived org, and cross-org principals must still be denied.
	const ms = await fetch(`${base}/milestones`, {
		headers: auth("orgA", "user-1"),
	});
	expect(ms.status).toBe(200);
	const msBody = (await ms.json()) as unknown[];
	expect(Array.isArray(msBody)).toBe(true);
	const updates = await fetch(`${base}/updates`, {
		headers: auth("orgA", "user-1"),
	});
	expect(updates.status).toBe(200);
	const cross = await fetch(`${base}/milestones`, {
		headers: auth("orgB", "user-2"),
	});
	expect(cross.status).toBe(404);
	// Discriminating control: a SECOND org's own project must resolve its own
	// org from the row — a fixed/hardcoded org derivation 404s legitimate
	// traffic (and would leak across orgs the other direction).
	const projectB = await createProject(server.sql, {
		organizationId: "orgB",
		name: "Beta",
		summary: "s",
		leadUserId: "user-2",
		createdBy: "user-2",
	});
	const own = await fetch(
		`${server.url}/api/project/${projectB.id}/milestones`,
		{
			headers: auth("orgB", "user-2"),
		},
	);
	expect(own.status).toBe(200);
	const ownBody = (await own.json()) as unknown[];
	expect(Array.isArray(ownBody)).toBe(true);
});
