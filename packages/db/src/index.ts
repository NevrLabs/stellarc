import { PgClient } from "@effect/sql-pg";
import { Effect, Layer } from "effect";
import { AppConfig } from "../../../apps/stellarc-api/src/config";

/** The Effect PostgreSQL pool is acquired and released by the runtime scope. */
export const SqlLive = Layer.unwrapEffect(
	Effect.gen(function* () {
		const config = yield* AppConfig;
		return PgClient.layer({
			url: config.databaseUrl,
			maxConnections: 8,
			connectTimeout: 5000,
			applicationName: "stellarc",
		});
	}),
);
