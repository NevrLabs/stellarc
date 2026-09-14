import { BunRuntime } from "@effect/platform-bun";
import { PgClient } from "@effect/sql-pg";
import { Effect, Redacted } from "effect";
import postgres from "postgres";
import { SqlLive } from "../../../packages/db/src/index";
import { runConsumerLoop } from "../../../packages/domain/src/notification-consumer";
import { TelemetryLive } from "../../../packages/telemetry/src/index";
import { AppConfig, ConfigLive } from "../../stellarc-api/src/config";

const start = Effect.fn("stellarc.worker.start")(function* () {
	const sql = yield* PgClient.PgClient;
	yield* sql`SELECT 1`;
	// The consumer loop owns a dedicated postgres.js connection for LISTEN and
	// job transactions (the Effect pool stays generic for the API surface).
	const config = yield* AppConfig;
	const dedicated = yield* Effect.acquireRelease(
		Effect.sync(() =>
			postgres(Redacted.value(config.databaseUrl), {
				max: 1,
				onnotice: () => {},
			}),
		),
		(conn) => Effect.promise(() => conn.end().then(() => undefined)),
	);
	yield* Effect.forkScoped(
		runConsumerLoop({ sql: dedicated }).pipe(
			Effect.catchAll(() => Effect.void),
		),
	);
	yield* Effect.logInfo("worker ready");
});
const stop = Effect.fn("stellarc.worker.stop")(function* () {
	yield* Effect.logInfo("worker stopped");
});

/** STL-17 owns the durable inbox consumer loop (T0 kept runtime only). */
export const worker = Effect.gen(function* () {
	yield* Effect.acquireRelease(start(), () => stop());
	yield* Effect.never;
}).pipe(Effect.provide(SqlLive), Effect.provide(ConfigLive), Effect.scoped);

if (import.meta.main)
	BunRuntime.runMain(
		worker.pipe(
			Effect.provide(TelemetryLive("stellarc-worker")),
			Effect.catchAll(() =>
				Effect.sync(() => {
					// biome-ignore lint/suspicious/noConsole: fatal startup handler cannot depend on telemetry
					console.error("Worker startup failed");
					process.exitCode = 1;
				}),
			),
		),
	);
