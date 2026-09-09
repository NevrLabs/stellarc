import {
	HttpApiBuilder,
	HttpServer,
	HttpServerRequest,
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
	healthQuery?: Effect.Effect<unknown, unknown>,
	telemetry: Layer.Layer<never> = Layer.empty,
) {
	const group = HttpApiBuilder.group(FoundationApi, "foundation", (handlers) =>
		handlers
			.handleRaw("health", () =>
				(healthQuery ?? Effect.tryPromise(() => sql`SELECT 1`)).pipe(
					Effect.as(HttpServerResponse.unsafeJson({ status: "ok" })),
					Effect.catchAll((error) => Effect.succeed(errorResponse(error))),
				),
			)
			.handleRaw("shape", ({ path, request }) =>
				Effect.gen(function* () {
					const decision = authorize(path.org, request.headers);
					if (decision !== "ok")
						return HttpServerResponse.empty({
							status: decision === "unauthenticated" ? 401 : 403,
						});
					const response = yield* engine.shapeEffect(
						path.org,
						new URL(request.url, "http://localhost"),
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
					const body = yield* Effect.tryPromise(() => response.text());
					return HttpServerResponse.text(body, {
						status: response.status,
						headers: Object.fromEntries(response.headers),
					});
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(errorResponse(error))),
				),
			),
	);
	return HttpApiBuilder.toWebHandler(
		Layer.mergeAll(
			HttpApiBuilder.api(FoundationApi).pipe(Layer.provide(group)),
			HttpServer.layerContext,
			telemetry,
		),
		{
			middleware: (app) =>
				Effect.fn("stellarc.http.request")(function* () {
					const request = yield* HttpServerRequest.HttpServerRequest;
					const pathname = new URL(request.url, "http://localhost").pathname;
					const shape = /^\/orgs\/[^/]+\/v1\/shape$/.test(pathname);
					yield* Effect.annotateCurrentSpan({
						"http.route": shape
							? "/orgs/:org/v1/shape"
							: pathname === "/health"
								? "/health"
								: "unmatched",
						"http.request.method": request.method,
					});
					const response = yield* app;
					yield* Effect.annotateCurrentSpan(
						"http.response.status_code",
						response.status,
					);
					const errorTypes: Record<number, string> = {
						400: "BadRequest",
						401: "Unauthenticated",
						403: "Forbidden",
						404: "NotFound",
						409: "Conflict",
						500: "InternalError",
						503: "Unavailable",
					};
					if (response.status >= 400)
						yield* Effect.annotateCurrentSpan(
							"error.type",
							errorTypes[response.status] ?? "InternalError",
						);
					return response;
				})(),
		},
	);
}
