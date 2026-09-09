import {
	HttpApiBuilder,
	HttpServer,
	HttpServerResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import type { Sql } from "postgres";
import { FoundationApi } from "../../../packages/contracts/src/api";
import type { ShapeEngine } from "../../../packages/sync/src/index";

export function foundationHandler(
	sql: Sql,
	engine: ShapeEngine,
	authorize: (
		org: string,
		headers: Readonly<Record<string, string>>,
	) => boolean,
) {
	const group = HttpApiBuilder.group(FoundationApi, "foundation", (handlers) =>
		handlers
			.handle("health", () =>
				Effect.promise(async () => {
					await sql`SELECT 1`;
					return { status: "ok" as const };
				}),
			)
			.handleRaw("shape", ({ path, request }) =>
				Effect.promise(async () => {
					if (!authorize(path.org, request.headers))
						return HttpServerResponse.empty({ status: 403 });
					const response = await engine.shape(
						path.org,
						new URL(request.url, "http://localhost"),
					);
					return HttpServerResponse.text(await response.text(), {
						status: response.status,
						headers: Object.fromEntries(response.headers),
					});
				}),
			),
	);
	return HttpApiBuilder.toWebHandler(
		Layer.mergeAll(
			HttpApiBuilder.api(FoundationApi).pipe(Layer.provide(group)),
			HttpServer.layerContext,
		),
	);
}
