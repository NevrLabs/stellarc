import { Config, Context, Layer, Redacted } from "effect";

export class AppConfig extends Context.Tag("stellarc/AppConfig")<
	AppConfig,
	{ readonly databaseUrl: Redacted.Redacted<string>; readonly port: number }
>() {}

export const ConfigLive = Layer.effect(
	AppConfig,
	Config.all({
		databaseUrl: Config.redacted("DATABASE_URL").pipe(
			Config.validate({
				message: "DATABASE_URL must be a PostgreSQL URL",
				validation: (value) => {
					try {
						const url = new URL(Redacted.value(value));
						return (
							["postgres:", "postgresql:"].includes(url.protocol) &&
							!!url.hostname
						);
					} catch {
						return false;
					}
				},
			}),
		),
		port: Config.integer("PORT").pipe(
			Config.withDefault(3000),
			Config.validate({
				message: "PORT must be between 1 and 65535",
				validation: (value) => value >= 1 && value <= 65535,
			}),
		),
	}),
);
