import { afterAll, beforeAll, expect, test } from "bun:test";
import { Effect } from "effect";
import { Access, Db } from "../../packages/kaneo/src/kernel";
import { mcpGuardsLive } from "../../packages/kaneo/src/mcp/guards";
import {
	isMcpOriginAllowed,
	mcpHttpHandler,
} from "../../packages/kaneo/src/mcp/http";
import {
	type McpGuards,
	type McpPrincipal,
	McpRequestPrincipal,
	mcpTools,
	type PrincipalResolver,
} from "../../packages/kaneo/src/mcp/tools";
import { disposablePostgres } from "../helpers/postgres";

/**
 * NEVR-185 MCP parity gate (rework cycle 1): the Effect-native MCP endpoint
 * (effect/ai McpServer.layerHttp) must behave like the reference SDK transport
 * the legacy tree served, AND the production wiring must actually work:
 *
 *  M1–M8 transport parity (session lifecycle, negotiation, validation-error
 *      shape, termination, token gate, owner scoping, origin enforcement),
 *  M9   production wiring: handler built like kaneo/src/http.ts builds it, no
 *      setter — a proxy tool reaches a stub upstream with the caller's token
 *      (REWORK defect 1 regression gate),
 *  M10  instance-admin non-member passes a board guard; plain non-member is
 *      forbidden (REWORK defect 2),
 *  M11  zod `.trim().min(1)` parity: padded id decodes trimmed (defect 3),
 *  M12  zod `.datetime({offset:true})` parity: date-only rejected (defect 3),
 *  M13  GET /api/mcp → 405 from the transport (defect 4),
 *  M14  principal resolved exactly once per request (defect 5),
 *  M5   strengthened: termination ABORTS the upstream fetch (defect 6),
 *  M16  PRODUCTION wiring: kaneoNativeHandler-built MCP endpoint — the
 *       assembly in kaneo/src/http.ts (adapter, KANEO_API_URL, mcpTools
 *       call, guards+services) end-to-end against a stub upstream and a
 *       real PG-migrated guard (cycle-2 defect 1),
 *  M17  CORS preflight: OPTIONS /api/mcp answered 204 + legacy header set
 *       BEFORE auth (cycle-2 defect 2),
 *  M18  cookie-only session: 401 + WWW-Authenticate (cycle-2 defect 3),
 *  M19  origin policy parity with withCors: empty list reflects any origin
 *       outside production; configured list = membership (cycle-2 defect 4),
 *  M20  telemetry parity: mcp.tool.<name> spans reach the telemetry layer
 *       passed to mcpHttpHandler, not the no-op tracer (cycle-3 defect 1),
 *  M21  guard denial lists the missing resource:action pairs, exactly as
 *       legacy assertMcpPermission did (cycle-3 defect 2),
 *  M22  same-origin requests pass even in production with an EMPTY
 *       allow-list (browser POSTs always send Origin; cycle-3 defect 3).
 */

const resources: Array<() => Promise<void>> = [];
let effBase = "";
let closeEff: (() => Promise<void>) | null = null;

// Stub principals: the resolver hands these out (with call counting for M14).
const USER_A: McpPrincipal = {
	userId: "user-a",
	userRole: null,
	token: "token-a",
};
const USER_B: McpPrincipal = {
	userId: "user-b",
	userRole: null,
	token: "token-b",
};
let resolverCalls = 0;
const principalFor: PrincipalResolver = async (headers) => {
	resolverCalls++;
	const auth = headers.get("authorization") ?? "";
	const m = /^Bearer\s+(.+)$/i.exec(auth);
	const token = m?.[1] ?? headers.get("x-api-key") ?? "";
	if (token === "token-a") return USER_A;
	if (token === "token-b") return USER_B;
	// M18: what resolvePrincipal yields for a cookie-only caller — a valid
	// principal whose token is "" (session cookie, no bearer/api-key).
	if (token === "empty-token-principal")
		return { userId: "user-a", userRole: null, token: "" };
	return null;
};

const guards: McpGuards = {
	guardTask: () => Effect.succeed(undefined),
	guardBoard: () => Effect.succeed(undefined),
} as unknown as McpGuards;

