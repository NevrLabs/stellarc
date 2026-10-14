/**
 * NEVR-185 scratch trial (never committed): reference SDK 1.29.0 transport vs
 * effect/ai 4.0.2 McpServer.layerHttp — identical dummy tools behind no gate,
 * raw-HTTP probes over session lifecycle, protocol negotiation, Origin
 * handling, error shapes. Prints a DIFF table. Run: bun scratch-mcp-trial.ts
 */
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { z } from "zod";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/http";
import { HttpRouter } from "effect/http";
import { McpProtocol, McpSchema, McpServer as EMcp } from "effect/ai";

const NAME = "kaneo-mcp";
const VERSION = "1.0.0";
const ALLOWED_ORIGIN = "http://localhost:5273";

type Row = { name: string; ref: string; eff: string; same: boolean; note?: string };
const rows: Row[] = [];
const row = (name: string, ref: unknown, eff: unknown, note?: string) =>
	rows.push({
		name,
		ref: typeof ref === "string" ? ref : JSON.stringify(ref),
		eff: typeof eff === "string" ? eff : JSON.stringify(eff),
		same: JSON.stringify(ref) === JSON.stringify(eff),
		note,
	});

/* ---------------- reference server (legacy mcp/index.ts shape) ----------- */
const refSessions = new Map<string, WebStandardStreamableHTTPServerTransport>();
const refApp = new Hono();
refApp.all("/mcp", async (c) => {
	const sessionId = c.req.header("mcp-session-id");
	if (sessionId) {
		const t = refSessions.get(sessionId);
		if (!t) return c.json({ error: "Session not found" }, 404);
		return t.handleRequest(c.req.raw);
	}
	if (c.req.method !== "POST") return c.json({ error: "Method not allowed" }, 405);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => randomUUID(),
	});
	transport.onclose = () => {
		if (transport.sessionId) refSessions.delete(transport.sessionId);
	};
	const server = new McpServer({ name: NAME, version: VERSION });
	server.registerTool(
		"echo",
		{ description: "Echo a message", inputSchema: z.object({ message: z.string() }) },
		async (args) => ({ content: [{ type: "text", text: JSON.stringify(args) }] }),
	);
	server.registerTool(
		"bad_input",
		{ description: "Rejects non-int", inputSchema: z.object({ n: z.number().int() }) },
		async (args) => ({ content: [{ type: "text", text: JSON.stringify(args) }] }),
	);
	server.registerTool(
		"boom",
		{ description: "Always fails", inputSchema: z.object({}) },
		async () => {
			throw new Error("boom failure");
		},
	);
	await server.connect(transport);
	const res = await transport.handleRequest(c.req.raw);
	if (transport.sessionId) refSessions.set(transport.sessionId, transport);
	return res;
});

/* ---------------- effect server ------------------------------------------ */
class McpCaller extends Context.Reference<McpCaller, { userId: string } | undefined>(
	"trial/McpCaller",
	{ defaultValue: () => undefined },
) {}

const EchoParams = Schema.Struct({ message: Schema.String });
const IntParams = Schema.Struct({ n: Schema.Int });

const textResult = (text: string, isError = false) =>
	new McpSchema.CallToolResult({
		content: [{ type: "text", text }] as never,
		...(isError ? { isError: true } : {}),
	});

const Tools = Layer.effectDiscard(
	Effect.gen(function* () {
		const server = yield* EMcp.McpServer;
		yield* server.addTool({
			tool: new McpSchema.Tool({
				name: "echo",
				description: "Echo a message",
				inputSchema: {
					type: "object",
					properties: { message: { type: "string" } },
					required: ["message"],
				},
			}),
			annotations: Context.empty(),
			handle: (payload: unknown) =>
				Effect.gen(function* () {
					const args = yield* Schema.decodeUnknownEffect(EchoParams)(payload);
					return textResult(JSON.stringify(args));
				}).pipe(Effect.catchTags({ SchemaError: (e) => Effect.fail(new McpSchema.InvalidParams({ message: `Input validation error: Invalid arguments for tool echo: ${e.message}` })) })),
		});
		yield* server.addTool({
			tool: new McpSchema.Tool({
				name: "bad_input",
				description: "Rejects non-int",
				inputSchema: {
					type: "object",
					properties: { n: { type: "integer" } },
					required: ["n"],
				},
			}),
			annotations: Context.empty(),
			handle: (payload: unknown) =>
				Effect.gen(function* () {
					const args = yield* Schema.decodeUnknownEffect(IntParams)(payload);
					return textResult(JSON.stringify(args));
				}).pipe(Effect.catchTags({ SchemaError: (e) => Effect.fail(new McpSchema.InvalidParams({ message: `Input validation error: Invalid arguments for tool bad_input: ${e.message}` })) })),
		});
		yield* server.addTool({
			tool: new McpSchema.Tool({
				name: "hdrs",
				description: "Echo request context",
				inputSchema: { type: "object", properties: {} },
			}),
			annotations: Context.empty(),
			handle: () =>
				Effect.gen(function* () {
					const req = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest);
					const caller = yield* McpCaller;
					return textResult(JSON.stringify({
						hasReq: Option.isSome(req),
						authz: Option.isSome(req) ? (req.value.headers.authorization ?? null) : null,
						caller: caller ?? null,
					}));
				}).pipe(Effect.catchAllCause((c) => Effect.succeed(textResult(`defect:${String(c).slice(0, 80)}`, true)))),
		});
		yield* server.addTool({
			tool: new McpSchema.Tool({
				name: "boom",
				description: "Always fails",
				inputSchema: { type: "object", properties: {} },
			}),
			annotations: Context.empty(),
			handle: () => Effect.succeed(textResult("boom failure", true)),
		});
	}),
);

