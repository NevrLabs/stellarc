import { Effect, Layer, ManagedRuntime } from "effect";
import type { Sql } from "postgres";
import { afterEach, expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

// §4 T13: org-scoped project collections. Snapshot + tail share the same
// org predicate; cross-org requests never see another org's rows; tail
// messages for the four dependency-free collections arrive exactly once per
// committed event. Satellites (project_board/repo/table_link/ticket) stay
// wave-2-blocked (STL-16/18 FK targets absent from dev).

async function startShapeServer() {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { registerProjectCollections } = await import(
		"../../packages/sync/src/projects-shapes"
	);
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const telemetry = TelemetryTest();
	const memoMap = await Effect.runPromise(Layer.makeMemoMap);
	const runtime = ManagedRuntime.make(telemetry.layer, memoMap);
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const engine = new ShapeEngine(db.sql);
	registerProjectCollections(engine);
	const web = foundationHandler(
		db.sql,
		engine,
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
	return {
		web,
		sql: db.sql,
		async close() {
			await web.dispose();
			await runtime.dispose();
			await db.close();
		},
	};
}

const resources: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of resources.splice(0).reverse()) await close();
});

async function seedOrgProject(
	sql: Sql,
	org: string,
	slug: string,
	name: string,
) {
	await sql`INSERT INTO "user" (id, name, email) VALUES (${`${org}-u1`}, ${`${org} lead`}, ${`${org}-u1@example.test`})`;
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES (${org}, ${`Org ${org}`}, ${org}, now())`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, joined_at) VALUES (${`${org}-m1`}, ${org}, ${`${org}-u1`}, now())`;
	await sql`INSERT INTO project (id, organization_id, slug, name, summary, status, lead_user_id, created_by)
		VALUES (${`${org}-p1`}, ${org}, ${slug}, ${name}, ${"summary"}, 'planned', ${`${org}-u1`}, ${`${org}-u1`})`;
}

function authHeader(org: string) {
	return { authorization: `Bearer ${org} user-1` };
}

test("T13a project collection snapshot returns live org rows only", async () => {
	const server = await startShapeServer();
	resources.push(server.close);
	await seedOrgProject(server.sql, "orgA", "alpha", "Alpha");
	await seedOrgProject(server.sql, "orgB", "beta", "Beta");
	const response = await server.web.handler(
		new Request("http://test/orgs/orgA/v1/shape?table=project&offset=-1", {
			headers: authHeader("orgA"),
		}),
	);
	expect(response.status).toBe(200);
	const messages = (await response.json()) as Array<{
		key: string;
		value: Record<string, unknown>;
		headers: { operation: string; relation: string[] };
	}>;
	const rows = messages.filter((m) => m.headers.operation === "insert");
	expect(rows).toHaveLength(1);
	expect(rows[0].value.id).toBe("orgA-p1");
	expect(rows[0].value.slug).toBe("alpha");
	expect(rows[0].headers.relation).toEqual(["public", "project"]);
	// Snapshot for orgB must not carry orgA rows (identical org predicate).
	const other = await server.web.handler(
		new Request("http://test/orgs/orgB/v1/shape?table=project&offset=-1", {
			headers: authHeader("orgB"),
		}),
	);
	const otherRows = (
		(await other.json()) as Array<{
			headers: { operation?: string };
			value?: { id?: string };
		}>
	).filter((m) => m.headers.operation === "insert");
	expect(otherRows.map((m) => m.value?.id)).toEqual(["orgB-p1"]);
});

