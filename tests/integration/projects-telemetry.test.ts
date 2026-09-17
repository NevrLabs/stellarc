import { readFileSync } from "node:fs";
import { Effect, Layer, ManagedRuntime } from "effect";
import type { Sql } from "postgres";
import { afterEach, expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

// §2/ADR 0010 (T15): every projects service path emits http.* request spans
// annotated with stellarc.org + stellarc.principal.kind, db.* spans carry no
// statement text, and no module on the path uses console.*.

async function startTelemetryServer() {
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
		(_org, headers) =>
			headers.authorization?.startsWith("Bearer ") ? "ok" : "unauthenticated",
		undefined,
		telemetry.layer,
		memoMap,
		(_org, authorization) =>
			(authorization ?? "").replace(/^Bearer\s+/i, "").split(" ")[1] ?? "",
	);
	return {
		web,
		sql: db.sql,
		telemetry,
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

const authHeaders = (principal: string) => ({
	authorization: `Bearer orgA ${principal}`,
	"content-type": "application/json",
});

test("T15a every projects HTTP path carries an annotated request span and db spans without statement text", async () => {
	const server = await startTelemetryServer();
	resources.push(server.close);
	const sql: Sql = server.sql;
	await sql`INSERT INTO "user" (id, name, email) VALUES ('u1', 'Ada', 'u1@example.test')`;
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('orgA', 'Org A', 'orga', now())`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, joined_at) VALUES ('m1', 'orgA', 'u1', now())`;
	await sql`INSERT INTO project (id, organization_id, slug, name, summary, status, lead_user_id, created_by)
		VALUES ('p1', 'orgA', 'alpha', 'Alpha', 's', 'planned', 'u1', 'u1')`;

	const base = `${"http://test"}`;
	const calls: Array<[string, Request]> = [
		[
			"list",
			new Request(`${base}/api/project?organizationId=orgA`, {
				headers: authHeaders("u1"),
			}),
		],
		[
			"resolve",
			new Request(
				`${base}/api/project/resolve?organizationId=orgA&slug=alpha`,
				{ headers: authHeaders("u1") },
			),
		],
		[
			"get",
			new Request(`${base}/api/project/p1?organizationId=orgA`, {
				headers: authHeaders("u1"),
			}),
		],
		[
			"milestones",
			new Request(`${base}/api/project/p1/milestones?organizationId=orgA`, {
				headers: authHeaders("u1"),
			}),
		],
		[
			"updates",
			new Request(`${base}/api/project/p1/updates?organizationId=orgA`, {
				headers: authHeaders("u1"),
			}),
		],
		[
			"create",
			new Request(`${base}/api/project?organizationId=orgA`, {
				method: "POST",
				headers: authHeaders("u1"),
				body: JSON.stringify({
					organizationId: "orgA",
					name: "Beta",
					summary: "s",
					leadUserId: "u1",
				}),
			}),
		],
		[
			"archive",
			new Request(`${base}/api/project/p1/archive?organizationId=orgA`, {
				method: "PUT",
				headers: authHeaders("u1"),
			}),
		],
		[
			"shape-project",
			new Request(`${base}/orgs/orgA/v1/shape?table=project&offset=-1`, {
				headers: authHeaders("u1"),
			}),
		],
		[
			"shape-alias",
			new Request(
				`${base}/orgs/orgA/v1/shape?table=project_slug_alias&offset=-1`,
				{ headers: authHeaders("u1") },
			),
		],
		[
			"shape-milestone",
			new Request(
				`${base}/orgs/orgA/v1/shape?table=project_milestone&offset=-1`,
				{ headers: authHeaders("u1") },
			),
		],
		[
			"shape-update",
			new Request(`${base}/orgs/orgA/v1/shape?table=project_update&offset=-1`, {
				headers: authHeaders("u1"),
			}),
		],
	];
	const seen = new Set<string>();
	for (const [name, request] of calls) {
		const response = await server.web.handler(request);
		expect(response.status, name).toBeLessThan(500);
		await response.text();
		seen.add(name);
	}
	// Mutations that must exist in the span stream with db.* children.
	await new Promise((r) => setTimeout(r, 150));
	const spans = server.telemetry.spans.getFinishedSpans();
	const requestSpans = spans.filter((s) => s.name === "stellarc.http.request");
	expect(requestSpans.length).toBeGreaterThanOrEqual(calls.length);
	for (const span of requestSpans) {
		expect(span.attributes["stellarc.org"]).toBe("orgA");
		expect(span.attributes["stellarc.principal.kind"]).toBe("actor");
	}
	const dbSpans = spans.filter((s) => s.name.startsWith("db.projects"));
	expect(dbSpans.length).toBeGreaterThan(0);
	for (const span of spans)
		expect(span.attributes).not.toHaveProperty("db.query.text");
	// ≥1 span assertion per new path: the shape snapshot span annotates the
	// project table attribute.
	const shapeSnapshot = spans.find((s) => s.name === "stellarc.shape.snapshot");
	expect(shapeSnapshot).toBeDefined();
	expect(shapeSnapshot?.attributes["stellarc.shape.table"]).toBe("project");
	// The four collections each served at least one snapshot span.
	const tables = new Set(
		spans
			.filter((s) => s.name === "stellarc.shape.snapshot")
			.map((s) => s.attributes["stellarc.shape.table"]),
	);
	for (const table of [
		"project",
		"project_slug_alias",
		"project_milestone",
		"project_update",
	])
		expect(tables, table).toContain(table);
	void seen;
});

test("T15c project services run as Effect.fn with an instrumented event append (review-4 defect 8)", async () => {
	const server = await startTelemetryServer();
	resources.push(server.close);
	const sql: Sql = server.sql;
	await sql`INSERT INTO "user" (id, name, email) VALUES ('u1', 'Ada', 'u1@example.test')`;
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('orgA', 'Org A', 'orga', now())`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, joined_at) VALUES ('m1', 'orgA', 'u1', now())`;

	// A mutation whose event append must surface as a stellarc.event.append
	// span, nested under a Projects.* service span, on the telemetry runtime.
	const created = await server.web.handler(
		new Request("http://test/api/project?organizationId=orgA", {
			method: "POST",
			headers: authHeaders("u1"),
			body: JSON.stringify({
				organizationId: "orgA",
				name: "Effect Fn",
				summary: "s",
				leadUserId: "u1",
			}),
		}),
	);
	expect(created.status).toBe(200);
	await created.text();
	const archived = await server.web.handler(
		new Request(
			"http://test/api/project/p-effect/archive?organizationId=orgA",
			{
				method: "PUT",
				headers: authHeaders("u1"),
			},
		),
	);
	expect(archived.status).toBeLessThan(500);
	await archived.text();
	await new Promise((r) => setTimeout(r, 150));

	const spans = server.telemetry.spans.getFinishedSpans();
	const serviceSpans = spans.filter(
		(s) =>
			s.name.startsWith("Projects.") ||
			s.name.startsWith("ProjectMilestones.") ||
			s.name.startsWith("ProjectUpdates."),
	);
	expect(serviceSpans.length).toBeGreaterThan(0);
	expect(new Set(serviceSpans.map((s) => s.name))).toContain(
		"Projects.createProject",
	);

	const appendSpans = spans.filter((s) => s.name === "stellarc.event.append");
	expect(appendSpans.length).toBeGreaterThan(0);
	for (const span of appendSpans) {
		expect(span.attributes["stellarc.event.type"]).toBe("project:created");
		expect(typeof span.attributes["stellarc.event.seq"]).toBe("string");
		expect(typeof span.attributes["stellarc.event.txid"]).toBe("number");
	}
	// The appender span nests under its Projects.* service span (same trace).
	const serviceTraceIds = new Set(
		serviceSpans.map((s) => s.spanContext().traceId),
	);
	for (const span of appendSpans)
		expect(serviceTraceIds).toContain(span.spanContext().traceId);
});

test("T15b no console.* on any projects module (static)", () => {
	const files = [
		"apps/stellarc-api/src/http.ts",
		"packages/domain/src/projects.ts",
		"packages/domain/src/project-milestones.ts",
		"packages/domain/src/project-updates.ts",
		"packages/domain/src/projects-events.ts",
		"packages/sync/src/projects-shapes.ts",
	];
	for (const file of files) {
		const source = readFileSync(`${process.cwd()}/${file}`, "utf8");
		expect(source.includes("console."), `${file} must not use console.*`).toBe(
			false,
		);
	}
});
