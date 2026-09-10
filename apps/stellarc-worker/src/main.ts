import { BunRuntime } from "@effect/platform-bun";
import { PgClient } from "@effect/sql-pg";
import { Effect } from "effect";
import { SqlLive } from "../../../packages/db/src/index";
import { TelemetryLive } from "../../../packages/telemetry/src/index";
import { ConfigLive } from "../../stellarc-api/src/config";

const start = Effect.fn("stellarc.worker.start")(function* () {
	const sql = yield* PgClient.PgClient;
	yield* sql`SELECT 1`;
	yield* Effect.logInfo("worker ready");
});
const stop = Effect.fn("stellarc.worker.stop")(function* () {
	yield* Effect.logInfo("worker stopped");
});

/** T0 owns runtime resources only. There is deliberately no domain job loop. */
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