const McpLive = EMcp.layerHttp({
	name: NAME,
	version: VERSION,
	path: "/mcp",
	protocols: [
		McpProtocol.v2025_11_25,
		McpProtocol.v2025_06_18,
		McpProtocol.v2025_03_26,
		McpProtocol.v2024_11_05,
	],
	allowedOrigins: [ALLOWED_ORIGIN],
	allowSessionTermination: true,
});

/* ---------------- probes -------------------------------------------------- */
const j = (extra: Record<string, string> = {}) => ({
	"content-type": "application/json",
	accept: "application/json, text/event-stream",
	...extra,
});
const rpc = (method: string, params: unknown, id: number | null = 1) =>
	JSON.stringify({ jsonrpc: "2.0", id, method, params });
const initBody = (ver: string) =>
	rpc("initialize", {
		protocolVersion: ver,
		capabilities: {},
		clientInfo: { name: "trial", version: "0" },
	});

const readRpc = async (r: Response, id: number | null = 1): Promise<any> => {
	const ct = r.headers.get("content-type") ?? "";
	const text = await r.text();
	if (ct.includes("text/event-stream")) {
		for (const line of text.split("\n")) {
			if (!line.startsWith("data:")) continue;
			const payload = line.slice(5).trim();
			if (!payload) continue;
			try {
				const msg = JSON.parse(payload);
				if (msg.id === id || msg.id === undefined) return msg;
			} catch {}
		}
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text.slice(0, 80) || null;
	}
};