const j = {
	"content-type": "application/json",
	accept: "application/json, text/event-stream",
};
const rpc = (method: string, params: unknown, id: number | null = 1) =>
	JSON.stringify({ jsonrpc: "2.0", id, method, params });
const initBody = (ver: string) =>
	rpc("initialize", {
		protocolVersion: ver,
		capabilities: {},
		clientInfo: { name: "parity", version: "0" },
	});

/** Read a JSON-RPC reply from either application/json or SSE framing. */
const readRpc = async (r: Response, id: number | null = 1) => {
	const text = await r.text();
	const ct = r.headers.get("content-type") ?? "";
	if (ct.includes("text/event-stream")) {
		for (const line of text.split("\n")) {
			if (!line.startsWith("data:")) continue;
			try {
				const msg = JSON.parse(line.slice(5).trim());
				if (msg?.id === id || id === null) return msg;
			} catch {}
		}
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

const open = async (base: string, token: string, ver = "2025-06-18") => {
	const r = await fetch(`${base}/api/mcp`, {
		method: "POST",
		headers: { ...j, authorization: `Bearer ${token}` },
		body: initBody(ver),
	});
	const body = await readRpc(r);
	return {
		status: r.status,
		sid: r.headers.get("mcp-session-id") ?? "",
		ver: body?.result?.protocolVersion,
	};
};

const call = async (
	base: string,
	sid: string,
	ver: string,
	token: string,
	method: string,
	params: unknown,
	id = 1,
) => {
	const r = await fetch(`${base}/api/mcp`, {
		method: "POST",
		headers: {
			...j,
			authorization: `Bearer ${token}`,
			"mcp-session-id": sid,
			"mcp-protocol-version": ver,
		},
		body: rpc(method, params, id),
	});
	return { status: r.status, body: await readRpc(r, id) };
};

/** Stub upstream the proxy tools talk to (REWORK defect 1 / M9, M5). */
let upstreamBase = "";
const upstreamHits: Array<{ path: string; auth: string | null }> = [];
let upstreamSignalAborted = false;
let upstreamArrived: (() => void) | null = null;
let upstreamArrivedPromise = Promise.resolve();

beforeAll(async () => {
	const trackArrival = () => {
		upstreamArrivedPromise = new Promise<void>((resolve) => {
			upstreamArrived = resolve;
		});
	};
	trackArrival();
	const upstream = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 30,
		fetch: async (req) => {
			const url = new URL(req.url);
			upstreamHits.push({
				path: url.pathname,
				auth: req.headers.get("authorization"),
			});
			if (url.pathname === "/api/organization") {
				return Response.json([{ id: "org-1", name: "Org" }]);
			}
			if (url.pathname === "/api/auth/get-session") {
				return Response.json({ user: { id: "user-a", name: "A" } });
			}
			if (url.pathname.startsWith("/api/task/")) {
				return Response.json({ id: "task-1", title: "T" });
			}
			if (url.pathname.startsWith("/api/board")) {
				// M5 black-hole: hold until the client aborts.
				upstreamArrived?.();
				await new Promise<void>((resolve) => {
					req.signal.addEventListener("abort", () => {
						upstreamSignalAborted = true;
						resolve();
					});
				});
				return new Response("gone", { status: 499 });
			}
			return Response.json({}, { status: 404 });
		},
	});
	upstreamBase = upstream.url.origin;
	resources.push(async () => {
		upstreamArrived?.();
		upstream.stop(true);
	});

	// Built EXACTLY like production kaneo/src/http.ts builds it: no setter
	// anywhere (REWORK defect 1's regression gate is that this wiring works).
	const eff = mcpHttpHandler({
		tools: mcpTools(guards, upstreamBase),
		principalResolver: principalFor,
		allowedOrigins: ["http://localhost:5273"],
		apiBaseUrl: upstreamBase,
	});
	const srv = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (r) => eff.handler(r),
	});
	effBase = srv.url.origin;
	closeEff = eff.dispose;
	resources.push(async () => {
		srv.stop(true);
	});
}, 60_000);

