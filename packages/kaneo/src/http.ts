/**
 * Kaneo-compatible HTTP surface, Effect v4 native.
 *
 * Strangler composition: endpoints declared in `KaneoApi` are served by
 * Effect HttpApi handlers; every other `/api/*` path falls through to the
 * lifted legacy tree. Each migrated group removes a slice of legacy without
 * the UI noticing — same paths, same JSON.
 */
import { Cause, Effect, Layer } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { KaneoApi } from "./api";
import { BoardsLive, ColumnsLive } from "./boards";
import {
	Access,
	AuthenticationLive,
	DbLive,
	DomainEvents,
	type DomainPorts,
	type Principal,
	PrincipalResolver,
} from "./kernel";
import { LabelsLive } from "./labels";

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
	ports: DomainPorts;
	telemetry?: Layer.Layer<never>;
	memoMap?: Layer.MemoMap;
}) {
	const Base = Layer.mergeAll(
		DbLive(options.databaseUrl),
		Layer.succeed(PrincipalResolver, options.resolvePrincipal),
		Layer.succeed(DomainEvents, options.ports),
	);
	const Services = Layer.mergeAll(Access.layer, AuthenticationLive).pipe(
		Layer.provideMerge(Base),
	);
	const Handlers = Layer.mergeAll(BoardsLive, ColumnsLive, LabelsLive).pipe(
		Layer.provideMerge(Services),
	);
	const ApiRoutes = HttpApiBuilder.layer(KaneoApi).pipe(
		Layer.provide(Handlers),
	);
	return HttpRouter.toWebHandler(
		ApiRoutes.pipe(
			Layer.provide(HttpServer.layerServices),
			Layer.provide(options.telemetry ?? Layer.empty),
		),
		{
			memoMap: options.memoMap,
			disableLogger: true,
			// Defects (incl. SqlError via sqlDie) become an opaque 500 on the
			// wire and a full Cause in the log + span.
			middleware: (app) =>
				app.pipe(
					Effect.catchCause((cause) =>
						Effect.logError(
							"kaneo native handler failed",
							Cause.pretty(cause),
						).pipe(
							Effect.as(
								HttpServerResponse.jsonUnsafe(
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
