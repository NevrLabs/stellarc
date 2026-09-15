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

// STL-15: auth surface config is API-only (the worker shares AppConfig but
// never authenticates), so AUTH_SECRET lives in its own tag.
export class AuthConfig extends Context.Tag("stellarc/AuthConfig")<
	AuthConfig,
	{
		readonly authSecret: Redacted.Redacted<string>;
		readonly publicOrigin: string;
	}
>() {}

export const AuthConfigLive = Layer.effect(
	AuthConfig,
	Config.all({
		authSecret: Config.redacted("AUTH_SECRET").pipe(
			Config.validate({
				message: "AUTH_SECRET must be at least 32 chars",
				validation: (value) => Redacted.value(value).length >= 32,
			}),
		),
		publicOrigin: Config.string("PUBLIC_ORIGIN").pipe(
			Config.withDefault("http://127.0.0.1:3000"),
		),
	}),
);