afterAll(async () => {
	await closeEff?.();
	while (resources.length) await resources.pop()?.();
});

test("M1 initialize: 200, session header, echo of offered version", async () => {
	const s = await open(effBase, "token-a");
	expect(s.status).toBe(200);
	expect(s.sid).toBeTruthy();
	expect(s.ver).toBe("2025-06-18");
});

test("M2 negotiation: 2024-11-05 echoed; bogus offer answered with latest (2025-11-25)", async () => {
	const old = await open(effBase, "token-a", "2024-11-05");
	expect(old.ver).toBe("2024-11-05");
	const bogus = await open(effBase, "token-a", "1999-01-01");
	expect(bogus.ver).toBe("2025-11-25");
});

test("M3 invalid-schema tool input fails validation exactly as the reference SDK (parity)", async () => {
	const { sid, ver } = await open(effBase, "token-a");
	// create_task requires priority ∈ enum; feed an invalid one.
	const r = await call(effBase, sid, ver ?? "", "token-a", "tools/call", {
		name: "create_task",
		arguments: {
			boardId: "b",
			title: "t",
			description: "",
			priority: "nope",
			status: "todo",
		},
	});
	expect(r.status).toBe(200);
	expect(r.body?.error).toBeUndefined();
	expect(r.body?.result?.isError).toBe(true);
	expect(r.body?.result?.content?.[0]?.text).toMatch(
		/^MCP error -32602: Input validation error: Invalid arguments for tool create_task:/,
	);
});

test("M4 DELETE terminates the session; later requests 404", async () => {
	const { sid, ver } = await open(effBase, "token-a");
	const del = await fetch(`${effBase}/api/mcp`, {
		method: "DELETE",
		headers: {
			authorization: "Bearer token-a",
			"mcp-session-id": sid,
			"mcp-protocol-version": ver ?? "",
		},
	});
	expect([200, 204]).toContain(del.status);
	const after = await call(
		effBase,
		sid,
		ver ?? "",
		"token-a",
		"tools/list",
		{},
	);
	expect(after.status).toBe(404);
});

test("M5 termination interrupts in-flight tool calls AND aborts the upstream fetch", async () => {
	const { sid, ver } = await open(effBase, "token-a");
	upstreamSignalAborted = false;
	const inflight = call(
		effBase,
		sid,
		ver ?? "",
		"token-a",
		"tools/call",
		{ name: "list_boards", arguments: { organizationId: "org" } },
		7,
	);
	// Wait until the upstream request is genuinely in-flight.
	await upstreamArrivedPromise;
	const del = await fetch(`${effBase}/api/mcp`, {
		method: "DELETE",
		headers: {
			authorization: "Bearer token-a",
			"mcp-session-id": sid,
			"mcp-protocol-version": ver ?? "",
		},
	});
	expect([200, 204]).toContain(del.status);
	const res = await inflight;
	expect(res.status).toBe(404);
	// REWORK defect 6: the interrupt must reach the upstream fetch — the
	// black-hole server observes request.signal abort.
	for (let i = 0; i < 150 && !upstreamSignalAborted; i++) await Bun.sleep(20);
	expect(upstreamSignalAborted).toBe(true);
}, 30_000);

test("M6 token gate: no token → 401 with WWW-Authenticate resource_metadata", async () => {
	const r = await fetch(`${effBase}/api/mcp`, {
		method: "POST",
		headers: j,
		body: initBody("2025-06-18"),
	});
	expect(r.status).toBe(401);
	expect(r.headers.get("www-authenticate")).toMatch(
		/^Bearer resource_metadata="/,
	);
	const body = await r.json();
	expect(body.error).toBe("invalid_token");
});

test("M7 sessions are owner-scoped: user B cannot use user A's session id", async () => {
	const { sid, ver } = await open(effBase, "token-a");
	const asB = await call(effBase, sid, ver ?? "", "token-b", "tools/list", {});
	expect(asB.status).toBe(404);
});

