import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import { makeAuth } from "../../packages/domain/src/better-auth";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T30/T31 (review c9 defect 3): every /api/auth/* and
// /api/identity/* request carries a server span in the inbound trace with
// http.route/method/status/stellarc.org/stellarc.principal.kind; service
// functions (auth adapter, authenticate, capabilities, mutations) emit named
// Identity.* spans under the same trace; span attributes never carry SQL
// text, tokens, or secrets.

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

const ORG = "org-tel-1";
const USER = "u-tel-1";

async function seed() {
	const bcrypt = await import("bcryptjs");
	const hash = await bcrypt.hash("correct-horse-battery", 10);
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES (${USER}, 'Tel User', 'tel@test.invalid', true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES ('acc-tel-1', 'acc-tel-1', 'credential', ${USER}, ${hash}, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled,
		default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES (${ORG}, 'Tel Org', 'tel-org', false, false, false, 'manage', false, 1024, 4000, '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('mem-tel-1', ${ORG}, ${USER}, 'owner', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO principal (id, kind, user_id, apikey_id)
		VALUES ('human:' || ${USER}, 'human', ${USER}, null) ON CONFLICT (id) DO NOTHING`;
	const ownerCaps = [
		"org:member",
		"organization:read",
		"organization:update",
		"organization:manage_settings",
		"organization:manage_members",
		"member:read",
		"team:read",
		"invitation:read",
	];
	for (const cap of ownerCaps) {
		await sql`INSERT INTO identity_grant (org_id, principal_id, capability)
			VALUES (${ORG}, 'human:' || ${USER}, ${cap}) ON CONFLICT DO NOTHING`;
	}
}

const TRACE_ID = "11111111111111111111111111111111";
const TRACEPARENT = `00-${TRACE_ID}-2222222222222222-01`;

async function signInCookie() {
	const tracer = recordingTracer();
	const auth = makeAuth(sql, {
		secret: "test-secret-do-not-use-in-production-0123456789",
		baseURL: "http://127.0.0.1:4173",
		tracer,
	});
	const { makeAuthHandler } = await import(
		"../../apps/stellarc-api/src/auth-http"
	);
	const response = await makeAuthHandler(auth)(
		new Request("http://127.0.0.1:4173/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "tel@test.invalid",
				password: "correct-horse-battery",
			}),
		}),
	);
	expect(response.status).toBe(200);
	return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

// Recording fake for the TracerLike seam: proves every instrumentation point
// exists (server spans, authenticate, capabilities, adapter ops, mutations)
// and threads the inbound traceparent. Parenting is modeled so traceId
// assertions behave like the real exporter.
interface RecordedSpan {
	name: string;
	attributes: Record<string, string | number | boolean>;
	traceparent?: string;
	traceId: string;
	ended: boolean;
}

function recordingTracer() {
	const spans: RecordedSpan[] = [];
	let counter = 0;
	const make = (name: string, traceparent?: string, parent?: RecordedSpan) => {
		const traceId = parent
			? parent.traceId
			: (traceparent?.match(/^00-([0-9a-f]{32})-/)?.[1] ??
				`fake${String(++counter).padStart(10, "0")}`);
		const span: RecordedSpan = {
			name,
			attributes: {},
			traceparent,
			traceId,
			ended: false,
		};
		spans.push(span);
		return {
			end() {
				span.ended = true;
			},
			setAttribute(key: string, value: string | number | boolean) {
				span.attributes[key] = value;
			},
			recordError() {},
			async with<T>(body: () => Promise<T>): Promise<T> {
				// children started while this span is active parent to it
				const previous = current;
				current = span;
				try {
					return await body();
				} finally {
					current = previous;
				}
			},
		};
	};
	let current: RecordedSpan | undefined;
	const tracer = {
		startSpan(name: string, options?: { traceparent?: string }) {
			return make(name, options?.traceparent, current);
		},
		spans,
	};
	return tracer;
}

async function buildHandlers() {
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { identityHandler } = await import(
		"../../apps/stellarc-api/src/identity-http"
	);
	const { makeAuthHandler } = await import(
		"../../apps/stellarc-api/src/auth-http"
	);
	const telemetry = TelemetryTest();
	const tracer = recordingTracer();
	const auth = makeAuth(sql, {
		secret: "test-secret-do-not-use-in-production-0123456789",
		baseURL: "http://127.0.0.1:4173",
		tracer,
	});
	return {
		identity: identityHandler(sql, auth, tracer),
		authHttp: makeAuthHandler(auth, "http://127.0.0.1:4173", tracer),
		telemetry,
		tracer,
	};
}

test("T30 identity requests carry route/method/status/org/principal spans in the inbound trace", async () => {
	await seed();
	const { identity, tracer } = await buildHandlers();
	const cookie = await signInCookie();

	const response = await identity(
		new Request(`http://127.0.0.1:4173/api/identity/orgs/${ORG}/members`, {
			headers: { cookie, traceparent: TRACEPARENT },
		}),
	);
	expect(response.status).toBe(200);
	await response.text();

	const spans = tracer.spans;
	const server = spans.filter((s) => s.name === "stellarc.http.request");
	expect(server.length).toBeGreaterThanOrEqual(1);
	const member = server.find(
		(s) => s.attributes["http.route"] === "/api/identity/orgs/:org/members",
	);
	expect(member).toBeDefined();
	const attrs = (member as { attributes: Record<string, string> }).attributes;
	expect(attrs["http.request.method"]).toBe("GET");
	expect(attrs["http.response.status_code"]).toBe(200);
	expect(attrs["stellarc.org"]).toBe(ORG);
	expect(attrs["stellarc.principal.kind"]).toBe("human");
	const authSpan = spans.find((s) => s.name === "Identity.authenticate");
	expect(authSpan).toBeDefined();
	expect(authSpan?.traceId).toBe(TRACE_ID);
	const capsSpan = spans.find((s) => s.name === "Identity.capabilities");
	expect(capsSpan?.traceId).toBe(TRACE_ID);
});

test("T30 auth routes and the Better Auth adapter emit spans in the inbound trace", async () => {
	await seed();
	const { authHttp, tracer } = await buildHandlers();
	const response = await authHttp(
		new Request("http://127.0.0.1:4173/api/auth/sign-in/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				traceparent: TRACEPARENT,
			},
			body: JSON.stringify({
				email: "tel@test.invalid",
				password: "correct-horse-battery",
			}),
		}),
	);
	expect(response.status).toBe(200);
	await response.text();

	const spans = tracer.spans;
	const server = spans.filter(
		(s) =>
			s.name === "stellarc.http.request" &&
			s.attributes["http.route"] === "/api/auth/sign-in/email",
	);
	expect(server).toHaveLength(1);
	expect(server[0]?.traceId).toBe(TRACE_ID);
	expect(server[0]?.attributes).toMatchObject({
		"http.request.method": "POST",
		"http.response.status_code": 200,
	});
	const adapterSpans = spans.filter((s) =>
		s.name.startsWith("Identity.authAdapter."),
	);
	expect(adapterSpans.length).toBeGreaterThanOrEqual(1);
	for (const span of adapterSpans) expect(span.traceId).toBe(TRACE_ID);
});

test("T31 mutations emit named Identity.* spans with org and no SQL/secrets in attributes", async () => {
	await seed();
	const { identity, tracer } = await buildHandlers();
	const cookie = await signInCookie();

	const response = await identity(
		new Request(`http://127.0.0.1:4173/api/identity/orgs/${ORG}/roles`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie,
				traceparent: TRACEPARENT,
			},
			body: JSON.stringify({
				role: "auditor",
				permission: { organization: ["read"] },
			}),
		}),
	);
	expect(response.status).toBe(200);
	const body = (await response.json()) as { txid: number };
	expect(typeof body.txid).toBe("number");

	const spans = tracer.spans;
	const mutation = spans.find((s) => s.name === "Identity.createRole");
	expect(mutation).toBeDefined();
	expect(mutation?.traceId).toBe(TRACE_ID);
	expect(mutation?.attributes).toMatchObject({ "stellarc.org": ORG });
	for (const span of spans) {
		const serialized = JSON.stringify(span.attributes);
		expect(serialized).not.toMatch(/db\.(query|statement)\./);
		expect(serialized).not.toMatch(
			/(correct-horse-battery|test-secret-do-not-use|SELECT |INSERT |UPDATE )/i,
		);
	}
});
