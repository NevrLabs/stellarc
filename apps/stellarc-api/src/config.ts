import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

export interface AppConfigShape {
	readonly databaseUrl: Redacted.Redacted<string>;
	readonly port: number;
}

/** DATABASE_URL must be a PostgreSQL URL with a hostname. */
const isPostgresUrl = Schema.makeFilter(
	(value: string) => {
		try {
			const url = new URL(value);
			return ["postgres:", "postgresql:"].includes(url.protocol) &&
				!!url.hostname
				? undefined
				: "DATABASE_URL must be a PostgreSQL URL";
		} catch {
			return "DATABASE_URL must be a PostgreSQL URL";
		}
	},
	{ message: "DATABASE_URL must be a PostgreSQL URL" },
);

const portMessage = "PORT must be between 1 and 65535";

const isPortString = Schema.makeFilter(
	(value: string) =>
		/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535
			? undefined
			: portMessage,
	{ message: portMessage },
);

/** Env-level codec: raw strings validated before numeric coercion. */
const EnvConfig = Schema.Struct({
	databaseUrl: Schema.String.pipe(Schema.check(isPostgresUrl)),
	port: Schema.String.pipe(Schema.check(isPortString)),
});

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()(
	"stellarc/AppConfig",
) {
	static readonly layer = Layer.effect(
		AppConfig,
		Effect.gen(function* () {
			const env = yield* Config.all({
				databaseUrl: Config.Redacted("DATABASE_URL"),
				port: Config.String("PORT").pipe(Config.withDefault("3000")),
			});
			const raw = yield* Schema.decodeUnknownEffect(EnvConfig)({
				databaseUrl: Redacted.value(env.databaseUrl),
				port: env.port,
			});
			return {
				databaseUrl: Redacted.make(raw.databaseUrl),
				port: Number(raw.port),
			};
		}),
	);
}

/** Name kept for the API app, worker and tests. */
export const ConfigLive = AppConfig.layer;
