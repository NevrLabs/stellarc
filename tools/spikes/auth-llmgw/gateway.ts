import { createHash, randomBytes } from "node:crypto";
import { Effect, ManagedRuntime, Metric, Tracer } from "effect";
import type { Sql, TransactionSql } from "postgres";
import { TelemetryLive } from "../../../packages/telemetry/src/index";

// Throwaway fixture route, NOT an OIDC authority or production API mount.
export const ddl = `
CREATE TABLE authgw_grant (
 id text PRIMARY KEY, digest text UNIQUE NOT NULL, org text NOT NULL,
 actor text NOT NULL, scope text NOT NULL CHECK(scope='fixture:stream'),
 expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE authgw_member (org text NOT NULL, actor text NOT NULL,
 PRIMARY KEY(org,actor));
CREATE TABLE authgw_cursor (org text PRIMARY KEY, seq bigint NOT NULL DEFAULT 0);
`;
const SYSTEM = "authgw-system";
const digest = (value: string) =>
	createHash("sha256").update(value).digest("hex");
export class Refusal extends Error {
	constructor(
		readonly status: number,
		readonly reason: string,
	) {
		super(reason);
	}
}
export function traceContext(headers: Headers) {
	const value = headers.get("traceparent");
	if (!value) return undefined;
	if (!/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(value))
		throw new Refusal(400, "invalid_trace_context");
	const [, traceId, spanId, flags] = value.split("-");
	if (/^0+$/.test(traceId) || /^0+$/.test(spanId))
		throw new Refusal(400, "invalid_trace_context");
	// Baggage and tracestate are deliberately not propagated; identity never comes from headers.
	return Tracer.externalSpan({ traceId, spanId, sampled: flags === "01" });
}
export function gateway(
	sql: Sql,
	endpoint?: string,
	telemetry = TelemetryLive("stellarc-authgw-spike"),
	fixture: { failAttempts?: number; failAfterChunk?: number } = {},
) {
	const runtime = ManagedRuntime.make(telemetry);
	let active = 0;
	let gap = false;
	const pendingPulls = new Set<Promise<void>>();
	const drain = async () => {
		while (pendingPulls.size) await Promise.all([...pendingPulls]);
	};
	const spans = <A>(
		name: string,
		attributes: Record<string, string | number>,
		fn: (context: { traceId: string; spanId: string }) => Promise<A>,
	) =>
		runtime.runPromise(
			Effect.gen(function* () {
				const context = yield* Effect.currentSpan;
				return yield* Effect.tryPromise({
					try: () => fn(context),
					catch: (error) =>
						error instanceof Refusal
							? error
							: new Refusal(503, "operation_failed"),
				});
			}).pipe(Effect.withSpan(name, { attributes })),
		);
	async function audit(
		tx: TransactionSql,
		org: string,
		actor: string,
		kind: string,
		requestId: string,
		traceId: string,
		emergency = false,
	) {
		await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [counter] =
			await tx`SELECT seq::text FROM org_event_counter WHERE org=${org} FOR UPDATE`;
		const [cursor] =
			await tx`SELECT seq::text FROM authgw_cursor WHERE org=${org}`;
		const pending = BigInt(counter.seq) - BigInt(cursor?.seq ?? "0");
		if (pending >= BigInt(emergency ? 1100 : 1000)) {
			gap = true;
			throw new Refusal(503, "audit_capacity");
		}
		const [next] =
			await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org=${org} RETURNING seq::text`;
		const eventId = `authgw:${org}:${next.seq}`;
		// Explicit allowlist: neither credential hashes nor request bodies enter the event log.
		const payload = { eventId, requestId, traceId, outcome: kind };
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
   VALUES (${org},${next.seq},${`authgw:${kind}`},${actor},${tx.json(payload)},1,pg_current_xact_id()::text::bigint)`;
		return eventId;
	}
	async function issue(
		org: string,
		actor: string,
		ttlMs = 60000,
		scope = "fixture:stream",
	) {
		if (
			scope !== "fixture:stream" ||
			!Number.isInteger(ttlMs) ||
			ttlMs < 1 ||
			ttlMs > 60000
		)
			throw new Refusal(403, "invalid_scope_or_ttl");
		const raw = randomBytes(32).toString("base64url");
		const id = crypto.randomUUID();
		await spans(
			"authgw.token.issue",
			{ "stellarc.org": org, "stellarc.actor": actor },
			async (context) =>
				sql.begin(async (tx) => {
					const members =
						await tx`SELECT actor FROM authgw_member WHERE org=${org} AND actor=${actor} FOR UPDATE`;
					if (!members.length) throw new Refusal(403, "no_membership");
					await audit(tx, org, actor, "token-issued", id, context.traceId);
					await tx`INSERT INTO authgw_grant(id,digest,org,actor,scope,expires_at)
    VALUES (${id},${digest(raw)},${org},${actor},${scope},clock_timestamp()+${ttlMs}*interval '1 millisecond')`;
				}),
		);
		return { id, raw };
	}
	async function revoke(id: string) {
		await spans("authgw.token.revoke", {}, async (context) =>
			sql.begin(async (tx) => {
				const [grant] =
					await tx`SELECT org,actor FROM authgw_grant WHERE id=${id} FOR UPDATE`;
				if (!grant) throw new Refusal(404, "unknown_grant");
				await audit(
					tx,
					grant.org,
					grant.actor,
					"token-revoked",
					id,
					context.traceId,
					true,
				);
				await tx`UPDATE authgw_grant SET revoked=true WHERE id=${id}`;
			}),
		);
	}
	async function authorize(
		raw: string,
		org: string,
		requestId: string,
		traceId: string,
		admission: boolean,
	) {
		const result = await sql.begin(async (tx) => {
			const [g] =
				await tx`SELECT *, expires_at>clock_timestamp() AS fresh FROM authgw_grant WHERE digest=${digest(raw)} FOR UPDATE`;
			const members = g
				? await tx`SELECT actor FROM authgw_member WHERE org=${g.org} AND actor=${g.actor} FOR SHARE`
				: [];
			const ok = g && !g.revoked && g.fresh && g.org === org && members.length;
			if (!ok) {
				await audit(
					tx,
					SYSTEM,
					"anonymous",
					"call-denied",
					requestId,
					traceId,
					true,
				);
				return null;
			}
			if (admission)
				await audit(tx, g.org, g.actor, "call-admitted", requestId, traceId);
			return {
				id: g.id as string,
				actor: g.actor as string,
				org: g.org as string,
			};
		});
		if (!result) throw new Refusal(403, "not_authorized");
		return result;
	}
	// One exporter per spike process. No ordinary log enqueue/flush advances this cursor.
	let exporting = false;
	async function exportAudit(target = endpoint) {
		if (!target) throw new Refusal(503, "no_audit_endpoint");
		if (exporting) throw new Refusal(409, "export_in_progress");
		exporting = true;
		let count = 0;
		try {
			const orgs =
				await sql`SELECT org FROM org_event_counter ORDER BY org LIMIT 100`;
			for (const { org } of orgs) {
				const [cursor] =
					await sql`SELECT seq::text FROM authgw_cursor WHERE org=${org}`;
				const events =
					await sql`SELECT seq::text,plugin_type,actor,payload,created_at FROM event
     WHERE org=${org} AND seq>${cursor?.seq ?? "0"} ORDER BY event.seq LIMIT 100`;
				if (!events.length) continue;
				const logRecords = events.map((e) => ({
					timeUnixNano: (
						BigInt(new Date(e.created_at).getTime()) * 1000000n
					).toString(),
					severityNumber: e.plugin_type === "authgw:call-denied" ? 13 : 9,
					severityText:
						e.plugin_type === "authgw:call-denied" ? "WARN" : "INFO",
					body: { stringValue: e.plugin_type },
					...(e.payload.traceId ? { traceId: e.payload.traceId } : {}),
					attributes: Object.entries({
						"event.id": e.payload.eventId,
						"request.id": e.payload.requestId,
						"stellarc.org": org,
						"stellarc.actor": e.actor,
					}).map(([key, value]) => ({
						key,
						value: { stringValue: String(value) },
					})),
				}));
				const response = await fetch(target, {
					method: "POST",
					redirect: "error",
					signal: AbortSignal.timeout(3000),
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						resourceLogs: [
							{
								resource: {
									attributes: [
										{
											key: "service.name",
											value: { stringValue: "stellarc-authgw-spike" },
										},
										{
											key: "service.version",
											value: {
												stringValue: process.env.SERVICE_VERSION ?? "unknown",
											},
										},
										{
											key: "deployment.environment.name",
											value: { stringValue: "development" },
										},
									],
								},
								scopeLogs: [
									{ scope: { name: "stellarc.authgw.audit" }, logRecords },
								],
							},
						],
					}),
				});
				if (!response.ok) throw new Refusal(503, "audit_export_failed");
				const text = await response.text();
				if (text.length > 8192) throw new Refusal(503, "invalid_otlp_response");
				const reply = JSON.parse(text);
				const partial = reply?.partialSuccess;
				if (
					!reply ||
					typeof reply !== "object" ||
					Array.isArray(reply) ||
					Object.keys(reply).some((k) => k !== "partialSuccess") ||
					(Object.hasOwn(reply, "partialSuccess") &&
						(!partial ||
							typeof partial !== "object" ||
							Array.isArray(partial) ||
							Object.keys(partial).some(
								(k) => k !== "rejectedLogRecords" && k !== "errorMessage",
							) ||
							(partial.rejectedLogRecords !== undefined &&
								partial.rejectedLogRecords !== 0 &&
								partial.rejectedLogRecords !== "0") ||
							(partial.errorMessage !== undefined &&
								partial.errorMessage !== "")))
				)
					throw new Refusal(503, "audit_partial_or_invalid");
				// Crash here replays accepted rows; event.id is the consumer dedupe key.
				await sql`INSERT INTO authgw_cursor(org,seq) VALUES (${org},${events.at(-1)!.seq})
     ON CONFLICT(org) DO UPDATE SET seq=GREATEST(authgw_cursor.seq,EXCLUDED.seq)`;
				count += events.length;
			}
			return count;
		} finally {
			exporting = false;
		}
	}
	async function handler(request: Request) {
		const requestId = crypto.randomUUID();
		const path = new URL(request.url).pathname;
		if (path === "/health")
			return Response.json({
				active,
				queue: 0,
				gap,
				provider: "LOCAL FIXTURE ONLY",
			});
		let parent: ReturnType<typeof traceContext>;
		try {
			parent = traceContext(request.headers);
		} catch {
			return new Response("invalid context", { status: 400 });
		}
		// No request payloads are accepted by the fixture route.
		if (
			request.method !== "POST" ||
			request.body !== null ||
			request.headers.has("transfer-encoding") ||
			Number(request.headers.get("content-length") ?? 0) !== 0
		)
			return new Response("empty POST required", { status: 400 });
		const match = /^\/orgs\/([a-z0-9-]{1,64})\/stream$/.exec(path);
		if (!match) return new Response("not found", { status: 404 });
		const raw =
			/^Bearer ([A-Za-z0-9_-]{43})$/.exec(
				request.headers.get("authorization") ?? "",
			)?.[1] ?? "";
		const org = match[1];
		const run = Effect.gen(function* () {
			const span = yield* Effect.currentSpan;
			const traceId = span.traceId;
			yield* Effect.annotateCurrentSpan({
				"request.id": requestId,
				"http.route": "/orgs/:org/stream",
				"provider.name": "local-fixture",
			});
			const decision = yield* Effect.tryPromise({
				try: () => authorize(raw, org, requestId, traceId, true),
				catch: (error) =>
					error instanceof Refusal
						? error
						: new Refusal(503, "audit_unavailable"),
			}).pipe(
				Effect.match({
					onFailure: (error) => ({ error, principal: null }),
					onSuccess: (principal) => ({ error: null, principal }),
				}),
			);
			const admitted = decision.principal;
			if (!admitted) {
				yield* Effect.logWarning("gateway denied").pipe(
					Effect.annotateLogs({
						"request.id": requestId,
						"error.type": decision.error?.reason ?? "denied",
					}),
				);
				return new Response("denied", {
					status: decision.error?.status ?? 503,
				});
			}
			yield* Effect.annotateCurrentSpan({
				"stellarc.org": org,
				"stellarc.actor": admitted.actor,
			});
			if (active >= 2) return new Response("capacity", { status: 429 });
			active++;
			yield* Metric.update(Metric.counter("authgw_requests_total"), 1);
			const abort = new AbortController();
			const disconnect = () => abort.abort();
			request.signal.addEventListener("abort", disconnect, { once: true });
			if (request.signal.aborted) abort.abort();
			const deadline = setTimeout(disconnect, 10000);
			let released = false;
			const release = () => {
				if (released) return;
				released = true;
				active--;
				clearTimeout(deadline);
				request.signal.removeEventListener("abort", disconnect);
			};
			// The fixture is an explicitly local provider; retry only before response bytes.
			let ready = false;
			for (let attempt = 0; attempt < 2; attempt++) {
				const result = yield* Effect.tryPromise({
					try: async () => {
						await authorize(raw, org, requestId, traceId, false);
						if (abort.signal.aborted) throw new Refusal(499, "cancelled");
						if (attempt < (fixture.failAttempts ?? 0))
							throw new Refusal(502, "fixture_upstream_error");
					},
					catch: () => new Refusal(502, "fixture_attempt_failed"),
				}).pipe(
					Effect.withSpan("authgw.provider.attempt", {
						attributes: {
							"retry.attempt": attempt,
							"provider.name": "local-fixture",
						},
					}),
					Effect.match({ onFailure: () => false, onSuccess: () => true }),
				);
				if (result) {
					ready = true;
					break;
				}
			}
			if (!ready) {
				abort.abort();
				release();
				return new Response("fixture unavailable", { status: 502 });
			}
			// Pull, not an unbounded producer queue. Maximum one 64-byte fixture chunk buffered.
			let chunk = 0;
			const stream = new ReadableStream<Uint8Array>(
				{
					pull(controller) {
						const task = (async () => {
							try {
								await authorize(raw, org, requestId, traceId, false);
								if (abort.signal.aborted) throw new Refusal(499, "cancelled");
								if (chunk >= 3) {
									controller.close();
									release();
									return;
								}
								if (
									fixture.failAfterChunk !== undefined &&
									chunk >= fixture.failAfterChunk
								)
									throw new Refusal(502, "fixture_stream_error");
								await runtime.runPromise(
									Effect.gen(function* () {
										yield* Effect.annotateCurrentSpan({
											"provider.name": "local-fixture",
											"retry.attempt": 0,
										});
										yield* Effect.logInfo("fixture chunk").pipe(
											Effect.annotateLogs({
												"request.id": requestId,
												"stellarc.org": org,
												"stellarc.actor": admitted.actor,
											}),
										);
									}).pipe(
										Effect.withSpan("authgw.provider.fixture", {
											parent: Tracer.externalSpan({
												traceId,
												spanId: span.spanId,
												sampled: true,
											}),
										}),
									),
								);
								controller.enqueue(
									new TextEncoder().encode(`data: fixture-${++chunk}\n\n`),
								);
							} catch (error) {
								await runtime.runPromise(
									Effect.logWarning("stream stopped").pipe(
										Effect.annotateLogs({
											"error.type":
												error instanceof Refusal
													? error.reason
													: error instanceof Error
														? error.name
														: "unknown",
										}),
									),
								);
								abort.abort();
								release();
								controller.error(new Error("stream stopped"));
							}
						})();
						pendingPulls.add(task);
						return task.finally(() => pendingPulls.delete(task));
					},
					async cancel() {
						abort.abort();
						await drain();
						release();
					},
				},
				{ highWaterMark: 1 },
			);
			abort.signal.addEventListener(
				"abort",
				() => {
					void drain().then(release);
				},
				{ once: true },
			);
			if (abort.signal.aborted) {
				void drain().then(release);
			}
			return new Response(stream, {
				headers: {
					"content-type": "text/event-stream",
					"x-request-id": requestId,
					"x-trace-id": traceId,
					"cache-control": "no-store",
				},
			});
		}).pipe(
			Effect.withSpan("authgw.request", {
				kind: "server",
				...(parent ? { parent } : {}),
			}),
		);
		return runtime.runPromise(run);
	}
	return {
		issue,
		revoke,
		authorize,
		audit,
		exportAudit,
		handler,
		runtime,
		drain,
		state: () => ({ active, gap }),
		dispose: async () => {
			await drain();
			await runtime.dispose();
		},
		spans,
	};
}
