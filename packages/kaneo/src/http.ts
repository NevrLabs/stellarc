/**
 * Kaneo-compatible HTTP surface, Effect-native.
 *
 * Strangler composition: endpoints declared in `KaneoApi` are served by
 * Effect HttpApi handlers; every other `/api/*` path falls through to the
 * lifted legacy tree. Each migrated group removes a slice of legacy without
 * the UI noticing — same paths, same JSON.
 */
import {
	HttpApiBuilder,
	HttpServer,
	HttpServerResponse,
} from "@effect/platform";
import { Cause, Effect, Layer } from "effect";
import { BoardsLive, ColumnsLive, KaneoApi } from "./boards";
import {
	Access,
	AuthenticationLive,
	DbLive,
	type Principal,
	PrincipalResolver,
} from "./kernel";

const ROUTES: Array<[method: string, re: RegExp]> = [];
for (const group of Object.values(KaneoApi.groups))
	for (const endpoint of Object.values(group.endpoints))
		ROUTES.push([
			endpoint.method,
			new RegExp(`^${endpoint.path.replace(/:[A-Za-z]+/g, "[^/]+")}/?$`),
		]);

/** True when the Effect-native API owns this method+path. */
export const isNative = (request: Request) => {
	const path = new URL(request.url).pathname;
	return ROUTES.some(([m, re]) => m === request.method && re.test(path));
};

export function kaneoNativeHandler(options: {
	databaseUrl: string;
	resolvePrincipal: (
		headers: Headers,
	) => Promise<Principal | null | "malformed">;
	telemetry?: Layer.Layer<never>;
	memoMap?: Layer.MemoMap;
}) {
	const ApiLive = HttpApiBuilder.api(KaneoApi).pipe(
		Layer.provide([BoardsLive, ColumnsLive]),
		Layer.provide(AuthenticationLive),
		Layer.provide(Access.Default),
		Layer.provide(DbLive(options.databaseUrl)),
		Layer.provide(Layer.succeed(PrincipalResolver, options.resolvePrincipal)),
	);
	return HttpApiBuilder.toWebHandler(
		Layer.mergeAll(
			ApiLive,
			HttpServer.layerContext,
			options.telemetry ?? Layer.empty,
		),
		{
			memoMap: options.memoMap,
			// Defects (incl. SqlError via sqlDie) become an opaque 500 on the
			// wire and a full Cause in the log + span.
			middleware: (app) =>
				app.pipe(
					Effect.catchAllCause((cause) =>
						Effect.logError(
							"kaneo native handler failed",
							Cause.pretty(cause),
						).pipe(
							Effect.as(
								HttpServerResponse.unsafeJson(
									{ message: "Internal Server Error" },
									{ status: 500 },
								),
							),
						),
					),
				),
		},
	);
}
