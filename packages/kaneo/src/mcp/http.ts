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
 * isMcpSessionOwner). A resolved principal with an empty token does not
 * authenticate (rework cycle 2, defect 3): legacy `validateBearerToken`
 * required `Authorization: Bearer …` or `x-api-key`, so a cookie-only
 * session — which `resolvePrincipal` would otherwise accept — is a 401 here
 * too, never a session whose proxied calls all fail with `Bearer `.
 *
 * Origin policy lives in this wrapper, not the transport (cycle 2, defects
 * 2 & 4), mirroring the legacy `cors()` middleware and host `withCors`:
 * - Preflight (OPTIONS) is answered BEFORE the token gate with the same
 *   204 + reflected headers hono's cors() produced: browsers send no
 *   credentials with an OPTIONS preflight, so a 401 there breaks every
 *   browser-based MCP client.
 * - No Origin header (non-browser clients) always passes. An empty
 *   configured origin list reflects ANY origin outside production (dev
 *   convenience, same rule as withCors); otherwise exact membership.
 *   Disallowed origins get 403 — effect/ai's DNS-rebinding posture,
 *   deliberately stricter than legacy's silent no-ACAO response; recorded
 *   in the PR's behavioral-differences table.
 * - Origin is stripped before the request enters the transport, so the
 *   transport's own membership check always passes and this wrapper is the
 *   single origin authority; allowed-origin responses carry the ACAO echo.
 *
 * All HTTP methods on /api/mcp route here (REWORK defect 4): the transport
 * itself answers GET/PUT/PATCH with 405, matching the legacy
 * `mcp.all("/mcp")` fall-through, and OPTIONS is the CORS preflight above.
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

/** Session-id → owner userId, mirroring the legacy sessions Map.
 *
 * effect/ai's McpServer exposes no session-close hook (checked: its d.ts
 * has addTool/addResource/addPrompt/notify* only), so entries for clients
 * that disconnect without DELETE cannot be reaped on close. Bounded
 * instead: pruned on the events we DO see (terminating DELETE, a request
 * whose session the transport reports missing) and capped with oldest
 * eviction at MAX_SESSION_OWNERS — each entry is ~100 bytes, the cap is a
 * few MB, and a pruned/capped session id simply re-registers on the
 * caller's next initialize (cycle-3 defect 4). */
const sessionOwners = new Map<string, { userId: string; at: number }>();
const MAX_SESSION_OWNERS = 30_000;

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

/* ---------- origin policy (cycle-2 defects 2 & 4) ---------- */

/** `withCors` semantics: no Origin (non-browser) always passes; an empty
 * configured list reflects any origin outside production; else membership.
 * Same-origin requests (Origin host == request Host) always pass: a
 * browser POST always sends Origin, so without this an unconfigured
 * single-origin production deployment would 403 its own UI — legacy
 * served such requests (cycle-3 defect 3). */
export const isMcpOriginAllowed = (
	origin: string | null,
	allowedOrigins: ReadonlyArray<string>,
	request?: Request,
): boolean => {
	if (origin === null) return true;
	// Same-origin browser requests (Origin host matches the request Host).
	if (request !== undefined) {
		try {
			const originHost = new URL(origin).host;
			const host = request.headers.get("host") ?? new URL(request.url).host;
			if (originHost !== "" && originHost === host) return true;
		} catch {
			// malformed Origin falls through to the configured-list check
		}
	}
	return allowedOrigins.length === 0
		? process.env.NODE_ENV !== "production"
		: allowedOrigins.includes(origin);
};

/** Preflight exactly as the legacy hono `cors()` middleware answered it:
 * always 204 — never authenticated (browsers send no credentials with
 * OPTIONS) — ACAO reflected only for allowed origins, credentials true,
 * Access-Control-Request-Headers echoed, Vary set. */
const preflight = (
	request: Request,
	origin: string | null,
	allowed: boolean,
): Response => {
	const headers = new Headers();
	if (allowed) {
		headers.set("access-control-allow-origin", origin ?? "*");
		headers.set("vary", "Origin");
	}
	headers.set("access-control-allow-credentials", "true");
	headers.set(
		"access-control-allow-methods",
		"GET, HEAD, PUT, POST, DELETE, PATCH",
	);
	const requestHeaders = request.headers.get("access-control-request-headers");
	if (requestHeaders) {
		headers.set("access-control-allow-headers", requestHeaders);
		headers.append("vary", "Access-Control-Request-Headers");
	}
	return new Response(null, { status: 204, headers });
};

/** Same request with the Origin header removed: this wrapper is the single
 * origin authority, so the transport's own check must always pass. */
const withoutOrigin = (request: Request): Request => {
	const forwarded = new Request(request);
	forwarded.headers.delete("origin");
	return forwarded;
};

/** ACAO echo for allowed-origin responses — the `withCors` behaviour,
 * repeated so the handler is self-contained when mounted without it. */