test("M8 allowed/disallowed Origin enforcement", async () => {
	const good = await fetch(`${effBase}/api/mcp`, {
		method: "POST",
		headers: {
			...j,
			authorization: "Bearer token-a",
			origin: "http://localhost:5273",
		},
		body: initBody("2025-06-18"),
	});
	expect(good.status).toBe(200);
	const bad = await fetch(`${effBase}/api/mcp`, {
		method: "POST",
		headers: {
			...j,
			authorization: "Bearer token-a",
			origin: "https://evil.example",
		},
		body: initBody("2025-06-18"),
	});
	expect(bad.status).toBe(403);
});

test("M9 production wiring: proxy tool reaches the stub upstream with the caller's token (no setter)", async () => {
	// The handler in beforeAll was built exactly like kaneo/src/http.ts does:
	// mcpTools(guards, apiBaseUrl) + mcpHttpHandler({apiBaseUrl}) — no
	// setApiBaseUrl exists anymore. If the base URL failed to flow, the tool
	// would return isError with "fetch() URL is invalid".
	const { sid, ver } = await open(effBase, "token-a");
	const hitsBefore = upstreamHits.length;
	const r = await call(effBase, sid, ver ?? "", "token-a", "tools/call", {
		name: "list_organizations",
		arguments: {},
	});
	expect(r.status).toBe(200);
	expect(r.body?.result?.isError).toBeFalsy();
	expect(r.body?.result?.content?.[0]?.text).toContain("org-1");
	// The upstream saw exactly one hit, authorized as the caller.
	expect(upstreamHits.length).toBe(hitsBefore + 1);
	expect(upstreamHits.at(-1)?.auth).toBe("Bearer token-a");
	expect(upstreamHits.at(-1)?.path).toBe("/api/organization");
});

test("M13 GET /api/mcp is answered 405 by the transport (all methods routed native)", async () => {
	const r = await fetch(`${effBase}/api/mcp`, {
		method: "GET",
		headers: { authorization: "Bearer token-a" },
	});
	expect(r.status).toBe(405);
});

test("M15 isNative routes EVERY method on /api/mcp to the native handler (defect 4)", async () => {
	const { isNative } = await import("../../packages/kaneo/src/http");
	const req = (method: string) => new Request("http://x/api/mcp", { method });
	for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
		expect(isNative(req(method)), method).toBe(true);
	}
});

test("M14 principal resolved exactly once per request (defect 5)", async () => {
	resolverCalls = 0;
	await open(effBase, "token-a");
	expect(resolverCalls).toBe(1);
	resolverCalls = 0;
	await call(
		effBase,
		"sid-that-does-not-exist",
		"2025-06-18",
		"token-a",
		"tools/list",
		{},
	);
	// A request with an unknown session id is rejected by the transport; the
	// resolver still ran exactly once for it.
	expect(resolverCalls).toBe(1);
});

/* ── M16: production wiring through kaneoNativeHandler (cycle-2 defect 1) ── */

