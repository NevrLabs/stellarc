import { Context, Layer } from "effect";

export type AuthzResult = "ok" | "unauthenticated" | "forbidden";
export class Authz extends Context.Tag("stellarc/Authz")<
	Authz,
	{
		readonly authorize: (
			org: string,
			headers: Readonly<Record<string, string>>,
		) => AuthzResult;
	}
>() {}

/** No token or environment switch can enable the test principal in production. */
export const AuthzLive = Layer.succeed(Authz, {
	authorize: (_org, headers) =>
		headers.authorization ? "forbidden" : "unauthenticated",
});
