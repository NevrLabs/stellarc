/**
 * Kaneo-compatible HTTP surface, Effect v4 native.
 *
 * Strangler composition: endpoints declared in `KaneoApi` are served by
 * Effect HttpApi handlers; every other `/api/*` path falls through to the
 * lifted legacy tree. Each migrated group removes a slice of legacy without
 * the UI noticing — same paths, same JSON.
 */

import { Cause, Effect, Layer } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { KaneoApi } from "./api";
import { BoardsLive, ColumnsLive } from "./boards";
import {
	Access,
	AuthenticationLive,
	DbLive,
	DomainEvents,
	type DomainPorts,
	type Principal,
	PrincipalResolver,
} from "./kernel";
import { LabelsLive } from "./labels";
import { mcpGuardsLive } from "./mcp/guards";
import { mcpHttpHandler } from "./mcp/http";
import { mcpTools } from "./mcp/tools";

const ROUTES: Array<[method: string, re: RegExp]> = [];
for (const group of Object.values(KaneoApi.groups))
	for (const endpoint of Object.values(group.endpoints))
		ROUTES.push([
			endpoint.method,
			new RegExp(`^${endpoint.path.replace(/:[A-Za-z]+/g, "[^/]+")}/?$`),
		]);

/** True when the Effect-native API owns this method+path. */
export const isNative = (request: Request) => {
	const path = new URL(request.url).pathname;
	// The whole MCP endpoint is native (REWORK defect 4): the transport
	// answers GET/PUT/PATCH/OPTIONS with 405, like legacy mcp.all("/mcp").
	if (path === "/api/mcp") return true;
	return ROUTES.some(([m, re]) => m === request.method && re.test(path));
};

export function kaneoNativeHandler(options: {
	databaseUrl: string;
	resolvePrincipal: (
		headers: Headers,
	) => Promise<Principal | null | "malformed">;
	ports: DomainPorts;
	telemetry?: Layer.Layer<never>;
	memoMap?: Layer.MemoMap;
}) {
	const Base = Layer.mergeAll(
		DbLive(options.databaseUrl),
		Layer.succeed(PrincipalResolver, options.resolvePrincipal),
		Layer.succeed(DomainEvents, options.ports),
	);
	// NEVR-185: Effect-native MCP transport. The gate resolves the caller
	// (session bearer or API key, both header forms) exactly as the legacy
	// validateBearerToken does; malformed/absent -> 401 + WWW-Authenticate.
	const mcpPrincipal = async (headers: Headers) => {
		const p = await options.resolvePrincipal(headers);
		if (!p || p === "malformed" || !p.userId) return null;
		// Cycle-2 defect 3: legacy validateBearerToken required a bearer or
		// x-api-key; resolvePrincipal also accepts cookie sessions, whose
		// token here would be "" — every proxied tool would then send
		// "Bearer " and fail upstream. Cookie-only callers are a 401, exactly
		// as the legacy MCP gate answered them.
		const token =
			headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ??
			headers.get("x-api-key") ??
			"";
		if (token === "") return null;
		return {
			userId: p.userId,
			// Instance role rides along so MCP guards keep the legacy
			// isInstanceAdmin bypass for admins without org membership.
			userRole: p.userRole ?? null,
			token,
		};
	};
	const mcpApiRoot = (
		process.env.KANEO_API_URL ?? "http://localhost:1337"
	).replace(/\/api\/?$/, "");
	const mcp = mcpHttpHandler({
		tools: mcpTools(mcpGuardsLive(), mcpApiRoot),
		principalResolver: mcpPrincipal,
		// Guards resolve Db/Access per request; sharing the host memoMap keeps
		// one PG pool across the API and MCP runtimes.
		services: Access.layer.pipe(Layer.provideMerge(Base)),
		memoMap: options.memoMap,
		allowedOrigins: (
			process.env.CORS_ORIGINS ??
			process.env.KANEO_CLIENT_URL ??
			""
		)
			.split(",")
			.map((o) => o.trim())
			.filter(Boolean),
		apiBaseUrl: mcpApiRoot,
	});
	const Services = Layer.mergeAll(Access.layer, AuthenticationLive).pipe(
		Layer.provideMerge(Base),
	);
	const Handlers = Layer.mergeAll(BoardsLive, ColumnsLive, LabelsLive).pipe(
		Layer.provideMerge(Services),
	);
	const ApiRoutes = HttpApiBuilder.layer(KaneoApi).pipe(
		// provideMerge, not provide: Handlers carries the DbLive pg pool
		// (Db, PgClient, SqlClient) — merging it into the router layer keeps
		// the pool in the request context (drizzle resolves SqlClient from
		// the fiber per query) instead of leaving it a private dependency.
		Layer.provideMerge(Handlers),
	);
	const api = HttpRouter.toWebHandler(
		ApiRoutes.pipe(
			Layer.provide(HttpServer.layerServices),
			// provideMerge so telemetry services stay in the request context
			// (spans/loggers) — `provide` treats them as private deps of the
			// router build and drops them from the final context.
			Layer.provideMerge(options.telemetry ?? Layer.empty),
		),
		{
			memoMap: options.memoMap,
			disableLogger: true,
			// Defects (incl. SqlError via sqlDie) become an opaque 500 on the
			// wire and a full Cause in the log + span.
			middleware: (app) =>
				app.pipe(
					Effect.catchCause((cause) =>
						Effect.logError(
							"kaneo native handler failed",
							Cause.pretty(cause),
						).pipe(
							Effect.as(
								HttpServerResponse.jsonUnsafe(
									{ message: "Internal Server Error" },
									{ status: 500 },
								),
							),
						),
					),
				),
		},
	);

	// Compose: /api/mcp -> Effect MCP transport; everything else -> HttpApi.
	// Both dispose together when the host releases the wrapper.
	const handler = async (request: Request): Promise<Response> =>
		new URL(request.url).pathname === "/api/mcp"
			? mcp.handler(request)
			: api.handler(request);
	return {
		handler,
		dispose: async () => {
			await Promise.allSettled([
				mcp.dispose(),
				api.dispose ? api.dispose() : Promise.resolve(),
			]);
		},
	};
}
