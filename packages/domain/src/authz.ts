import { Context, Layer } from "effect";

export type AuthzResult = "ok" | "unauthenticated" | "forbidden";
export class Authz extends Context.Service<
	Authz,
	{
		readonly authorize: (
			org: string,
			headers: Readonly<Record<string, string>>,
		) => AuthzResult;
	}
>()("stellarc/Authz") {}

/** No token or environment switch can enable the test principal in production. */
export const AuthzLive = Layer.succeed(Authz, {
	authorize: (_org, headers) =>
		headers.authorization ? "forbidden" : "unauthenticated",
});