test("M16 production wiring: kaneoNativeHandler's own MCP assembly proxies with the caller's token and carries userRole", async () => {
	const { kaneoNativeHandler } = await import("../../packages/kaneo/src/http");
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	// Cycle-3 defect 1: the production assembly must pass its telemetry
	// through to the MCP runtime — asserted HERE, through kaneoNativeHandler,
	// so dropping the pass-through in kaneo/src/http.ts goes red.
	const telemetry = TelemetryTest();
	// Real PG for the guard path; the upstream is the shared stub.
	const db = await disposablePostgres();
	resources.push(db.close);
	const opts = db.sql.options as unknown as {
		host: string[];
		database: string;
		user: string;
	};
	const url = `postgresql://${opts.user}@localhost/${opts.database}?host=${encodeURIComponent(opts.host[0])}`;
	process.env.DATABASE_URL = url;
	const { migrate } = await import("drizzle-orm/postgres-js/migrator");
	const { drizzle } = await import("drizzle-orm/postgres-js");
	await migrate(drizzle(db.sql), {
		migrationsFolder: "packages/kaneo-legacy/drizzle",
	});

	// Seed a task whose board belongs to an org the caller does NOT belong
	// to: only the instance-admin branch can pass guardTask.
	const { schema, DbLive } = await import("../../packages/kaneo/src/kernel");
	const adminId = "prodw-admin";
	const taskId = "prodw-task";
	const boardId = "prodw-board";
	const orgId = "prodw-org";
	await Effect.runPromise(
		Effect.gen(function* () {
			const database = yield* Db;
			yield* database.insert(schema.userTable).values({
				id: adminId,
				name: "ProdAdmin",
				email: "admin@prodw.test",
				role: "admin",
			});
			yield* database.insert(schema.organizationTable).values({
				id: orgId,
				name: "PO",
				slug: "prodw-org",
				createdAt: new Date(),
			});
			yield* database.insert(schema.boardTable).values({
				id: boardId,
				name: "PB",
				slug: "prodw-board",
				organizationId: orgId,
			});
			yield* database.insert(schema.taskTable).values({
				id: taskId,
				title: "PT",
				boardId,
			});
		}).pipe(Effect.provide(DbLive(url))),
	);

	// The host production assembly: KANEO_API_URL → the stub upstream; the
	// adapter maps the resolved principal exactly as kaneo/src/http.ts does.
	const savedApiUrl = process.env.KANEO_API_URL;
	process.env.KANEO_API_URL = upstreamBase;
	const savedCors = process.env.CORS_ORIGINS;
	delete process.env.CORS_ORIGINS;
	const savedClient = process.env.KANEO_CLIENT_URL;
	delete process.env.KANEO_CLIENT_URL;
	const prod = kaneoNativeHandler({
		databaseUrl: url,
		resolvePrincipal: async (headers) => {
			const token = headers
				.get("authorization")
				?.match(/^Bearer\s+(\S+)$/i)?.[1];
			if (token !== "prod-token") return null;
			return { userId: adminId, userRole: "admin", apiKey: null };
		},
		ports: {
			publish: async () => {},
			labelSync: {
				upsert: async () => {},
				remove: async () => {},
			},
		},
		telemetry: telemetry.layer,
	});
	resources.push(prod.dispose);
	const prodSrv = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (r) => prod.handler(r),
	});
	const prodBase = prodSrv.url.origin;
	resources.push(async () => {
		prodSrv.stop(true);
	});

	// Initialize through the PRODUCTION handler, then call two tools:
	// list_organizations (pure proxy) and get_task (guard + proxy).
	const init = await fetch(`${prodBase}/api/mcp`, {
		method: "POST",
		headers: { ...j, authorization: "Bearer prod-token" },
		body: initBody("2025-06-18"),
	});
	expect(init.status).toBe(200);
	const sid = init.headers.get("mcp-session-id") ?? "";
	const ver = (await readRpc(init))?.result?.protocolVersion ?? "";
	expect(sid).toBeTruthy();

	const hitsBefore = upstreamHits.length;
	const listOrgs = await call(prodBase, sid, ver, "prod-token", "tools/call", {
		name: "list_organizations",
		arguments: {},
	});
	// The stub upstream was reached — the base URL flowed from
	// KANEO_API_URL through mcpTools into the proxy — and it saw the
	// caller's bearer token, not an empty one.
	expect(listOrgs.body?.result?.isError).toBeFalsy();
	expect(upstreamHits.length).toBe(hitsBefore + 1);
	expect(upstreamHits.at(-1)?.path).toBe("/api/organization");
	expect(upstreamHits.at(-1)?.auth).toBe("Bearer prod-token");

	// Guard-backed tool through production wiring: the adapter carried
	// userRole:"admin", so guardTask passes the instance-admin branch for a
	// board the caller does not belong to, then proxies with the token.
	const hitsBefore2 = upstreamHits.length;
	const getTask = await call(prodBase, sid, ver, "prod-token", "tools/call", {
		name: "get_task",
		arguments: { taskId },
	});
	expect(getTask.body?.result?.isError).toBeFalsy();
	expect(upstreamHits.length).toBe(hitsBefore2 + 1);
	expect(upstreamHits.at(-1)?.path).toBe(`/api/task/${taskId}`);
	expect(upstreamHits.at(-1)?.auth).toBe("Bearer prod-token");

	// Cycle-3 defect 1, at the PRODUCTION call site: the spans reached the
	// telemetry layer the host passed in — not the no-op tracer.
	await telemetry.reader.forceFlush();
	const spanNames = telemetry.spans.getFinishedSpans().map((s) => s.name);
	expect(spanNames).toContain("mcp.tool.list_organizations");
	expect(spanNames).toContain("mcp.tool.get_task");

	// Restore env for the other tests sharing this process.
	process.env.KANEO_API_URL = savedApiUrl;
	if (savedCors !== undefined) process.env.CORS_ORIGINS = savedCors;
	else delete process.env.CORS_ORIGINS;
	if (savedClient !== undefined) process.env.KANEO_CLIENT_URL = savedClient;
	else delete process.env.KANEO_CLIENT_URL;
}, 120_000);

