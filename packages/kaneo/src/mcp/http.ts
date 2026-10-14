/**
 * Effect-v4 MCP HTTP surface: `effect/ai` McpServer.layerHttp behind the
 * legacy token gate (port of kaneo-legacy src/mcp/index.ts transport part).
 *
 * Auth stays host-side, as effect/ai expects: the wrapper resolves the caller
 * (BetterAuth session bearer or agent API key, both header forms) exactly ONCE
 * per request (REWORK defect 5), hands it to the transport through an
 * AsyncLocalStorage slot, and rejects with the same 401 +
 * WWW-Authenticate resource-metadata shape as the legacy tree. Session
 * ownership is enforced per request — a session id minted for user A answers
 * 404, never 200, for user B (same anti-enumeration posture as legacy
 * isMcpSessionOwner).
 *
 * All HTTP methods on /api/mcp route here (REWORK defect 4): the transport
 * itself answers GET/PUT/PATCH/OPTIONS with 405, matching the legacy
 * `mcp.all("/mcp")` fall-through.
 *
 * OAuth consent endpoints (/mcp/register, /mcp/authorize*, /mcp/token,
 * well-knowns) are NOT part of this port: they stay in the legacy Hono tree
 * untouched (issue scope: transport + tools only).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect, Layer } from "effect";
import { McpServer as EMcp, McpProtocol, McpSchema } from "effect/ai";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import {
	type McpPrincipal,
	McpRequestPrincipal,
	type McpToolSpec,
	type PrincipalResolver,
} from "./tools";

const NAME = "kaneo-mcp";
const VERSION = "1.0.0";

/** Session-id → owner userId, mirroring the legacy sessions Map. */
const sessionOwners = new Map<string, string>();

/** Escape hatch for tests: observe the mcp-session-id → owner mapping. */
export const __testSessionOwners = sessionOwners;

/** Per-request principal: resolved once in the wrapper, consumed by the gate
 * middleware (via McpRequestPrincipal) and the tool guards. */
const requestPrincipal = new AsyncLocalStorage<McpPrincipal>();

const unauthenticated = (apiRoot: string) =>
	Response.json(
		{ error: "invalid_token", error_description: "Missing or invalid token" },
		{
			status: 401,
			headers: {
				"www-authenticate": `Bearer resource_metadata="${apiRoot}/api/.well-known/oauth-protected-resource/api/mcp"`,
			},
		},
	);

const sessionNotFound = Response.json(
	{ error: "Session not found" },
	{ status: 404 },
);

/* ---------- tool registration ---------- */

const registerTools = (tools: ReadonlyArray<McpToolSpec>) =>
	Layer.effectDiscard(
		Effect.gen(function* () {
			const server = yield* EMcp.McpServer;
			for (const spec of tools) {
				yield* server.addTool({
					tool: new McpSchema.Tool({
						name: spec.name,
						description: spec.description,
						inputSchema: spec.jsonSchema,
					}),
					annotations: Context.empty(),
					handle: (payload: unknown) =>
						spec
							.handler(payload)
							.pipe(Effect.withSpan(`mcp.tool.${spec.name}`)) as never,
				});
			}
		}),
	);

export interface McpHttpOptions {
	readonly tools: ReadonlyArray<McpToolSpec>;
	readonly principalResolver: PrincipalResolver;
	/** Origins allowed to call the MCP endpoint (DNS-rebinding guard). */
	readonly allowedOrigins: ReadonlyArray<string>;
	/** Loopback Kaneo API root (e.g. http://localhost:1337) the tools proxy
	 * to. Required and asserted non-empty (REWORK defect 1). */
	readonly apiBaseUrl: string;
	/** Services the tool handlers resolve at request time (Db, Access for the
	 * permission guards). Merged into the MCP runtime context. */
	// biome-ignore lint/suspicious/noExplicitAny: host service layer, unified below
	readonly services?: Layer.Layer<any, any, never>;
	readonly memoMap?: Layer.MemoMap;
}

