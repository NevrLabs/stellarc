import { BunRuntime } from "@effect/platform-bun";
import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, Redacted } from "effect";
import postgres from "postgres";
import { SqlLive } from "../../../packages/db/src/index";
import { Authz, AuthzLive } from "../../../packages/domain/src/authz";
import { ShapeEngine } from "../../../packages/sync/src/index";
import { TelemetryLive } from "../../../packages/telemetry/src/index";
import { AppConfig, ConfigLive } from "./config";
import { type Authorize, foundationHandler } from "./http";
import { workHandler } from "./work-http";

// STL-16 §2: Actor = principal.id. The bearer token rides the wire as
// "Bearer <org> <principal>" — the same grammar work-http's telemetry
// (workPrincipalOf) already implements. Production passes this extractor so
// emitted work events carry the real principal instead of the session()
// "anonymous" default. Kept local: §3 forbids production token grammars from
// growing exported module surface (see foundation.test.ts's principalFrom
// guard on the foundation handler).
function workPrincipalFrom(org: string, authorization?: string): string {
	const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
	return token.startsWith(`${org} `) ? token.slice(org.length + 1) : "";
}

import type { Sql } from "postgres";

/**
 * The single production composition of the work handler. Exported so tests
 * (and only tests) compose the handler identically to the running API — the
 * D3 actor contract ("Actor = principal.id", §2) is pinned against the exact
 * wiring main.ts uses, not a test-side lookalike.
 */
export function composeWorkHandler(
	sql: Sql,
	authorize: Authorize,
	telemetry?: Parameters<typeof workHandler>[3],
	memoMap?: Parameters<typeof workHandler>[4],
) {
	return workHandler(sql, authorize, workPrincipalFrom, telemetry, memoMap);
}

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
			composeWorkHandler(sql, authz.authorize, telemetry, memoMap),
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