/* ── M17–M19: origin/preflight/cookie gate (cycle-2 defects 2–4) ── */

test("M17 CORS preflight: OPTIONS /api/mcp → 204 + legacy header set, never 401 (defect 2)", async () => {
	const r = await fetch(`${effBase}/api/mcp`, {
		method: "OPTIONS",
		headers: {
			origin: "http://localhost:5273",
			"access-control-request-method": "POST",
			"access-control-request-headers":
				"authorization,content-type,mcp-session-id,mcp-protocol-version",
		},
	});
	expect(r.status).toBe(204);
	expect(r.headers.get("access-control-allow-origin")).toBe(
		"http://localhost:5273",
	);
	expect(r.headers.get("access-control-allow-credentials")).toBe("true");
	expect(r.headers.get("access-control-allow-methods")).toContain("POST");
	expect(r.headers.get("access-control-allow-headers")).toContain(
		"mcp-session-id",
	);
	expect(r.headers.get("www-authenticate")).toBeNull();
	// No credentials on a preflight must not leak a session either: even a
	// bogus token gets the 204 — preflight is unauthenticated by design.
	const noAuth = await fetch(`${effBase}/api/mcp`, {
		method: "OPTIONS",
		headers: {
			origin: "https://evil.example",
			"access-control-request-method": "POST",
		},
	});
	expect(noAuth.status).toBe(204);
	// Disallowed origin: still 204 (a non-2xx preflight reads as failure to
	// the browser) but WITHOUT the ACAO echo — the legacy cors() posture.
	expect(noAuth.headers.get("access-control-allow-origin")).toBeNull();
});

test("M18 cookie-only session: 401 + WWW-Authenticate, not an empty-Bearer session (defect 3)", async () => {
	// The resolver accepts the cookie session (returns a principal), but the
	// wrapper must refuse it: no bearer, no x-api-key → 401. Modeled here
	// with a principal whose token is "" (what resolvePrincipal yields for a
	// cookie-only caller).
	const r = await fetch(`${effBase}/api/mcp`, {
		method: "POST",
		headers: { ...j, authorization: "Bearer empty-token-principal" },
		body: initBody("2025-06-18"),
	});
	expect(r.status).toBe(401);
	expect(r.headers.get("www-authenticate")).toMatch(
		/^Bearer resource_metadata/,
	);
	const body = await r.json();
	expect(body.error).toBe("invalid_token");
});

test("M19 origin policy parity with withCors (defect 4): empty list reflects any origin outside production", async () => {
	// Fresh handler with NO configured origins, like a dev deployment that
	// sets neither CORS_ORIGINS nor KANEO_CLIENT_URL: any origin passes and
	// gets the ACAO echo (withCors reflect-unconfigured dev behaviour).
	const dev = mcpHttpHandler({
		tools: mcpTools(guards, upstreamBase),
		principalResolver: principalFor,
		allowedOrigins: [],
		apiBaseUrl: upstreamBase,
	});
	const srv = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (r) => dev.handler(r),
	});
	try {
		const r = await fetch(`${srv.url.origin}/api/mcp`, {
			method: "POST",
			headers: { ...j, authorization: "Bearer token-a", origin: "http://x" },
			body: initBody("2025-06-18"),
		});
		expect(r.status).toBe(200);
		expect(r.headers.get("access-control-allow-origin")).toBe("http://x");
	} finally {
		srv.stop(true);
		await dev.dispose();
	}
});