async function main() {
	const refSrv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (r) => refApp.fetch(r) });
	const effSrv = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (r) =>
			(eff.handler as unknown as (req: Request, ctx?: Context.Context<never>) => Promise<Response>)(
				r,
				Context.make(McpCaller, { userId: "user-abc" }) as Context.Context<never>,
			),
	});
	const R = refSrv.url.origin;
	const E = effSrv.url.origin;

	const both = async (
		name: string,
		run: (base: string) => Promise<unknown>,
		note?: string,
	) => {
		const [refr, effr] = await Promise.all([run(R), run(E)]);
		row(name, refr, effr, note);
	};

	/* -- initialize + session header -- */
	await both("init: status", async (b) => (await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: initBody("2025-06-18") })).status);
	await both("init: protocolVersion echo", async (b) => {
		const r = await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: initBody("2025-06-18") });
		return (await readRpc(r))?.result?.protocolVersion;
	});
	await both("init: serverInfo.name", async (b) => {
		const r = await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: initBody("2025-06-18") });
		return (await readRpc(r))?.result?.serverInfo?.name;
	});
	await both("init: session header present", async (b) => {
		const r = await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: initBody("2025-06-18") });
		return r.headers.get("mcp-session-id") != null;
	});

	/* -- negotiation edge cases -- */
	await both("old offer 2024-11-05 → echoed?", async (b) => {
		const r = await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: initBody("2024-11-05") });
		const body = await readRpc(r);
		return body?.result?.protocolVersion ?? r.status;
	});
	await both("bogus offer 1999-01-01", async (b) => {
		const r = await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: initBody("1999-01-01") });
		const body = await readRpc(r);
		return { status: r.status, ver: body?.result?.protocolVersion ?? body?.error?.code };
	}, "SDK falls back to latest; effect rejects");

	/* -- tools/list + call -- */
	const sid = async (b: string) => {
		const r = await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: initBody("2025-06-18") });
		return { sid: r.headers.get("mcp-session-id") ?? "", ver: (await readRpc(r))?.result?.protocolVersion };
	};
	await both("tools/list count", async (b) => {
		const { sid: s, ver } = await sid(b);
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ "mcp-session-id": s, "mcp-protocol-version": ver }),
			body: rpc("tools/list", {}),
		});
		return (await readRpc(r))?.result?.tools?.length;
	});
	await both("tools/call echo: content text", async (b) => {
		const { sid: s, ver } = await sid(b);
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ "mcp-session-id": s, "mcp-protocol-version": ver }),
			body: rpc("tools/call", { name: "echo", arguments: { message: "hi" } }),
		});
		const body = await readRpc(r);
		return { status: r.status, text: body?.result?.content?.[0]?.text, isError: body?.result?.isError ?? false };
	});
	await both("tools/call bad input: error code (validation parity)", async (b) => {
		const { sid: s, ver } = await sid(b);
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ "mcp-session-id": s, "mcp-protocol-version": ver }),
			body: rpc("tools/call", { name: "bad_input", arguments: { n: "not-a-number" } }),
		});
		return { status: r.status, body: await readRpc(r) };
	}, "capture full SDK response shape for the parity fixture");
	await both("tools/call boom: isError result", async (b) => {
		const { sid: s, ver } = await sid(b);
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ "mcp-session-id": s, "mcp-protocol-version": ver }),
			body: rpc("tools/call", { name: "boom", arguments: {} }),
		});
		const body = await readRpc(r);
		return { status: r.status, isError: body?.result?.isError ?? false, text: body?.result?.content?.[0]?.text };
	});

	await both("tools/call hdrs: request context visible?", async (b) => {
		const { sid: s, ver } = await sid(b);
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ "mcp-session-id": s, "mcp-protocol-version": ver, authorization: "Bearer tok-123" }),
			body: rpc("tools/call", { name: "hdrs", arguments: {} }),
		});
		const body = await readRpc(r);
		return body?.result?.content?.[0]?.text ?? body;
	}, "does the effect handler see per-request headers + injected reference?");

	/* -- session lifecycle -- */
	await both("unknown session id: status", async (b) => {
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ "mcp-session-id": "nope", "mcp-protocol-version": "2025-06-18" }),
			body: rpc("tools/list", {}),
		});
		return r.status;
	});
	await both("sessionless non-init POST: status+body", async (b) => {
		const r = await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: rpc("tools/list", {}) });
		const t = await r.text();
		return { status: r.status, body: t.slice(0, 60) };
	});
	await both("DELETE terminates: status", async (b) => {
		const { sid: s, ver } = await sid(b);
		const r = await fetch(`${b}/mcp`, {
			method: "DELETE",
			headers: { "mcp-session-id": s, "mcp-protocol-version": ver },
		});
		return r.status;
	});
	await both("after DELETE: status", async (b) => {
		const { sid: s, ver } = await sid(b);
		await fetch(`${b}/mcp`, { method: "DELETE", headers: { "mcp-session-id": s, "mcp-protocol-version": ver } });
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ "mcp-session-id": s, "mcp-protocol-version": ver }),
			body: rpc("tools/list", {}),
		});
		return r.status;
	});

	/* -- methods + content negotiation -- */
	await both("PUT: status+allow", async (b) => {
		const r = await fetch(`${b}/mcp`, { method: "PUT" });
		return { status: r.status, allow: r.headers.get("allow") };
	});
	await both("GET (no session): status", async (b) => {
		const r = await fetch(`${b}/mcp`, {
			method: "GET",
			headers: { accept: "text/event-stream" },
			signal: AbortSignal.timeout(800),
		}).catch((e) => ({ status: `abort:${String(e.name)}` }));
		return r.status;
	}, "SDK opens SSE; effect 405s");
	await both("bad JSON: status+code", async (b) => {
		const r = await fetch(`${b}/mcp`, { method: "POST", headers: j(), body: "{nope" });
		const body = await r.json().catch(() => null);
		return { status: r.status, code: body?.error?.code };
	});
	await both("wrong accept: status", async (b) => {
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: initBody("2025-06-18"),
		});
		return r.status;
	}, "effect enforces accept both");

	/* -- origin -- */
	await both("disallowed Origin on init: status", async (b) => {
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ origin: "https://evil.example" }),
			body: initBody("2025-06-18"),
		});
		return r.status;
	}, "legacy has NO origin check (host CORS); effect 403s");
	await both("allowed Origin on init: status", async (b) => {
		const r = await fetch(`${b}/mcp`, {
			method: "POST",
			headers: j({ origin: ALLOWED_ORIGIN }),
			body: initBody("2025-06-18"),
		});
		return r.status;
	});

	effSrv.stop(true);
	refSrv.stop(true);
	await eff.dispose();

	console.log("\n=== TRIAL: reference SDK 1.29.0 vs effect/ai 4.0.2 layerHttp ===");
	for (const r of rows)
		console.log(
			`${r.same ? "SAME" : "DIFF"}  ${r.name}\n      ref=${r.ref}\n      eff=${r.eff}${r.note ? `\n      (${r.note})` : ""}`,
		);
	console.log(`\n${rows.filter((r) => !r.same).length} DIFF / ${rows.length} probes`);
}

/* build the effect web handler */
const eff = HttpRouter.toWebHandler(
	Tools.pipe(
		Layer.provideMerge(McpLive.pipe(Layer.provideMerge(HttpRouter.layer))),
	),
);
void main();
