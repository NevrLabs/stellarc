import { BunRuntime } from "@effect/platform-bun";
import { PgClient } from "@effect/sql-pg";
import { Effect, Redacted } from "effect";
import postgres from "postgres";
import { SqlLive } from "../../../packages/db/src/index";
import { Authz, AuthzLive } from "../../../packages/domain/src/authz";
import { makeAuth } from "../../../packages/domain/src/better-auth";
import { ShapeEngine } from "../../../packages/sync/src/index";
import { TelemetryLive } from "../../../packages/telemetry/src/index";
import { makeAuthHandler } from "./auth-http";
import { AppConfig, AuthConfig, AuthConfigLive, ConfigLive } from "./config";
import { foundationHandler } from "./http";
import { identityHandler } from "./identity-http";
import { identityTracer } from "./identity-trace";

export const api = Effect.gen(function* () {
	const config = yield* AppConfig;
	const authConfig = yield* AuthConfig;
	const authz = yield* Authz;
	const pg = yield* PgClient.PgClient;
	yield* pg`SELECT 1`;
	// Existing spike transactions retain their postgres.js adapter until the Effect conversion.
	const sql = yield* Effect.acquireRelease(
		Effect.sync(() =>
			postgres(Redacted.value(config.databaseUrl), {
				max: 8,
				onnotice: () => {},
			}),
		),
		(sql) => Effect.promise(() => sql.end()),
	);
	const http = yield* Effect.acquireRelease(
		Effect.sync(() =>
			foundationHandler(
				sql,
				new ShapeEngine(sql),
				authz.authorize,
				pg`SELECT 1`,
				TelemetryLive("stellarc-api"),
			),
		),
		(http) => Effect.promise(() => http.dispose()),
	);
	// STL-15: Better Auth at /api/auth/* and identity routes at
	// /api/identity/* ride the same Bun server; the foundation web handler
	// 404s anything outside its own routes (fail-closed pass-through order).
	// STL-15 rework c12: one OTel tracer shared by every identity/auth surface
	// (review c9 defect 3, ADR 0010). In production the global OTel API provider
	// is registered by the telemetry runtime at boot.
	const tracer = identityTracer();
	const auth = makeAuth(sql, {
		secret: Redacted.value(authConfig.authSecret),
		baseURL: authConfig.publicOrigin,
		tracer,
	});
	const authHandler = makeAuthHandler(auth, authConfig.publicOrigin, tracer);
	const identityRoutes = identityHandler(sql, auth, tracer);
	// Rework c13 (e2e/D10): when an origin is configured, every response
	// carries CORS so the built UI can talk to this API cross-origin.
	const corsOrigin = process.env.IDENTITY_CORS_ORIGIN ?? "";
	const withCors = (response: Response): Response => {
		if (!corsOrigin) return response;
		const headers = new Headers(response.headers);
		headers.set("access-control-allow-origin", corsOrigin);
		headers.set("access-control-allow-credentials", "true");
		headers.set("access-control-allow-headers", "content-type");
		headers.set(
			"access-control-allow-methods",
			"GET,POST,PATCH,DELETE,OPTIONS",
		);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	};
	const dispatch = async (request: Request): Promise<Response> => {
		if (corsOrigin && request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"access-control-allow-origin": corsOrigin,
					"access-control-allow-credentials": "true",
					"access-control-allow-headers": "content-type",
					"access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
				},
			});
		}
		const path = new URL(request.url).pathname;
		if (path.startsWith("/api/auth/") || path === "/api/auth")
			return authHandler(request);
		if (path.startsWith("/api/identity/")) return identityRoutes(request);
		return withCors(await http.handler(request));
	};
	yield* Effect.acquireRelease(
		Effect.sync(() =>
			Bun.serve({
				port: config.port,
				idleTimeout: 30,
				fetch: (request) => dispatch(request),
			}),
		),
		(server) => Effect.sync(() => server.stop(true)),
	);
	yield* Effect.logInfo("api ready");
	yield* Effect.never;
}).pipe(
	Effect.provide(SqlLive),
	Effect.provide(AuthzLive),
	Effect.provide(ConfigLive),
	Effect.provide(AuthConfigLive),
	Effect.scoped,
);

if (import.meta.main)
	BunRuntime.runMain(
		api.pipe(
			Effect.catchAll(() =>
				Effect.sync(() => {
					// biome-ignore lint/suspicious/noConsole: fatal startup handler cannot depend on telemetry
					console.error("API startup failed");
					process.exitCode = 1;
				}),
			),
		),
	);
