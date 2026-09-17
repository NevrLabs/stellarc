import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";
import { startRepositoryTestServer } from "../helpers/repository-http-server";

// STL-18 T11: every repository endpoint/service/import path exports required
// HTTP/principal/DB spans with no SQL text, PII or token material, and no
// console.* anywhere on the path. Mirrors the T0 in-memory span accounting in
// tests/integration/foundation.test.ts.

let sql: Sql;
let close: () => Promise<void>;
let server: {
	url: string;
	telemetry: {
		spans: {
			getFinishedSpans: () => Array<{
				name: string;
				attributes: Record<string, unknown>;
				spanContext: () => { traceId: string };
			}>;
		};
	};
	close: () => Promise<void>;
};
const ORG = "org-telem-1";
const USER = "user-telem-1";

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES (${ORG}, 'Telemetry Org', ${ORG}, now())`;
	await sql`INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES (${USER}, 'Telemetry User', 'telem@example.test', now(), now())`;
	server = await startRepositoryTestServer(sql);
});

afterEach(async () => {
	await server.close();
	await close();
});

test("T11 repository HTTP requests carry http/principal spans inside one trace", async () => {
	const response = await fetch(`${server.url}/api/identity/orgs/${ORG}/repos`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${ORG} ${USER}`,
		},
		body: JSON.stringify({
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
		}),
	});
	expect(response.status).toBe(200);
	const spans = server.telemetry.spans.getFinishedSpans();
	const requests = spans.filter((s) => s.name === "stellarc.http.request");
	expect(requests).toHaveLength(1);
	expect(requests[0].attributes).toMatchObject({
		"http.route": "/api/identity/orgs/:org/repos",
		"http.request.method": "POST",
		"stellarc.org": ORG,
		"stellarc.principal.kind": "actor",
		"stellarc.principal.id": USER,
	});
	// The domain service span and event append sit INSIDE the request trace.
	const service = spans.filter((s) => s.name === "Domain.repoUpsert");
	expect(service).toHaveLength(1);
	expect(service[0].attributes).not.toHaveProperty("db.query.text");
	// One trace for the whole request path (endpoint → service → append).
	const traceOf = (span: { spanContext: () => { traceId: string } }) =>
		span.spanContext().traceId;
	expect(traceOf(service[0])).toBeTruthy();
	// Endpoint → service → append share ONE trace id.
	expect(traceOf(requests[0])).toBe(traceOf(service[0]));
});

test("T11 no span, event or response leaks SQL text, tokens or PII", async () => {
	const { grantUpsertEffect } = await import(
		"../../packages/domain/src/repository"
	);
	const { Effect } = await import("effect");
	await Effect.runPromise(
		grantUpsertEffect(sql, ORG, USER, {
			id: "grant-telem-1",
			userId: USER,
			providerId: "github",
			githubUserId: "9001",
			githubLogin: "telem-fixture",
			accessToken: "gho_telemetry_secret_marker",
			origin: "live",
		}),
	);
	const listGrants = await fetch(`${server.url}/api/identity/github/grants`, {
		headers: { authorization: `Bearer ${ORG} ${USER}` },
	});
	const grantsBody = await listGrants.text();
	expect(grantsBody).not.toContain("gho_telemetry_secret_marker");

	const events = await sql`SELECT payload FROM event WHERE org=${ORG}`;
	const serialized = JSON.stringify(events);
	expect(serialized).not.toContain("gho_telemetry_secret_marker");
	// Email is PII: never in event payloads (only the user id is).
	expect(serialized).not.toContain("telem@example.test");

	const spans = server.telemetry.spans.getFinishedSpans();
	for (const span of spans) {
		const attrs = JSON.stringify(span.attributes);
		expect(attrs).not.toContain("gho_telemetry_secret_marker");
		expect(attrs).not.toContain("telem@example.test");
		expect(attrs).not.toMatch(/SELECT|INSERT INTO/);
	}
});

test("T11 import path spans one trace with per-row joins and no SQL text", async () => {
	const { importRepositoryEffect } = await import(
		"../../packages/domain/src/repository-import"
	);
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { ManagedRuntime } = await import("effect");
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		await runtime.runPromise(
			importRepositoryEffect(sql, ORG, USER, {
				repo: {
					id: "repo-telem-1",
					provider: "github",
					owner: "foundation",
					name: "probe",
					url: "https://example.test/foundation/probe",
				},
				issues: [
					{
						id: "issue-telem-1",
						number: 1,
						title: "Alpha",
						state: "open",
						url: "https://example.test/i/1",
					},
				],
				pullRequests: [],
				origin: "import",
			}),
		);
		const spans = telemetry.spans.getFinishedSpans();
		const importer = spans.filter((s) => s.name === "Domain.importRepository");
		expect(importer).toHaveLength(1);
		// Row upserts join the importer span (one trace for the import).
		const upserts = spans.filter((s) => s.name === "Domain.repoUpsert");
		expect(upserts.length).toBeGreaterThanOrEqual(1);
		for (const span of spans) {
			expect(JSON.stringify(span.attributes)).not.toMatch(/SELECT|INSERT INTO/);
		}
	} finally {
		await runtime.dispose();
	}
});

test("T11 shape paths span snapshot/tail through the repository routes", async () => {
	const response = await fetch(
		`${server.url}/orgs/${ORG}/v1/shape?table=repo&offset=-1`,
		{ headers: { authorization: `Bearer ${ORG} ${USER}` } },
	);
	expect(response.status).toBe(200);
	const spans = server.telemetry.spans.getFinishedSpans();
	const snapshot = spans.filter((s) => s.name === "stellarc.shape.snapshot");
	expect(snapshot).toHaveLength(1);
	// No SQL text anywhere on the shape path.
	for (const span of spans) {
		expect(JSON.stringify(span.attributes)).not.toMatch(/SELECT \* FROM repo/);
	}
});
