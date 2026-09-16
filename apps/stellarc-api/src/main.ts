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
	const auth = makeAuth(sql, {
		secret: Redacted.value(authConfig.authSecret),
		baseURL: authConfig.publicOrigin,
	});
	const authHandler = makeAuthHandler(auth, authConfig.publicOrigin);
	const identityRoutes = identityHandler(sql, auth);
	const dispatch = (request: Request): Promise<Response> => {
		const path = new URL(request.url).pathname;
		if (path.startsWith("/api/auth/") || path === "/api/auth")
			return authHandler(request);
		if (path.startsWith("/api/identity/")) return identityRoutes(request);
		return http.handler(request);
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
