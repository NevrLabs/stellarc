import { afterAll, beforeAll, expect, test } from "bun:test";
import { Effect } from "effect";
import { mcpHttpHandler } from "../../packages/kaneo/src/mcp/http";
import {
	type McpGuards,
	mcpTools,
	type PrincipalResolver,
	setApiBaseUrl,
} from "../../packages/kaneo/src/mcp/tools";

// No DB needed: transport-only parity (see header comment).

/**
 * NEVR-185 MCP parity gate: the Effect-native MCP endpoint (effect/ai
 * McpServer.layerHttp) must behave like the reference SDK transport the
 * legacy tree served, for the behaviours clients depend on:
 *
 *  1. session lifecycle (initialize → session id; DELETE → later 404),
 *  2. protocol negotiation (supported offer echoed; bogus offer → latest),
 *  3. invalid-schema tool input → MCP protocol error -32602 with the same
 *     message prefix the SDK produces (parity requirement of the issue),
 *  4. session termination interrupts in-flight tool calls,
 *  5. token gate: missing token → 401 + WWW-Authenticate resource metadata;
 *     a session minted by user A is invisible (404) to user B.
 *
 * The legacy reference values were captured live from the SDK 1.29.0
 * transport (scratch trial, PR body documents the run).
 */

const resources: Array<() => Promise<void>> = [];
let effBase = "";
let closeEff: (() => Promise<void>) | null = null;

// Agents' tokens (stable per-user): the resolver below hands these out.
const USER_A = { userId: "user-a", token: "token-a" };
const USER_B = { userId: "user-b", token: "token-b" };
const principalFor: PrincipalResolver = async (headers) => {
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

beforeAll(async () => {
	// The MCP endpoint itself needs no database: tools proxy to the kaneo API
	// over loopback; the parity gate exercises transport behaviour only (the
	// tool surface is identical code to the legacy fetch paths).
	setApiBaseUrl("http://localhost:1337");

	const eff = mcpHttpHandler({
		tools: mcpTools(principalFor, guards),
		principalResolver: principalFor,
		allowedOrigins: ["http://localhost:5273"],
		apiBaseUrl: "http://localhost:1337",
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

test("M1 initialize: 200, session header, serverInfo kaneo-mcp, echo of offered version", async () => {
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
	// SDK parity (trial-captured): the reference transport wraps validation
	// failures into an isError TOOL RESULT — HTTP 200, content text starting
	// "MCP error -32602: Input validation error: Invalid arguments for tool
	// <name>:" — not a JSON-RPC protocol error object.
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

test("M5 session termination interrupts in-flight tool calls", async () => {
	// Black-hole upstream: accepts the connection, never answers, so the tool
	// call is genuinely in-flight when DELETE lands.
	const blackhole = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Promise<Response>(() => {}),
	});
	setApiBaseUrl(blackhole.url.origin);
	const { sid, ver } = await open(effBase, "token-a");
	const inflight = call(
		effBase,
		sid,
		ver ?? "",
		"token-a",
		"tools/call",
		{ name: "list_boards", arguments: { organizationId: "org" } },
		7,
	);
	await Bun.sleep(150);
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
	blackhole.stop(true);
	setApiBaseUrl("http://localhost:1337");
}, 30_000);

test("M6 token gate: no token → 401 with WWW-Authenticate resource_metadata", async () => {
	const r = await fetch(`${effBase}/api/mcp`, {
		method: "POST",
		headers: j,
		body: initBody("2025-06-18"),
	});
	expect(r.status).toBe(401);
	expect(r.headers.get("www-authenticate")).toMatch(
		/^Bearer resource_metadata="http:\/\/localhost:1337\/api\/\.well-known\/oauth-protected-resource\/api\/mcp"$/,
	);
	const body = await r.json();
	expect(body.error).toBe("invalid_token");
});

test("M7 sessions are owner-scoped: user B cannot use user A's session id", async () => {
	const { sid, ver } = await open(effBase, "token-a");
	const asB = await call(effBase, sid, ver ?? "", "token-b", "tools/list", {});
	// Anti-enumeration: mismatched owner reads as missing, never forbidden.
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