/* ── M10: guard behaviour against a real database (defect 2) ── */

test("M10 instance-admin non-member passes the board guard; plain non-member is denied", async () => {
	const db = await disposablePostgres();
	resources.push(db.close);
	const opts = db.sql.options as unknown as {
		host: string[];
		database: string;
		user: string;
	};
	const url = `postgresql://${opts.user}@localhost/${opts.database}?host=${encodeURIComponent(opts.host[0])}`;
	process.env.DATABASE_URL = url;

	// Kaneo's own drizzle migrations build the schema the guards query.
	// (Applied directly with node-postgres — importing the legacy tree here
	// would poison the shared module cache for kaneo-parity.test.ts.)
	const { migrate } = await import("drizzle-orm/postgres-js/migrator");
	const { drizzle } = await import("drizzle-orm/postgres-js");
	await migrate(drizzle(db.sql), {
		migrationsFolder: "packages/kaneo-legacy/drizzle",
	});

	const adminId = "mcp-guard-admin";
	const plebId = "mcp-guard-pleb";
	const orgId = "mcp-guard-org";
	const boardId = "mcp-guard-board";
	const { schema, DbLive } = await import("../../packages/kaneo/src/kernel");
	const seed = Effect.gen(function* () {
		const database = yield* Db;
		yield* database.insert(schema.userTable).values([
			{
				id: adminId,
				name: "Admin",
				email: "admin@mcp-guard.test",
				role: "admin",
			},
			{ id: plebId, name: "Pleb", email: "pleb@mcp-guard.test", role: "user" },
		]);
		yield* database.insert(schema.organizationTable).values({
			id: orgId,
			name: "G",
			slug: "mcp-guard-org",
			createdAt: new Date(),
		});
		yield* database.insert(schema.boardTable).values({
			id: boardId,
			name: "B",
			slug: "mcp-guard-board",
			organizationId: orgId,
		});
	});
	await Effect.runPromise(seed.pipe(Effect.provide(DbLive(url))));
	// NOTE: no organizationMember rows — both callers are NON-members; the
	// admin must pass via the instance-admin branch, the pleb must not.

	const DbLayer = DbLive(url);
	const run = (principal: McpPrincipal) =>
		mcpGuardsLive()
			.guardBoard(boardId, { task: ["read"] })
			.pipe(
				Effect.provideService(McpRequestPrincipal, principal),
				Effect.provide(Access.layer),
				Effect.provide(DbLayer),
				Effect.runPromiseExit,
			);

	const adminExit = await run({
		userId: adminId,
		userRole: "admin",
		token: "t",
	});
	// REWORK defect 2: userRole must ride through McpRequestPrincipal, so the
	// admin non-member passes (legacy isInstanceAdmin parity).
	expect(adminExit._tag).toBe("Success");

	const plebExit = await run({
		userId: plebId,
		userRole: "user",
		token: "t",
	});
	// Plain non-member: denied with the guard's ApiError.
	expect(plebExit._tag).toBe("Failure");
	// Cycle-3 defect 2: the denial lists WHAT is missing, exactly as legacy
	// assertMcpPermission did — agents read this text to self-correct.
	const plebMessage = await mcpGuardsLive()
		.guardBoard(boardId, { task: ["read"] })
		.pipe(
			Effect.provideService(McpRequestPrincipal, {
				userId: plebId,
				userRole: "user",
				token: "t",
			}),
			Effect.provide(Access.layer),
			Effect.provide(DbLayer),
			Effect.catch((e) => Effect.succeed(e.message)),
			Effect.runPromise,
		);
	expect(plebMessage).toBe(
		"Forbidden: missing required permission (task:read).",
	);
}, 120_000);

/* ── M11/M12: schema parity (defect 3) ── */

test("M11 zod .trim().min(1) parity: padded id decodes to the trimmed value", async () => {
	const { Schema } = await import("effect");
	const { GetBoard } = await import("../../packages/kaneo/src/mcp/schemas");
	const decoded = Schema.decodeUnknownSync(GetBoard)({ id: "  b-1  " });
	expect(decoded.id).toBe("b-1");
	// whitespace-only still rejected
	expect(() => Schema.decodeUnknownSync(GetBoard)({ id: "   " })).toThrow();
});

