import {
	HttpApiBuilder,
	type HttpApp,
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

export type Authorize = (
	org: string,
	headers: Readonly<Record<string, string>>,
	principal?: string,
) => AuthzResult;

// Shared by the foundation and fixture handlers so every request — including
// the test-only mutation routes — carries a server span in one trace.
// Receives the inner application as an Effect yielding the response, per
// HttpApiBuilder.toWebHandler's middleware contract.
export const requestTelemetry = (
	httpApp: HttpApp.Default<never, never>,
): HttpApp.Default<never, never> =>
	Effect.fn("stellarc.http.request")(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const pathname = new URL(request.url, "http://localhost").pathname;
		const orgMatch = /^\/orgs\/([^/]+)\//.exec(pathname);
		const shape = /^\/orgs\/[^/]+\/v1\/shape$/.test(pathname);
		yield* Effect.annotateCurrentSpan({
			"http.route": shape
				? "/orgs/:org/v1/shape"
				: pathname === "/health"
					? "/health"
					: "unmatched",
			"http.request.method": request.method,
			...(orgMatch ? { "stellarc.org": decodeURIComponent(orgMatch[1]) } : {}),
		});
		const response = yield* httpApp;
		yield* Effect.annotateCurrentSpan(
			"http.response.status_code",
			response.status,
		);
		// Success responses carry the authenticated principal in a dedicated
		// header; denied requests never receive it, so denied spans record
		// error.type without any principal attribute (fail-closed telemetry).
		const principal = (response.headers as Record<string, string>)[
			"x-stellarc-principal"
		];
		if (response.status < 400 && principal)
			yield* Effect.annotateCurrentSpan({
				"stellarc.principal.kind": "actor",
				"stellarc.principal.id": principal,
			});
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
	})();

export function foundationHandler(
	sql: Sql,
	engine: ShapeEngine,
	authorize: Authorize,
	healthQuery?: Effect.Effect<unknown, unknown>,
	telemetry: Layer.Layer<never> = Layer.empty,
	// Share one memo map across every build of `telemetry` (handler + fixture
	// server runtime): OTel metric readers reject a second MeterProvider bind.
	memoMap?: Layer.MemoMap,
	// Test-principal extraction ("Bearer <org> <id>") is injected by the
	// test-composed server; production passes nothing and parses no tokens (§3).
	principalFrom: (
		org: string,
		authorization: string | undefined,
	) => string = () => "",
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
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok")
						return errorResponse({
							_tag:
								decision === "unauthenticated"
									? "Unauthenticated"
									: "Forbidden",
						});
					const response = yield* engine.shapeEffect(
						path.org,
						new URL(request.url, "http://localhost"),
					);
					const resumed = authorize(path.org, request.headers, principal);
					if (resumed !== "ok")
						return errorResponse({
							_tag:
								resumed === "unauthenticated" ? "Unauthenticated" : "Forbidden",
						});
					if (response.status === 204)
						return HttpServerResponse.empty({
							status: 204,
							headers: principalHeaders(
								Object.fromEntries(response.headers),
								principal,
							),
						});
					const body = yield* Effect.tryPromise(() => response.text());
					// Pass the engine payload through unmodified: the engine already
					// declared application/json (§3) and must not be re-encoded into a
					// text response whose content type depends on header precedence.
					return HttpServerResponse.raw(body, {
						status: response.status,
						headers: principalHeaders(
							Object.fromEntries(response.headers),
							principal,
						),
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
			middleware: requestTelemetry,
			memoMap,
		},
	);
}

// The bearer token doubles as the test principal ("Bearer <org> <id>"); real
// identity arrives with STL-15. The grammar lives in the test-composed server
// only — production parses no tokens (§3).

const principalHeaders = (
	headers: Record<string, string>,
	principal: string,
): Record<string, string> =>
	principal ? { ...headers, "x-stellarc-principal": principal } : headers;