/**
 * Build the Effect-native MCP endpoint: gate + layerHttp, as a web handler.
 * Route ALL methods on /api/mcp here — `isNative` gives this handler the
 * whole path and the transport 405s what it does not serve.
 */
export function mcpHttpHandler(options: McpHttpOptions) {
	// REWORK defect 1: an empty base URL is mis-wired production — fail
	// loudly at construction instead of every tool dying at fetch time.
	const apiRoot = options.apiBaseUrl.replace(/\/api\/?$/, "");
	if (apiRoot.trim() === "")
		throw new Error(
			"mcpHttpHandler: apiBaseUrl is empty — MCP tools cannot proxy to the API",
		);
	const Base = registerTools(options.tools).pipe(
		Layer.provideMerge(
			EMcp.layerHttp({
				name: NAME,
				version: VERSION,
				path: "/api/mcp",
				// Same revision set the reference SDK 1.29.0 advertises
				// (SUPPORTED_PROTOCOL_VERSIONS minus the legacy 2024-10-07).
				protocols: [
					McpProtocol.v2025_11_25,
					McpProtocol.v2025_06_18,
					McpProtocol.v2025_03_26,
					McpProtocol.v2024_11_05,
				],
				allowedOrigins: options.allowedOrigins,
				allowSessionTermination: true,
			}).pipe(Layer.provideMerge(HttpRouter.layer)),
		),
		Layer.provideMerge(options.services ?? Layer.empty),
	);
	const { handler, dispose } = HttpRouter.toWebHandler(Base, {
		memoMap: options.memoMap,
		middleware: (app) =>
			gate(
				app as unknown as Effect.Effect<never, never, never>,
			) as unknown as typeof app,
	});
	const wrapped = async (request: Request): Promise<Response> => {
		// Single principal resolution per request (REWORK defect 5): reused by
		// the gate, the tools, and the session-owner bookkeeping below.
		const principal = await options
			.principalResolver(new Headers(request.headers))
			.catch(() => null);
		if (!principal) return unauthenticated(apiRoot);
		const sid = request.headers.get("mcp-session-id");
		if (sid !== null) {
			const owner = sessionOwners.get(sid);
			// Mismatched owner is reported as missing, never forbidden, so the
			// response cannot confirm someone else's session id is valid.
			if (owner !== undefined && owner !== principal.userId)
				return sessionNotFound;
		}
		const response = await requestPrincipal.run(principal, () =>
			handler(request),
		);
		// Learn session ownership from the initialize response header; forget
		// ended sessions after a terminating DELETE.
		const newSid = response.headers.get("mcp-session-id");
		if (newSid) sessionOwners.set(newSid, principal.userId);
		if (request.method === "DELETE") {
			const ended = request.headers.get("mcp-session-id");
			if (ended && response.status === 204) sessionOwners.delete(ended);
		}
		return response;
	};
	return {
		handler: wrapped,
		dispose: async () => {
			sessionOwners.clear();
			await dispose();
		},
	};
}

/** Effect middleware: the wrapper already resolved + authenticated the
 * caller; provide it to the transport as McpRequestPrincipal. Requests that
 * somehow bypass the wrapper are rejected, never anonymised. */
const gate = (app: Effect.Effect<never, never, never>) =>
	Effect.gen(function* () {
		const store = requestPrincipal.getStore();
		if (store === undefined) {
			// Unreachable via the wrapper (it always authenticates first) —
			// kept as a fail-closed guard for any other mount point.
			const request = yield* HttpServerRequest.HttpServerRequest;
			const origin = new URL(request.url).origin;
			return HttpServerResponse.jsonUnsafe(
				{
					error: "invalid_token",
					error_description: "Missing or invalid token",
				},
				{
					status: 401,
					headers: {
						"www-authenticate": `Bearer resource_metadata="${origin}/api/.well-known/oauth-protected-resource/api/mcp"`,
					},
				},
			) as never;
		}
		return (yield* Effect.provideService(
			app,
			McpRequestPrincipal,
			store,
		)) as never;
	}) as never;
