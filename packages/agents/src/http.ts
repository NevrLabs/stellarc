import { timingSafeEqual } from "node:crypto";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import type { Sql } from "postgres";
import {
	type AgentsError,
	BadRequest,
	Forbidden,
	isAgentsError,
	NotFound,
	statusOf,
	Unauthenticated,
} from "./errors";
import {
	Attempt,
	Claim,
	CreateAgent,
	CreateNode,
	CreateTask,
	Finish,
	Hello,
	Items,
	Start,
} from "./protocol";
import { AgentStore, type NodeRow } from "./store";

/** Resolves the operator principal for an org, or fails. Identity (STL-15) will
 * replace the default static-token resolver; the seam is this function. */
export type OperatorAuth = (
	org: string,
	authorization: string | undefined,
) => Effect.Effect<string, AgentsError>;

const bearer = (h: string | undefined) =>
	h?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

/** v0 operator auth: one static token from STELLARC_OPERATOR_TOKEN, all orgs. */
export const staticOperatorAuth =
	(token: string | undefined): OperatorAuth =>
	(_org, authorization) => {
		const given = bearer(authorization);
		if (!given)
			return Effect.fail(
				new Unauthenticated({ message: "Authentication required" }),
			);
		if (
			!token ||
			given.length !== token.length ||
			!timingSafeEqual(Buffer.from(given), Buffer.from(token))
		)
			return Effect.fail(new Forbidden({ message: "Access denied" }));
		return Effect.succeed("operator");
	};

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
			"cache-control": "no-store",
		},
	});

const ORG = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export interface AgentsHttp {
	readonly matches: (request: Request) => boolean;
	readonly handler: (request: Request) => Promise<Response>;
	readonly store: AgentStore;
	readonly dispose: () => Promise<void>;
}

export function agentsHttp(
	sql: Sql,
	options: {
		operatorAuth: OperatorAuth;
		telemetry?: Layer.Layer<never>;
		/** Share with every other build of `telemetry` (one MeterProvider). */
		memoMap?: Layer.MemoMap;
		leaseMs?: number;
	},
): AgentsHttp {
	const store = new AgentStore(sql, options.leaseMs);
	const runtime = ManagedRuntime.make(options.telemetry ?? Layer.empty, {
		memoMap: options.memoMap,
	});
	const body = <S extends Schema.Constraint>(
		schema: S,
		request: Request,
	): Effect.Effect<S["Type"], AgentsError, S["DecodingServices"]> =>
		Effect.flatMap(
			Effect.tryPromise({
				try: () => request.json(),
				catch: () => new BadRequest({ message: "Invalid JSON body" }),
			}),
			(raw) =>
				Schema.decodeUnknownEffect(schema)(raw ?? {}).pipe(
					Effect.mapError(
						(e) => new BadRequest({ message: e.message.slice(0, 500) }),
					),
				),
		);
	const nodeAuth = (request: Request) =>
		store.authenticateNode(
			bearer(request.headers.get("authorization") ?? undefined),
		);

	const route = (
		request: Request,
	): Effect.Effect<Response, AgentsError | Error> => {
		const url = new URL(request.url);
		const parts = url.pathname.split("/").filter(Boolean);
		const m = request.method;
		// ── node surface: /v1/node/... ──────────────────────────────────────
		if (parts[0] === "v1" && parts[1] === "node") {
			return Effect.gen(function* () {
				const n: NodeRow = yield* nodeAuth(request);
				const rest = parts.slice(2);
				if (m === "POST" && rest.join("/") === "hello") {
					const h = yield* body(Hello, request);
					return json(200, yield* store.hello(n, h.version, h.harnesses));
				}
				if (m === "POST" && rest.join("/") === "claim") {
					const c = yield* body(Claim, request);
					const task = yield* store.claim(n, c.waitMs);
					return task
						? json(200, { task })
						: new Response(null, { status: 204 });
				}
				if (m === "POST" && rest[0] === "tasks" && rest.length === 3) {
					const [, id, action] = rest;
					if (action === "start") {
						const s = yield* body(Start, request);
						return json(
							200,
							yield* store.start(n, id, s.attempt, s.nativeSessionId),
						);
					}
					if (action === "heartbeat") {
						const a = yield* body(Attempt, request);
						return json(200, yield* store.heartbeat(n, id, a.attempt));
					}
					if (action === "items") {
						const i = yield* body(Items, request);
						return json(
							200,
							yield* store.appendItems(n, id, i.attempt, i.items),
						);
					}
					if (action === "finish") {
						const f = yield* body(Finish, request);
						return json(200, yield* store.finish(n, id, f));
					}
				}
				return yield* Effect.fail(new NotFound({ message: "No such route" }));
			});
		}
		// ── operator surface: /orgs/:org/v1/{nodes,agents,tasks} ────────────
		const [, org, , kind, id, action] = parts;
		return Effect.gen(function* () {
			if (!ORG.test(org ?? ""))
				return yield* Effect.fail(new BadRequest({ message: "Invalid org" }));
			const actor = yield* options.operatorAuth(
				org,
				request.headers.get("authorization") ?? undefined,
			);
			yield* Effect.annotateCurrentSpan({ "stellarc.org": org });
			if (kind === "nodes" && !id) {
				if (m === "POST") {
					const b = yield* body(CreateNode, request);
					return json(201, yield* store.createNode(org, actor, b.name));
				}
				if (m === "GET")
					return json(200, { nodes: yield* store.listNodes(org) });
			}
			if (kind === "agents" && !id) {
				if (m === "POST") {
					const b = yield* body(CreateAgent, request);
					return json(201, yield* store.createAgent(org, actor, b));
				}
				if (m === "GET")
					return json(200, { agents: yield* store.listAgents(org) });
			}
			if (kind === "tasks") {
				if (!id && m === "POST") {
					const b = yield* body(CreateTask, request);
					return json(201, yield* store.createTask(org, actor, b));
				}
				if (!id && m === "GET")
					return json(200, {
						tasks: yield* store.listTasks(
							org,
							url.searchParams.get("agentId") ?? undefined,
						),
					});
				if (id && !action && m === "GET")
					return json(200, yield* store.getTask(org, id));
				if (id && action === "cancel" && m === "POST")
					return json(200, yield* store.cancelTask(org, actor, id));
			}
			return yield* Effect.fail(new NotFound({ message: "No such route" }));
		});
	};

	return {
		store,
		matches: (request) => {
			const p = new URL(request.url).pathname;
			return (
				p.startsWith("/v1/node/") ||
				/^\/orgs\/[^/]+\/v1\/(nodes|agents|tasks)(\/|$)/.test(p)
			);
		},
		handler: (request) =>
			runtime.runPromise(
				route(request).pipe(
					Effect.catch((error: AgentsError | Error) =>
						Effect.succeed(
							isAgentsError(error)
								? json(statusOf(error), {
										_tag: error._tag,
										message: error.message,
									})
								: json(500, {
										_tag: "InternalError",
										message: "Internal server error",
									}),
						),
					),
					Effect.withSpan("stellarc.agents.request", {
						attributes: {
							"http.request.method": request.method,
						},
					}),
				),
			),
		dispose: () => runtime.dispose(),
	};
}