test("T13b slug-alias collection exposes aliases, not canonical rows", async () => {
	const server = await startShapeServer();
	resources.push(server.close);
	await seedOrgProject(server.sql, "orgA", "alpha", "Alpha");
	await server.sql`INSERT INTO project_slug_alias (id, organization_id, project_id, slug)
		VALUES ('alias-1', 'orgA', 'orgA-p1', 'alpha-old')`;
	const response = await server.web.handler(
		new Request(
			"http://test/orgs/orgA/v1/shape?table=project_slug_alias&offset=-1",
			{ headers: authHeader("orgA") },
		),
	);
	expect(response.status).toBe(200);
	const rows = (
		(await response.json()) as Array<{
			headers: { operation?: string };
			value?: { slug?: string };
		}>
	).filter((m) => m.headers.operation === "insert");
	expect(rows.map((m) => m.value?.slug)).toEqual(["alpha-old"]);
});

test("T13c milestone and update collections tail committed events exactly once", async () => {
	const server = await startShapeServer();
	resources.push(server.close);
	await seedOrgProject(server.sql, "orgA", "alpha", "Alpha");
	// Boundaries before any live mutation.
	const first = await server.web.handler(
		new Request(
			"http://test/orgs/orgA/v1/shape?table=project_milestone&offset=-1",
			{ headers: authHeader("orgA") },
		),
	);
	const offset = first.headers.get("electric-offset") ?? "";
	expect(offset).toMatch(/^\d+_0$/);
	const upFirst = await server.web.handler(
		new Request(
			"http://test/orgs/orgA/v1/shape?table=project_update&offset=-1",
			{ headers: authHeader("orgA") },
		),
	);
	const upHandle = upFirst.headers.get("electric-handle") ?? "";
	const upOffset = upFirst.headers.get("electric-offset") ?? "";
	// Live writes through the domain service (atomic event + row).
	const { createProjectMilestone } = await import(
		"../../packages/domain/src/project-milestones"
	);
	const { createProjectUpdate } = await import(
		"../../packages/domain/src/project-updates"
	);
	await createProjectMilestone(server.sql, {
		projectId: "orgA-p1",
		name: "M1",
		rank: 0,
		userId: "orgA-u1",
	});
	await createProjectUpdate(server.sql, {
		projectId: "orgA-p1",
		authorId: "orgA-u1",
		content: "kickoff",
		health: "on-track",
	});
	const handle = first.headers.get("electric-handle") ?? "";
	const tail2 = await server.web.handler(
		new Request(
			`http://test/orgs/orgA/v1/shape?table=project_milestone&handle=${handle}&offset=${offset}`,
			{ headers: authHeader("orgA") },
		),
	);
	expect(tail2.status).toBe(200);
	const messages = (await tail2.json()) as Array<{
		value?: Record<string, unknown>;
		headers: { operation?: string };
	}>;
	const ops = messages.filter((m) => m.headers.operation);
	expect(ops).toHaveLength(1);
	expect(ops[0].headers.operation).toBe("update");
	expect(ops[0].value?.name).toBe("M1");
	expect(ops[0].value?.project_id).toBe("orgA-p1");
	// project_update collection carries its own upsert.
	const upTail = await server.web.handler(
		new Request(
			`http://test/orgs/orgA/v1/shape?table=project_update&handle=${upHandle}&offset=${upOffset}`,
			{ headers: authHeader("orgA") },
		),
	);
	const upMessages = (await upTail.json()) as Array<{
		value?: Record<string, unknown>;
		headers: { operation?: string };
	}>;
	const upOps = upMessages.filter((m) => m.headers.operation);
	expect(upOps).toHaveLength(1);
	expect(upOps[0].value?.health).toBe("on-track");
});

test("T13d unknown collection key is rejected, not defaulted to probe", async () => {
	const server = await startShapeServer();
	resources.push(server.close);
	await seedOrgProject(server.sql, "orgA", "alpha", "Alpha");
	const response = await server.web.handler(
		new Request(
			"http://test/orgs/orgA/v1/shape?table=project_board&offset=-1",
			{
				headers: authHeader("orgA"),
			},
		),
	);
	// Satellites are wave-2: the key must not silently fall back to another
	// table's spec (unscoped collection key sabotage target).
	expect(response.status).toBe(404);
});