test("M12 zod .datetime({offset:true}) parity: date-only and zone-less values rejected", async () => {
	const { Schema } = await import("effect");
	const { ListTasks } = await import("../../packages/kaneo/src/mcp/schemas");
	const input = (dueBefore: string) => ({ boardId: "b", dueBefore });
	const bad = ["2026-01-01", "2026-01-01T10:00", "2026-01-01 10:00Z"];
	for (const value of bad)
		expect(() => Schema.decodeUnknownSync(ListTasks)(input(value))).toThrow();
	const good = ["2026-01-01T10:00:00Z", "2026-01-01T10:00+02:00"];
	for (const value of good)
		expect(() =>
			Schema.decodeUnknownSync(ListTasks)(input(value)),
		).not.toThrow();
});

/* ── M20: telemetry parity (cycle-3 defect 1) ── */

test("M20 telemetry: mcp.tool.<name> spans land in the telemetry layer passed to mcpHttpHandler", async () => {
	// Built like production: the telemetry layer rides the SAME options the
	// host passes (kaneoNativeHandler → mcpHttpHandler.telemetry). If the
	// pass-through is dropped, the spans go to the no-op tracer and this
	// test sees nothing.
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const telemetry = TelemetryTest();
	const mcp = mcpHttpHandler({
		tools: mcpTools(guards, upstreamBase),
		principalResolver: principalFor,
		allowedOrigins: [],
		apiBaseUrl: upstreamBase,
		telemetry: telemetry.layer,
	});
	const srv = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (r) => mcp.handler(r),
	});
	try {
		const init = await fetch(`${srv.url.origin}/api/mcp`, {
			method: "POST",
			headers: { ...j, authorization: "Bearer token-a" },
			body: initBody("2025-06-18"),
		});
		expect(init.status).toBe(200);
		const sid = init.headers.get("mcp-session-id") ?? "";
		const ver = (await readRpc(init))?.result?.protocolVersion ?? "";
		const listOrgs = await call(
			srv.url.origin,
			sid,
			ver,
			"token-a",
			"tools/call",
			{ name: "list_organizations", arguments: {} },
		);
		expect(listOrgs.body?.result?.isError).toBeFalsy();
		await telemetry.reader.forceFlush();
		const spanNames = telemetry.spans.getFinishedSpans().map((s) => s.name);
		// The tool span must reach the exporter — telemetry parity with the
		// rest of the v4 tree is an acceptance criterion of the brief.
		expect(spanNames).toContain("mcp.tool.list_organizations");
		// The proxy fetch inside the tool is spanned too.
		expect(spanNames).toContain("mcp.api.fetch");
	} finally {
		srv.stop(true);
		await mcp.dispose();
	}
}, 60_000);

/* ── M22: same-origin in production with an empty allow-list (cycle-3 defect 3) ── */

test("M22 same-origin requests pass in production even with an EMPTY allow-list (defect 3)", async () => {
	const savedEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = "production";
	try {
		// A same-origin browser POST (Origin matches Host) must NOT 403 when
		// nobody configured CORS_ORIGINS/KANEO_CLIENT_URL — the bundled
		// single-origin deployment legacy served fine.
		const sameOrigin = new Request("https://stellarc.example/api/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				host: "stellarc.example",
				origin: "https://stellarc.example",
			},
			body: initBody("2025-06-18"),
		});
		expect(isMcpOriginAllowed("https://stellarc.example", [], sameOrigin)).toBe(
			true,
		);
		// A cross-origin request in that same deployment stays 403 (empty
		// list in production = allow only same-origin).
		const crossOrigin = new Request("https://stellarc.example/api/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				host: "stellarc.example",
				origin: "https://evil.example",
			},
			body: initBody("2025-06-18"),
		});
		expect(isMcpOriginAllowed("https://evil.example", [], crossOrigin)).toBe(
			false,
		);
	} finally {
		if (savedEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = savedEnv;
	}
});