const withAcao = (response: Response, origin: string): Response => {
	const headers = new Headers(response.headers);
	headers.set("access-control-allow-origin", origin);
	headers.set("access-control-allow-credentials", "true");
	headers.append("vary", "Origin");
	return new Response(response.body, { status: response.status, headers });
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
	/** Origins allowed to call the MCP endpoint (DNS-rebinding guard).
	 * Empty list = reflect any origin outside production (withCors parity). */
	readonly allowedOrigins: ReadonlyArray<string>;
	/** Loopback Kaneo API root (e.g. http://localhost:1337) the tools proxy
	 * to. Required and asserted non-empty (REWORK defect 1). */
	readonly apiBaseUrl: string;
	/** Services the tool handlers resolve at request time (Db, Access for the
	 * permission guards). Merged into the MCP runtime context. */
	// biome-ignore lint/suspicious/noExplicitAny: host service layer, unified below
	readonly services?: Layer.Layer<any, any, never>;
	/** Tracing/telemetry layer (OTLP spans/logs/metrics) the MCP runtime
	 * must participate in, like the rest of the v4 tree — without it the
	 * mcp.tool.<name> spans go to the no-op tracer (cycle-3 defect 1).
	 * Self-contained layer (no requirements), like the host's own
	 * `telemetry?: Layer.Layer<never>` option. */
	readonly telemetry?: Layer.Layer<never> | undefined;
	readonly memoMap?: Layer.MemoMap;
}

/**
 * Build the Effect-native MCP endpoint: gate + layerHttp, as a web handler.
 * Route ALL methods on /api/mcp here — `isNative` gives this handler the
 * whole path; OPTIONS is the CORS preflight, the transport 405s the rest.
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
				// Origin enforcement lives in this wrapper (withCors parity,
				// including the dev reflect-all rule); requests reach the
				// transport Origin-less so its own check always passes.
				allowedOrigins: [],
				allowSessionTermination: true,
			}).pipe(Layer.provideMerge(HttpRouter.layer)),
		),
		Layer.provideMerge(options.services ?? Layer.empty),
		// Telemetry parity (cycle-3 defect 1): the same layer the host
		// mounts for its own runtime, so mcp.tool.* / mcp.api.fetch spans
		// reach OTLP instead of the default no-op tracer.
		Layer.provideMerge(options.telemetry ?? Layer.empty),
	);
	const { handler, dispose } = HttpRouter.toWebHandler(Base, {
		memoMap: options.memoMap,
		middleware: (app) =>
			gate(
				app as unknown as Effect.Effect<never, never, never>,
			) as unknown as typeof app,
	});
	const wrapped = async (request: Request): Promise<Response> => {
		// Origin policy first (cycle-2 defects 2 & 4): preflight is never
		// authenticated, and disallowed origins never reach the token gate.
		const origin = request.headers.get("origin");
		const allowed = isMcpOriginAllowed(origin, options.allowedOrigins, request);
		if (request.method === "OPTIONS")
			return preflight(request, origin, allowed);
		if (!allowed) return new Response(null, { status: 403 });
		// Single principal resolution per request (REWORK defect 5): reused by
		// the gate, the tools, and the session-owner bookkeeping below.
		const principal = await options
			.principalResolver(new Headers(request.headers))
			.catch(() => null);
		// Defect 3 (cycle 2): a principal without a token (cookie-only
		// session) does NOT authenticate — legacy required a bearer/api key.
		if (!principal || principal.token === "") return unauthenticated(apiRoot);
		const sid = request.headers.get("mcp-session-id");
		if (sid !== null) {
			const owner = sessionOwners.get(sid);
			// Mismatched owner is reported as missing, never forbidden, so the
			// response cannot confirm someone else's session id is valid.
			if (owner !== undefined && owner.userId !== principal.userId)
				return sessionNotFound;
		}
		const response = await requestPrincipal.run(principal, () =>
			handler(origin === null ? request : withoutOrigin(request)),
		);
		// The transport 404s a session id it does not know: the session is
		// gone, so forget the owner too (prune, cycle-3 defect 4).
		if (sid !== null && response.status === 404) sessionOwners.delete(sid);
		// Learn session ownership from the initialize response header; forget
		// ended sessions after a terminating DELETE.
		const newSid = response.headers.get("mcp-session-id");
		if (newSid) {
			sessionOwners.set(newSid, { userId: principal.userId, at: Date.now() });
			// Oldest-first eviction keeps the map bounded (defect 4): Map
			// iterates in insertion order and re-setting a key keeps its
			// original position, so first-key = least recently created.
			while (sessionOwners.size > MAX_SESSION_OWNERS) {
				const oldest = sessionOwners.keys().next().value;
				if (oldest === undefined) break;
				sessionOwners.delete(oldest);
			}
		}
		if (request.method === "DELETE") {
			const ended = request.headers.get("mcp-session-id");
			if (ended && response.status === 204) sessionOwners.delete(ended);
		}
		return origin === null ? response : withAcao(response, origin);
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
