/**
 * Effect-v4 MCP HTTP surface: `effect/ai` McpServer.layerHttp behind the
 * legacy token gate (port of kaneo-legacy src/mcp/index.ts transport part).
 *
 * Auth stays host-side, as effect/ai expects: the gate middleware resolves
 * the caller (BetterAuth session bearer or agent API key, both header forms)
 * BEFORE the MCP transport sees the request, and rejects with the same 401 +
 * WWW-Authenticate resource-metadata shape as the legacy tree. Session
 * ownership is enforced per request — a session id minted for user A answers
 * 404, never 200, for user B (same anti-enumeration posture as legacy
 * isMcpSessionOwner).
 *
 * OAuth consent endpoints (/mcp/register, /mcp/authorize*, /mcp/token,
 * well-knowns) are NOT part of this port: they stay in the legacy Hono tree
 * untouched (issue scope: transport + tools only).
 */

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

let gateBaseUrl = "";
/** Set once at host wiring (same value the legacy tree derives from env). */
export const setMcpGateBaseUrl = (url: string) => {
	gateBaseUrl = url.replace(/\/api\/?$/, "");
};
const apiBaseUrlForGate = () => gateBaseUrl;

/** Session id → owner, called from the wiring layer after each response. */
export const recordSessionOwner = (sid: string | null, userId: string) => {
	if (sid) sessionOwners.set(sid, userId);
};

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
	readonly apiBaseUrl: string;
	/** Services the tool handlers resolve at request time (Db, Access for the
	 * permission guards). Merged into the MCP runtime context. */
	// biome-ignore lint/suspicious/noExplicitAny: host service layer, unified below
	readonly services?: Layer.Layer<any, any, never>;
	readonly memoMap?: Layer.MemoMap;
}

/**
 * Build the Effect-native MCP endpoint: gate + layerHttp, as a web handler.
 * `matches` lets the host route /api/mcp here exactly as legacy did.
 */
export function mcpHttpHandler(options: McpHttpOptions) {
	setMcpGateBaseUrl(options.apiBaseUrl);
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
				options.principalResolver,
			) as unknown as typeof app,
	});
	// After each response, learn session ownership from the response header.
	const wrapped = async (request: Request) => {
		const response = await handler(request);
		const principal = await options
			.principalResolver(new Headers(request.headers))
			.catch(() => null);
		if (principal) {
			const newSid = response.headers.get("mcp-session-id");
			if (newSid) sessionOwners.set(newSid, principal.userId);
			if (request.method === "DELETE") {
				const ended = request.headers.get("mcp-session-id");
				if (ended && response.status === 204) sessionOwners.delete(ended);
			}
		}
		return response;
	};
	return {
		handler: wrapped as (request: Request) => Promise<Response>,
		dispose: async () => {
			sessionOwners.clear();
			await dispose();
		},
	};
}

/** Effect middleware: resolve the caller BEFORE the transport sees the
 * request; 401 (gate) or 404 (session not owned) short-circuits. */
const gate = (
	app: Effect.Effect<never, never, never>,
	resolver: PrincipalResolver,
) =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const principal: McpPrincipal | null = yield* Effect.tryPromise({
			try: () => resolver(new Headers(request.headers)),
			catch: () => null,
		}).pipe(Effect.flatMap((p) => Effect.succeed(p)));
		if (!principal) {
			const prm = `${apiBaseUrlForGate()}/api/.well-known/oauth-protected-resource/api/mcp`;
			return HttpServerResponse.jsonUnsafe(
				{
					error: "invalid_token",
					error_description: "Missing or invalid token",
				},
				{
					status: 401,
					headers: { "www-authenticate": `Bearer resource_metadata="${prm}"` },
				},
			) as never;
		}
		const sid = request.headers["mcp-session-id"];
		if (sid !== undefined) {
			const owner = sessionOwners.get(sid);
			// Mismatched owner is reported as missing, never forbidden, so the
			// response cannot confirm someone else's session id is valid.
			if (owner !== undefined && owner !== principal.userId) {
				return HttpServerResponse.jsonUnsafe(
					{ error: "Session not found" },
					{ status: 404 },
				) as never;
			}
		}
		return (yield* Effect.provideService(
			app,
			McpRequestPrincipal,
			principal,
		)) as never;
	}) as never;
