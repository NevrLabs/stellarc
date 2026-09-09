import {
	HttpApiBuilder,
	HttpServer,
	HttpServerResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import type { Sql } from "postgres";
import { FoundationApi } from "../../../packages/contracts/src/api";
import type { ShapeEngine } from "../../../packages/sync/src/index";
import { errorResponse } from "./errors";

export type AuthzResult = "ok" | "unauthenticated" | "forbidden";

export function foundationHandler(
	sql: Sql,
	engine: ShapeEngine,
	authorize: (
		org: string,
		headers: Readonly<Record<string, string>>,
	) => AuthzResult,
) {
	const group = HttpApiBuilder.group(FoundationApi, "foundation", (handlers) =>
		handlers
			.handleRaw("health", () =>
				Effect.tryPromise({
					try: async () => {
						await sql`SELECT 1`;
						return HttpServerResponse.unsafeJson({ status: "ok" });
					},
					catch: errorResponse,
				}).pipe(Effect.catchAll(Effect.succeed)),
			)
			.handleRaw("shape", ({ path, request }) =>
				Effect.tryPromise({
					try: async (signal) => {
						const decision = authorize(path.org, request.headers);
						if (decision === "unauthenticated")
							return HttpServerResponse.empty({ status: 401 });
						if (decision === "forbidden")
							return HttpServerResponse.empty({ status: 403 });
						const response = await engine.shape(
							path.org,
							new URL(request.url, "http://localhost"),
							signal,
						);
						const resumed = authorize(path.org, request.headers);
						if (resumed !== "ok")
							return HttpServerResponse.empty({
								status: resumed === "unauthenticated" ? 401 : 403,
							});
						if (response.status === 204)
							return HttpServerResponse.empty({
								status: 204,
								headers: Object.fromEntries(response.headers),
							});
						return HttpServerResponse.text(await response.text(), {
							status: response.status,
							headers: Object.fromEntries(response.headers),
						});
					},
					catch: errorResponse,
				}).pipe(Effect.catchAll(Effect.succeed)),
			),
	);
	return HttpApiBuilder.toWebHandler(
		Layer.mergeAll(
			HttpApiBuilder.api(FoundationApi).pipe(Layer.provide(group)),
			HttpServer.layerContext,
		),
	);
}
