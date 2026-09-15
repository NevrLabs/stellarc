import { afterAll, beforeAll, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

// T25/T26 telemetry contract for the work slice (§7). The work handler runs
// under a telemetry runtime; every request span carries http.route,
// http.request.method, stellarc.org and — on success — stellarc.principal.*,
// and NO span attribute or log record ever carries titles, descriptions,
// notes, or SQL statement text.

let sql: import("postgres").Sql;
let close: () => Promise<void>;
let http: {
	handler: (request: Request) => Promise<Response>;
	dispose: () => Promise<void>;
};
let spans: import("@opentelemetry/sdk-trace-base").InMemorySpanExporter;
let logs: import("@opentelemetry/sdk-logs").InMemoryLogRecordExporter;

beforeAll(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-1', 'Org One', 'org-one', now())`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('user-1', 'U1', 'u1@t.dev', true, now(), now())`;
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { workHandler } = await import("../../apps/stellarc-api/src/work-http");
	const telemetry = TelemetryTest();
	spans = telemetry.spans;
	logs = telemetry.logs;
	http = workHandler(
		sql,
		(org, headers, principal) => {
			if (!headers.authorization) return "unauthenticated";
			const token = headers.authorization.replace(/^Bearer\s+/i, "").trim();
			return token.startsWith(`${org} `) &&
				token.slice(org.length + 1) === principal
				? "ok"
				: "forbidden";
		},
		(org, authorization) => {
			const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
			return token.startsWith(`${org} `) ? token.slice(org.length + 1) : "";
		},
		telemetry.layer,
	);
}, 60000);

afterAll(async () => {
	await close();
});

const H = (org: string, id = "user-1") => ({
	authorization: `Bearer ${org} ${id}`,
});

test("T26: request span carries route/method/org/principal for work paths", async () => {
	spans.reset();
	const response = await http.handler(
		new Request("http://x/api/work/boards", {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({ name: "Telemetry Board" }),
		}),
	);
	expect(response.status).toBe(200);
	const finished = spans.getFinishedSpans();
	const request = finished.find((s) => s.name === "stellarc.http.request");
	expect(request).toBeDefined();
	expect(request?.attributes["http.route"]).toBe("/api/work/boards");
	expect(request?.attributes["http.request.method"]).toBe("POST");
	expect(request?.attributes["stellarc.org"]).toBe("org-1");
	expect(request?.attributes["stellarc.principal.kind"]).toBe("actor");
	expect(request?.attributes["stellarc.principal.id"]).toBe("user-1");
}, 15000);

test("T26: 401 responses get a span with error.type and no principal leak", async () => {
	spans.reset();
	const response = await http.handler(
		new Request("http://x/api/work/boards", { method: "GET" }),
	);
	expect(response.status).toBe(401);
	const finished = spans.getFinishedSpans();
	const request = finished.find((s) => s.name === "stellarc.http.request");
	expect(request).toBeDefined();
	expect(request?.attributes["error.type"]).toBe("Unauthenticated");
	expect(request?.attributes).not.toHaveProperty("stellarc.principal.id");
}, 15000);

test("T25: no span attribute or log leaks title/description/note/SQL text", async () => {
	spans.reset();
	logs.reset();
	const response = await http.handler(
		new Request("http://x/api/work/boards", {
			method: "POST",
			headers: { ...H("org-1"), "content-type": "application/json" },
			body: JSON.stringify({
				name: "Leak Probe Board",
				description: "x-leak-marker-description",
			}),
		}),
	);
	expect(response.status).toBe(200);
	const marker = "x-leak-marker-description";
	for (const span of spans.getFinishedSpans()) {
		expect(span.attributes).not.toHaveProperty("db.query.text");
		for (const [key, value] of Object.entries(span.attributes)) {
			const k = key.toLowerCase();
			expect(k).not.toContain("title");
			expect(k).not.toContain("description");
			expect(k).not.toContain("note");
			if (typeof value === "string") expect(value).not.toContain(marker);
		}
	}
	for (const record of logs.getFinishedLogRecords()) {
		const body = JSON.stringify([record.body, record.attributes]);
		expect(body).not.toContain(marker);
		expect(body).not.toContain("INSERT INTO");
	}
}, 15000);
