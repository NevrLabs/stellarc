import { BunRuntime } from "@effect/platform-bun";
import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, Redacted } from "effect";
import postgres from "postgres";
import { SqlLive } from "../../../packages/db/src/index";
import { Authz, AuthzLive } from "../../../packages/domain/src/authz";
import { ShapeEngine } from "../../../packages/sync/src/index";
import { TelemetryLive } from "../../../packages/telemetry/src/index";
import { AppConfig, ConfigLive } from "./config";
import { foundationHandler } from "./http";
import { workHandler } from "./work-http";

export const api = Effect.gen(function* () {
	const config = yield* AppConfig;
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
	// One telemetry build + memo map shared by both web handlers: OTel metric
	// readers refuse a second MeterProvider binding (see test-server.ts).
	const telemetry = TelemetryLive("stellarc-api");
	const memoMap = yield* Layer.makeMemoMap;
	const http = yield* Effect.acquireRelease(
		Effect.sync(() =>
			foundationHandler(
				sql,
				new ShapeEngine(sql),
				authz.authorize,
				pg`SELECT 1`,
				telemetry,
				memoMap,
			),
		),
		(http) => Effect.promise(() => http.dispose()),
	);
	// STL-16: the work API (§3) mounts ahead of the foundation handler; the
	// foundation handler keeps /health + /orgs/:org/v1/shape and 404s the rest.
	const work = yield* Effect.acquireRelease(
		Effect.sync(() =>
			workHandler(sql, authz.authorize, undefined, telemetry, memoMap),
		),
		(work) => Effect.promise(() => work.dispose()),
	);
	yield* Effect.acquireRelease(
		Effect.sync(() =>
			Bun.serve({
				port: config.port,
				idleTimeout: 30,
				fetch: (request) => {
					const pathname = new URL(request.url).pathname;
					return pathname.startsWith("/api/work/") ||
						pathname.startsWith("/api/public/")
						? work.handler(request)
						: http.handler(request);
				},
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
