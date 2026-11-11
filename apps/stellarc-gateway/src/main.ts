import { Effect, Layer, ManagedRuntime, Metric, Tracer } from "effect";

import { Pool } from "pg";
import postgres from "postgres";
import { TelemetryLive } from "../../../packages/telemetry/src/index";
import { auditExporter } from "../../../packages/core-auth/src/audit";
import { gatewayAuth } from "../../../packages/core-auth/src/auth";
import { assertRuntimeDatabase, bindIdentity } from "../../../packages/core-auth/src/database";
import { mcpGateway } from "../../toolgw/src/mcp";
import {
	prepareProviderRequest,
	providerResponse,
	validateRoutes,
} from "../../llmgw/src/provider-routing";
import { Denied, gatewayStore } from "../../../packages/core-auth/src/store";

export async function gatewayApp(
	env: Record<string, string | undefined> = process.env,
) {
	const required = (key: string) => {
		const v = env[key];
		if (!v) throw new Error(`Missing ${key}`);
		return v;
	};
	const origin = required("GATEWAY_ORIGIN");
	const issuer = required("GATEWAY_OIDC_ISSUER");
	const pool = new Pool({
		connectionString: required("GATEWAY_DATABASE_URL"),
		max: 4,
		connectionTimeoutMillis: 3000,
		idleTimeoutMillis: 10000,
	});
	const sql = postgres(required("GATEWAY_DATABASE_URL"), {
		max: 4,
		connect_timeout: 3,
		idle_timeout: 10,
		onnotice: () => {},
		connection: { statement_timeout: 3000, lock_timeout: 2000 },
	});
	try {
		await assertRuntimeDatabase(sql);
		await bindIdentity(sql, issuer, required("GATEWAY_OIDC_CLIENT"));
	} catch (error) {
		await sql.end();
		await pool.end();
		throw error;
	}
	const store = gatewayStore(sql);
	const telemetry = TelemetryLive("stellarc-gateway");
	const memoMap = Effect.runSync(Layer.makeMemoMap);
	const runtime = ManagedRuntime.make(telemetry, { memoMap });
	const audit = auditExporter(sql, required("OTEL_EXPORTER_OTLP_ENDPOINT"));
	const auth = gatewayAuth({
		origin,
		issuer,
		clientId: required("GATEWAY_OIDC_CLIENT"),
		clientSecret: required("GATEWAY_OIDC_SECRET"),
		secret: required("GATEWAY_AUTH_SECRET"),
		database: pool,
		authorizationEndpoint: required("GATEWAY_OIDC_AUTHORIZE"),
		tokenEndpoint: required("GATEWAY_OIDC_TOKEN"),
		jwksUri: required("GATEWAY_OIDC_JWKS"),
		approved: store.human,
		audit: store.securityEvent,
	});
	let active = 0;
	let stopping = false;
	const controllers = new Set<AbortController>();
	const finalizers = new Set<Promise<void>>();
	const requests = new Set<Promise<Response>>();
	const authorities = new Set<Promise<void>>();
	const mcp = mcpGateway(origin, telemetry, memoMap);
	const exportLoop = runtime.runFork(
		Effect.forever(
			Effect.tryPromise(() => audit.exportOnce()).pipe(
				Effect.catch(() => Effect.logWarning("audit export pending")),
				Effect.andThen(
					Effect.tryPromise(() => store.recover()).pipe(
						Effect.catch(() => Effect.logWarning("terminal recovery pending")),
					),
				),
				Effect.andThen(Effect.sleep("5 seconds")),
			),
		),
	);
	function trace(headers: Headers) {
		const value = headers.get("traceparent");
		if (!value) return undefined;
		if (!/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(value))
			throw new Denied(400, "invalid_trace_context");
		const [, traceId, spanId, flags] = value.split("-");
		if (/^0+$/.test(traceId) || /^0+$/.test(spanId))
			throw new Denied(400, "invalid_trace_context");
		return Tracer.externalSpan({ traceId, spanId, sampled: flags === "01" });
	}
	async function body(request: Request, signal: AbortSignal) {
		if (signal.aborted) throw new Denied(408, "request_deadline");

		if (Number(request.headers.get("content-length") ?? 0) > 65536)
			throw new Denied(413, "body_limit");
		const reader = request.body?.getReader();
		if (!reader) return {};
		const chunks: Uint8Array[] = [];
		let size = 0;
		let rejectAbort!: (error: Error) => void;
		const interrupted = new Promise<never>((_, reject) => {
			rejectAbort = reject;
		});
		const cancel = () => {
			rejectAbort(new Denied(408, "request_deadline"));
			void reader.cancel().catch(() => {});
		};
		signal.addEventListener("abort", cancel, { once: true });
		try {
			if (signal.aborted) cancel();
			for (;;) {
				const r = await Promise.race([reader.read(), interrupted]);
				if (signal.aborted) throw new Denied(408, "request_deadline");
				if (r.done) break;
				size += r.value.byteLength;
				if (size > 65536) throw new Denied(413, "body_limit");
				chunks.push(r.value);
			}
		} catch (error) {
			void reader.cancel().catch(() => {});
			throw error;
		} finally {
			signal.removeEventListener("abort", cancel);
			reader.releaseLock();
		}
		const text = Buffer.concat(chunks).toString();
		try {
			return text ? JSON.parse(text) : {};
		} catch {
			throw new Denied(400, "invalid_json");
		}
	}
	async function browser(request: Request) {
		if (request.headers.get("origin") !== origin)
			throw new Denied(403, "origin_denied");
		const session = await auth.session(request.headers);
		if (!session) throw new Denied(401, "sign_in_required");
		return store.fromHuman(session.user.id);
	}
	const parseBearer = (request: Request) =>
		/^Bearer ([A-Za-z0-9_-]{43})$/.exec(
			request.headers.get("authorization") ?? "",
		)?.[1] ?? "";
	function handler(request: Request): Promise<Response> {
		if (stopping)
			return Promise.resolve(new Response("stopping", { status: 503 }));
		const promise = Promise.resolve().then(() => handle(request));
		requests.add(promise);
		void promise.then(
			() => requests.delete(promise),
			() => requests.delete(promise),
		);
		return promise;
	}
	async function handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const headers = {
			"cache-control": "no-store",
			"referrer-policy": "no-referrer",
			"x-content-type-options": "nosniff",
			"content-security-policy":
				"default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
		};
		if (url.origin !== origin)
			return new Response("wrong origin", { status: 400, headers });
		if (request.method === "GET" && url.pathname === "/health")
			return Response.json(
				{
					service: "stellarc-gateway",
					status: "ready",
					provider: env.GATEWAY_PROVIDER_URL
						? "configured-not-canary-verified"
						: "LOCAL FIXTURE ONLY",
				},
				{ headers },
			);
		if (url.pathname === "/" && request.method === "GET")
			return new Response(
				await Bun.file(new URL("./console.html", import.meta.url)).text(),
				{ headers: { ...headers, "content-type": "text/html; charset=utf-8" } },
			);
		if (url.pathname === "/console.js" && request.method === "GET")
			return new Response(
				await Bun.file(new URL("./console.js", import.meta.url)).text(),
				{ headers: { ...headers, "content-type": "text/javascript" } },
			);
		if (url.pathname === "/console.css" && request.method === "GET")
			return new Response(
				await Bun.file(new URL("./console.css", import.meta.url)).text(),
				{ headers: { ...headers, "content-type": "text/css" } },
			);
		if (stopping || active >= 8)
			return new Response("capacity", { status: 429, headers });
		active++;
		let transferred = false;
		const abort = new AbortController();
		controllers.add(abort);
		const disconnect = () => abort.abort();
		request.signal.addEventListener("abort", disconnect, { once: true });
		if (request.signal.aborted) abort.abort();
		const timer = setTimeout(disconnect, 30000);
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			active--;
			clearTimeout(timer);
			controllers.delete(abort);
			request.signal.removeEventListener("abort", disconnect);
		};
		try {
			const parent = trace(request.headers);
			const requestId = crypto.randomUUID();
			let runId: string | undefined;
			let terminal: Promise<void> | undefined;
			const finish = (outcome: "completed" | "cancelled" | "failed") => {
				if (!runId) return Promise.resolve();
				if (!terminal) {
					const id = runId;
					terminal = Promise.resolve().then(async () => {
						for (let attempt = 0; ; attempt++) {
							try {
								await store.finish(id, outcome);
								return;
							} catch (error) {
								if (attempt === 2) throw error;
								await new Promise((resolve) => setTimeout(resolve, 100));
							}
						}
					});
					finalizers.add(terminal);
					void terminal.then(
						() => finalizers.delete(terminal!),
						() => finalizers.delete(terminal!),
					);
				}
				return terminal;
			};
			return await runtime.runPromise(
				Effect.gen(function* () {
					const span = yield* Effect.currentSpan;
					yield* Effect.annotateCurrentSpan({
						"request.id": requestId,
						"http.request.method": request.method,
						"http.route": url.pathname.startsWith("/manage/")
							? "/manage/:action"
							: url.pathname === "/mcp"
								? "/mcp"
								: "/orgs/:org/v1/chat/completions",
					});
					return yield* Effect.tryPromise({
						try: async () => {
							if (
								url.pathname.startsWith("/api/auth/") ||
								url.pathname === "/auth/login"
							) {
								const data = request.body
									? await body(request, abort.signal)
									: undefined;
								if (abort.signal.aborted)
									throw new Denied(408, "request_deadline");
								const authHeaders = new Headers(request.headers);
								authHeaders.delete("content-length");
								let rejectDeadline!: (error: Error) => void;
								const deadline = new Promise<never>((_, reject) => {
									rejectDeadline = reject;
								});
								const interrupted = () =>
									rejectDeadline(new Denied(408, "request_deadline"));
								abort.signal.addEventListener("abort", interrupted, {
									once: true,
								});
								try {
									if (abort.signal.aborted)
										throw new Denied(408, "request_deadline");
									const response = await Promise.race([
										auth.handler(
											new Request(request.url, {
												method: request.method,
												headers: authHeaders,
												signal: abort.signal,
												...(data === undefined
													? {}
													: { body: JSON.stringify(data) }),
											}),
										),
										deadline,
									]);
									const secured = new Response(response.body, response);
									for (const [key, value] of Object.entries(headers))
										secured.headers.set(key, value);
									return secured;
								} finally {
									abort.signal.removeEventListener("abort", interrupted);
								}
							}
							if (
								url.pathname === "/manage/status" &&
								request.method === "GET"
							) {
								const session = await auth.session(request.headers);
								if (!session) throw new Denied(401, "sign_in_required");
								const p = await store.fromHuman(session.user.id);
								const principals =
									await sql`SELECT id,kind,permissions,enabled FROM gw_principal WHERE org=${p.org} ORDER BY kind,id`;
								const credentials =
									await sql`SELECT c.id,c.principal,c.expires_at,c.revoked FROM gw_credential c JOIN gw_principal p ON p.id=c.principal WHERE p.org=${p.org}`;
								const delegations =
									await sql`SELECT id,parent,actor,subject,actions,expires_at,remaining,revoked FROM gw_delegation WHERE org=${p.org}`;
								const state =
									await sql`SELECT seq::text,delivered::text,gap FROM gw_audit_state WHERE org=${p.org}`;
								return Response.json(
									{
										principal: p,
										principals,
										credentials,
										delegations,
										audit: state[0] ?? null,
										provider: env.GATEWAY_PROVIDER_URL
											? "Configured — live canary not verified"
											: "Local fixture — no inference",
										mcp: "Metadata tool only",
										origin,
									},
									{ headers },
								);
							}
							if (
								url.pathname.startsWith("/manage/") &&
								request.method === "POST"
							) {
								const p = await browser(request);
								const data = await body(request, abort.signal);
								let result: unknown;
								if (url.pathname === "/manage/agents")
									result = { id: await store.createAgent(p.id, data.actions) };
								else if (url.pathname === "/manage/credentials")
									result = await store.issue(p.id, data.principal, data.ttl);
								else if (url.pathname === "/manage/revoke") {
									await store.revoke(p.id, data.id, data.delegation === true);
									result = { revoked: true };
								} else if (url.pathname === "/manage/delegations")
									result = { id: await store.delegate(p.id, data.actor, data) };
								else throw new Denied(404, "not_found");
								return Response.json(result, { headers });
							}
							const raw = parseBearer(request);
							const delegation =
								request.headers.get("x-stellarc-delegation") ?? undefined;
							const match =
								/^\/orgs\/([a-z0-9-]{1,64})\/v1\/chat\/completions$/.exec(
									url.pathname,
								);
							let org = match?.[1];
							if (url.pathname === "/mcp") {
								// Org is resolved from authenticated credential, never caller org headers.
								const decision = await store.authorize(
									raw,
									undefined,
									"mcp:status",
									requestId,
									span.traceId,
									delegation,
									false,
								);
								org = decision.principal.org;
								const payload = await body(request, abort.signal);
								if (request.method !== "POST")
									throw new Denied(405, "post_required");
								const forwarded = new Request(`${origin}/mcp`, {
									method: "POST",
									headers: request.headers,
									body: JSON.stringify(payload),
									signal: abort.signal,
								});
								const response = await mcp.handler(forwarded, {
									requestId,
									actor: decision.principal.id,
									subject: decision.subject,
									org,
									signal: abort.signal,
									finish: async (_id, outcome) => finish(outcome),
									authorize: async () => {
										const admitted = await store.authorize(
											raw,
											org!,
											"mcp:status",
											requestId,
											span.traceId,
											delegation,
											true,
										);
										runId = admitted.runId;
										if (abort.signal.aborted) {
											await finish("cancelled");
											throw new Denied(499, "cancelled");
										}
										return admitted;
									},
								});
								if (runId && abort.signal.aborted) await finish("cancelled");
								return response;
							}
							if (!match || request.method !== "POST")
								throw new Denied(404, "not_found");
							await store.authorize(
								raw,
								org!,
								"llm:stream",
								requestId,
								span.traceId,
								delegation,
								false,
							);
							const data = await body(request, abort.signal);
							if (
								data.stream !== true ||
								data.model !== (env.GATEWAY_PROVIDER_MODEL ?? "local-fixture")
							)
								throw new Denied(400, "stream_model_required");
							runId = (
								await store.authorize(
									raw,
									org!,
									"llm:stream",
									requestId,
									span.traceId,
									delegation,
									true,
								)
							).runId;
							const cancelled = () => {
								void finish("cancelled")
									.catch(() => {})
									.finally(release);
							};
							abort.signal.addEventListener("abort", cancelled, { once: true });
							if (abort.signal.aborted) cancelled();
							if (abort.signal.aborted) throw new Denied(499, "cancelled");
							await runtime.runPromise(
								Metric.update(
									Metric.counter("stellarc_gateway_requests_total"),
									1,
								),
							);
							const authorize = async () => {
								abort.signal.throwIfAborted();
								// DB statement/lock/acquire bounds belong to the pool; do not
								// abandon raced authorization work against a closing pool.
								const work = store
									.authorize(
										raw,
										org!,
										"llm:stream",
										requestId,
										span.traceId,
										delegation,
										false,
									)
									.then(() => {});
								authorities.add(work);
								try {
									await work;
								} finally {
									authorities.delete(work);
								}
								abort.signal.throwIfAborted();
							};
							let response: Response;
							if (env.GATEWAY_PROVIDER_URL) {
								if (env.GATEWAY_ENABLE_LIVE !== "approved")
									throw new Denied(503, "live_provider_disabled");
								// First slice: one server-owned native Chat API-key route only.
								const routes = validateRoutes([
									{
										alias: env.GATEWAY_PROVIDER_MODEL ?? "local-fixture",
										provider: "glm",
										model: env.GATEWAY_PROVIDER_MODEL ?? "glm-5.3",
										protocol: "chat",
										endpoint: env.GATEWAY_PROVIDER_URL,
										credential: "glm-key",
									},
								]);
								const plan = prepareProviderRequest(
									routes,
									"/v1/chat/completions",
									data,
									() => required("GATEWAY_PROVIDER_SECRET"),
								);
								await authorize();
								response = await fetch(plan.endpoint, {
									method: "POST",
									redirect: plan.redirect,
									signal: abort.signal,
									headers: plan.headers,
									body: JSON.stringify(plan.body),
								});
							} else {
								let chunk = 0;
								response = new Response(
									new ReadableStream<Uint8Array>(
										{
											pull(c) {
												if (chunk === 3) {
													c.enqueue(
														new TextEncoder().encode("data: [DONE]\n\n"),
													);
													c.close();
													return;
												}
												c.enqueue(
													new TextEncoder().encode(
														`data: ${JSON.stringify({ id: requestId, object: "chat.completion.chunk", model: "local-fixture", choices: [{ index: 0, delta: { content: `fixture-${++chunk} ` }, finish_reason: null }], fixture: true })}\n\n`,
													),
												);
											},
										},
										{ highWaterMark: 0 },
									),
									{ headers: { "content-type": "text/event-stream" } },
								);
							}
							if (abort.signal.aborted) {
								void response.body?.cancel().catch(() => {});
								throw new Denied(499, "cancelled");
							}
							const result = await providerResponse(response, "chat", true, {
								signal: abort.signal,
								authorize,
								finish,
								abort: () => abort.abort(),
								settled: release,
							});
							transferred = true;
							for (const [key, value] of Object.entries({
								...headers,
								"x-request-id": requestId,
								"x-stellarc-run-id": runId!,
								"x-trace-id": span.traceId,
								"x-stellarc-provider": env.GATEWAY_PROVIDER_URL
									? "configured"
									: "local-fixture",
							}))
								result.headers.set(key, value);
							return result;
						},
						catch: (error) =>
							error instanceof Denied ? error : new Denied(503, "unavailable"),
					}).pipe(
						Effect.catch((error) =>
							Effect.tryPromise({
								try: async () => {
									await finish(abort.signal.aborted ? "cancelled" : "failed");
									if (url.pathname.startsWith("/manage/"))
										await store.securityEvent(
											"management.deny",
											"anonymous",
											requestId,
											span.traceId,
										);
									return Response.json(
										{ error: error.reason },
										{ status: error.status, headers },
									);
								},
								catch: () => new Denied(503, "audit_unavailable"),
							}).pipe(
								Effect.catch(() =>
									Effect.succeed(
										Response.json(
											{ error: "audit_unavailable" },
											{ status: 503, headers },
										),
									),
								),
							),
						),
						Effect.tap((response) =>
							Effect.annotateCurrentSpan(
								"http.response.status_code",
								response.status,
							),
						),
					);
				}).pipe(
					Effect.withSpan("stellarc.gateway.request", {
						kind: "server",
						...(parent ? { parent } : {}),
					}),
				),
			);
		} catch (error) {
			return Response.json(
				{ error: error instanceof Denied ? error.reason : "unavailable" },
				{ status: error instanceof Denied ? error.status : 503, headers },
			);
		} finally {
			if (!transferred) release();
		}
	}
	return {
		handler,
		store,
		async dispose() {
			stopping = true;
			for (const c of controllers) c.abort();
			await Promise.allSettled([...requests]);
			await Promise.allSettled([...authorities]);
			await auth.drain();
			await mcp.dispose();
			const outcomes = await Promise.allSettled([...finalizers]);
			if (outcomes.some((result) => result.status === "rejected"))
				await runtime.runPromise(
					Effect.logError("shutdown terminal audit unavailable"),
				);
			await runtime.dispose();
			await sql.end();
			await pool.end();
			void exportLoop;
		},
	};
}
if (import.meta.main) {
	const app = await gatewayApp();
	const origin = new URL(process.env.GATEWAY_ORIGIN!);
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: Number(process.env.GATEWAY_PORT ?? 1438),
		idleTimeout: 45,
		fetch: (request) => {
			// Only the loopback ingress may translate HTTP transport to the pinned HTTPS
			// application origin. Forwarded identity/origin headers have no authority.
			if (request.headers.get("host") !== origin.host)
				return new Response("wrong host", { status: 400 });
			const url = new URL(request.url);
			return app.handler(
				new Request(origin.origin + url.pathname + url.search, request),
			);
		},
	});
	const stop = async () => {
		server.stop(true);
		await app.dispose();
		process.exit(0);
	};
	process.on("SIGTERM", () => void stop());
	process.on("SIGINT", () => void stop());
}
