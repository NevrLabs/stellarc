import { BunRuntime } from "@effect/platform-bun";
import { PgClient } from "@effect/sql-pg";
import { Effect } from "effect";
import { SqlLive } from "../../../packages/db/src/index";
import { ConfigLive } from "../../stellarc-api/src/config";

/** T0 owns runtime resources only. There is deliberately no domain job loop. */
export const worker = Effect.gen(function* () {
	const sql = yield* PgClient.PgClient;
	yield* sql`SELECT 1`;
	yield* Effect.logInfo("worker ready");
	yield* Effect.never;
}).pipe(Effect.provide(SqlLive), Effect.provide(ConfigLive), Effect.scoped);

if (import.meta.main)
	BunRuntime.runMain(
		worker.pipe(
			Effect.catchAll(() =>
				Effect.sync(() => {
					console.error("Worker startup failed");
					process.exitCode = 1;
				}),
			),
		),
	);
