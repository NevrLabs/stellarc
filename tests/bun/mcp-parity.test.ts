import { afterAll, beforeAll, expect, test } from "bun:test";
import { Effect } from "effect";
import { Access, Db } from "../../packages/kaneo/src/kernel";
import { mcpGuardsLive } from "../../packages/kaneo/src/mcp/guards";
import { mcpHttpHandler } from "../../packages/kaneo/src/mcp/http";
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
 *  M5   strengthened: termination ABORTS the upstream fetch (defect 6).
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
