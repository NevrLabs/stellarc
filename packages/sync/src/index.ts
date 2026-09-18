import {
	Cause,
	Effect,
	Exit,
	Metric,
	MetricBoundaries,
	Runtime,
	Tracer,
} from "effect";

const liveConnections = Metric.gauge("stellarc_shape_live_connections");
const tailWait = Metric.histogram(
	"stellarc_shape_tail_wait_seconds",
	MetricBoundaries.exponential({ start: 0.01, factor: 2, count: 13 }),
);

async function runEffect<A>(
	runtime: Runtime.Runtime<never>,
	effect: Effect.Effect<A, unknown>,
): Promise<A> {
	const exit = await Runtime.runPromiseExit(runtime)(effect);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

import type { Sql } from "postgres";
import { electricSchema, key, type ProbeRow } from "../../contracts/src/shape";
import { recordSseMetrics, runSseStream } from "./sse";
import { type ProbePayload, UpcasterRegistry } from "./upcasters";

export class ShapeEngine {
	afterProjectionRead?: () => Promise<void>;
	/** STL-25 test hook: override SSE cycle / keep-alive cadence. */
	sseTiming?: { cycleMs?: number; kaMs?: number };
	private snapshots = new Map<
		string,
		{
			org: string;
			rows: ProbeRow[];
			boundary: string;
			expires: number;
			cursors: Map<string, string>;
		}
	>();
	/** Live-connection count backing the gauge. Per-instance, not
	 * module-global: production runs one engine per process (identical
	 * semantics), and each test server gets its own count so a leaked
	 * stream from an earlier suite cannot inflate another's gauge. */
	private activeLiveConnections = 0;
	constructor(
		private sql: Sql,
		private upcasters = new UpcasterRegistry(),
		private telemetry?: (entry: { org: string; log: string }) => void,
	) {}
	shapeEffect = Effect.fn("Sync.shape")(
		(org: string, url: URL, signal?: AbortSignal) => {
			const self = this;
			return Effect.gen(function* () {
				const log = url.searchParams.get("log");
				if (log === "full" || log === "changes_only") {
					yield* Effect.logInfo("shape request").pipe(
						Effect.annotateLogs("stellarc.shape.log", log),
					);
					self.telemetry?.({ org, log });
				}
				const runtime = yield* Effect.runtime<never>();
				const live = url.searchParams.get("live") === "true";
				const began = performance.now();
				const request = Effect.tryPromise({
					try: (fiberSignal) =>
						self.runShape(org, url, signal ?? fiberSignal, (pageUrl) =>
							runEffect(runtime, self.pageEffect(org, pageUrl)),
						),
					catch: (cause) => cause,
				});
				if (!live) return yield* request;
				return yield* Effect.acquireUseRelease(
					Effect.sync(() => ++self.activeLiveConnections).pipe(
						Effect.tap((count) => Metric.set(liveConnections, count)),
					),
					() => request,
					() =>
						Effect.gen(function* () {
							yield* Metric.set(liveConnections, --self.activeLiveConnections);
							yield* Metric.update(
								tailWait,
								(performance.now() - began) / 1000,
							);
						}),
				);
			});
		},
	);
	shape(org: string, url: URL, signal?: AbortSignal): Promise<Response> {
		return runEffect(
			Runtime.defaultRuntime,
			this.shapeEffect(org, url, signal),
		);
	}
	private pageEffect(org: string, url: URL) {
		const offset = url.searchParams.get("offset") ?? "-1";
		const snapshot = this.snapshots.get(url.searchParams.get("handle") ?? "");
		const decoded = snapshot?.cursors.get(offset) ?? offset;
		const initial = decoded === "-1" || decoded.startsWith("s:");
		return Effect.fn(
			initial ? "stellarc.shape.snapshot" : "stellarc.shape.tail",
		)(() =>
			Effect.tryPromise({
				try: () => this.page(org, url),
				catch: (cause) => cause,
			}).pipe(
				Effect.tap((response) =>
					Effect.gen(function* () {
						const messages =
							response.status === 200
								? yield* Effect.promise(() => response.clone().json())
								: [];
						yield* Effect.annotateCurrentSpan({
							"stellarc.shape.table": "sync_probe",
							"stellarc.shape.offset_from": initial
								? decoded
								: decoded.split("_")[0],
							"stellarc.shape.events_sent": (
								messages as Array<{ headers: { operation?: string } }>
							).filter((message) => message.headers.operation).length,
						});
					}),
				),
			),
		)();
	}
	/** Parse one fetched page into the SSE stream shape (shared by the
	 * pre-stream check and every in-stream page fetch). */
	private async ssePageFromResponse(
		response: Response,
	): Promise<import("./sse").SsePageResult> {
		if (response.status !== 200)
			throw new SsePageError(
				response.status,
				response.status === 409 ? "must-refetch" : "error",
			);
		const messages = (await response.clone().json()) as Array<{
			headers: { operation?: string; control?: string };
		}>;
		return {
			messages: messages.filter((m) => m.headers.operation),
			nextCursor: response.headers.get("electric-offset") ?? "0_0",
			schemaHeader: response.headers.get("electric-schema"),
		};
	}

	/**
	 * STL-25: the SSE response for a qualifying request. One held-open
	 * connection acquires the live gauge exactly once (S15), drives its page
	 * loop as children of a per-connection `stellarc.shape.sse` span that ends
	 * only at stream close (S14), re-authorizes at every cycle boundary and
	 * keep-alive tick, and releases gauge + metrics at every close kind:
	 * cycle, disconnect, revocation, error. A pre-stream page failure (expired
	 * handle: 409 must-refetch) passes the engine's sanitized JSON response
	 * through verbatim - never a stream (spec §3 error union).
	 */
	sseEffect = Effect.fn("Sync.sseEffect")(
		(
			org: string,
			url: URL,
			signal?: AbortSignal,
			authorize: () => boolean = () => true,
			// STL-25 D5: handler-derived kind ("actor" | "anonymous") - the
			// engine cannot know it (identity parsing lives in the handler).
			principalKind = "anonymous",
		) => {
			const self = this;
			return Effect.gen(function* () {
				const rt = yield* Effect.runtime<never>();
				// Pre-stream page: a non-200 answer (expired handle: 409
				// must-refetch) is returned as the response - the handler passes
				// its JSON body through, never a stream (spec §3).
				const preResponse = yield* Effect.tryPromise(() =>
					self.page(org, url),
				).pipe(Effect.mapError((error) => error as Error));
				if (preResponse.status !== 200) return preResponse;
				const pre = yield* Effect.tryPromise(() =>
					self.ssePageFromResponse(preResponse),
				).pipe(Effect.mapError((error) => error as Error));
				const headers = new Headers({
					"content-type": "text/event-stream",
					"cache-control": "no-store",
					"electric-handle": url.searchParams.get("handle") ?? "",
					"electric-offset": url.searchParams.get("offset") ?? "-1",
					"electric-schema": pre.schemaHeader ?? JSON.stringify(electricSchema),
					"electric-cursor": crypto.randomUUID(),
					"X-Accel-Buffering": "no",
				});
				const startedAt = performance.now();
				// Client disconnect reaches us two ways: the request signal (Bun
				// aborts it on connection close) and response-stream cancel. Fan
				// both into one loop-abort controller.
				const disconnect = new AbortController();
				const onOuterAbort = () =>
					disconnect.abort(
						signal?.reason ?? new DOMException("Aborted", "AbortError"),
					);
				signal?.addEventListener("abort", onOuterAbort, { once: true });
				if (signal?.aborted) disconnect.abort();
				// Per-connection span: child of the inbound request span; page
				// spans run as its children via an explicit Span context override.
				const span = yield* Effect.makeSpan("stellarc.shape.sse");
				span.attribute("stellarc.shape.table", "sync_probe");
				span.attribute(
					"stellarc.shape.offset_from",
					url.searchParams.get("offset") ?? "-1",
				);
				span.attribute("stellarc.org", org);
				span.attribute("stellarc.principal.kind", principalKind);
				let closed = false;
				let frames = 0;
				const finish = async (
					summary: import("./sse").SseStreamSummary,
				): Promise<void> => {
					if (closed) return;
					closed = true;
					signal?.removeEventListener("abort", onOuterAbort);
					span.attribute("stellarc.shape.events_sent", frames);
					span.attribute("stellarc.shape.sse.close", summary.close);
					span.end(
						process.hrtime.bigint(),
						Exit.succeed(undefined) as Exit.Exit<unknown, unknown>,
					);
					self.activeLiveConnections--;
					await Runtime.runPromise(rt)(
						Effect.gen(function* () {
							yield* Metric.set(liveConnections, self.activeLiveConnections);
							yield* recordSseMetrics(summary);
						}),
					);
				};
				const stream = new ReadableStream<Uint8Array>({
					async start(controller) {
						// S15: exactly one acquire per held-open connection - not per
						// frame, not per page fetch.
						self.activeLiveConnections++;
						await Runtime.runPromise(rt)(
							Metric.set(liveConnections, self.activeLiveConnections),
						);
						try {
							const summary = await runSseStream(
								url,
								disconnect.signal,
								(chunk) => {
									frames++;
									controller.enqueue(chunk);
								},
								{
									page: (pageUrl) =>
										runEffect(
											rt,
											self
												.pageEffect(org, pageUrl)
												.pipe(Effect.provideService(Tracer.ParentSpan, span)),
										).then((response) => self.ssePageFromResponse(response)),
									authorize,
									...(self.sseTiming
										? {
												cycleMs: self.sseTiming.cycleMs,
												kaIntervalMs: self.sseTiming.kaMs,
											}
										: {}),
								},
							);
							frames = summary.frames;
							await finish(summary);
						} catch {
							// Enqueue failure after the driver already returned (the
							// socket tore down mid-release): close as a disconnect
							// with the summary the driver last reported - fallback is
							// derived, never blanket-true (STL-25 D2).
							await finish({
								frames,
								controlFrames: 0,
								fallback: false,
								durationMs: performance.now() - startedAt,
								close: "disconnect",
							});
						} finally {
							try {
								controller.close();
							} catch {}
						}
					},
					cancel() {
						disconnect.abort(
							new DOMException("The stream was aborted", "AbortError"),
						);
					},
				});
				return new Response(stream, { status: 200, headers });
			});
		},
	);

	private async runShape(
		_org: string,
		url: URL,
		signal: AbortSignal | undefined,
		page: (pageUrl: URL) => Promise<Response>,
	): Promise<Response> {
		const q = url.searchParams;
		if (q.has("live") && !["true", "false"].includes(q.get("live") ?? ""))
			return new Response(null, { status: 400 });
		if (q.get("live") !== "true") return page(url);
		if (!q.get("handle") || !q.get("offset") || q.get("offset") === "-1")
			return new Response(null, { status: 400 });
		const deadline = Date.now() + 20000;
		while (true) {
			signal?.throwIfAborted();
			const response = await page(url);
			response.headers.set("electric-cursor", crypto.randomUUID());
			if (response.status !== 200) return response;
			const messages = (await response.clone().json()) as Array<{
				headers: { operation?: string };
			}>;
			if (
				messages.some((message) => message.headers.operation) ||
				response.headers.get("electric-offset") !== q.get("offset")
			)
				return response;
			if (Date.now() >= deadline)
				return new Response(null, { status: 204, headers: response.headers });
			await new Promise<void>((resolve, reject) => {
				const finish = () => {
					signal?.removeEventListener("abort", abort);
					resolve();
				};
				const timer = setTimeout(finish, Math.min(100, deadline - Date.now()));
				const abort = () => {
					clearTimeout(timer);
					signal?.removeEventListener("abort", abort);
					reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
				};
				signal?.addEventListener("abort", abort, { once: true });
				if (signal?.aborted) abort();
			});
		}
	}

	private async page(org: string, url: URL): Promise<Response> {
		const q = url.searchParams;
		const allowed = new Set([
			"table",
			"offset",
			"handle",
			"live",
			"live_sse",
			"experimental_live_sse",
			"log",
			"cursor",
			"expired_handle",
			"cache-buster",
		]);
		// Strict-boolean style of live/log: literal "true" only (STL-25 S11).
		for (const name of ["live_sse", "experimental_live_sse"] as const) {
			if (q.has(name) && q.get(name) !== "true")
				return new Response(null, { status: 400 });
		}
		if ([...q.keys()].some((k) => !allowed.has(k)))
			return new Response(null, { status: 400 });
		if (q.get("table") !== "sync_probe")
			return new Response(null, { status: 404 });
		if (q.has("log") && !["full", "changes_only"].includes(q.get("log") ?? ""))
			return new Response(null, { status: 400 });
		let offset = q.get("offset");
		if (!offset || (offset !== "-1" && !/^\d+_0$/.test(offset)))
			return new Response(null, { status: 400 });
		if (offset !== "-1" && !q.get("handle"))
			return new Response(null, { status: 400 });
		let handle = q.get("handle") ?? "";
		if (offset === "-1") {
			const snapshot = await this.sql.begin(
				"isolation level repeatable read",
				async (tx) => {
					const rows = await tx<
						ProbeRow[]
					>`SELECT org,id,value,last_seq::text FROM sync_probe WHERE org=${org} ORDER BY id`;
					await this.afterProjectionRead?.();
					const [counter] =
						await tx`SELECT seq::text FROM org_event_counter WHERE org=${org}`;
					return {
						org,
						rows: [...rows],
						boundary: counter?.seq ?? "0",
						expires: Date.now() + 300000,
						cursors: new Map<string, string>(),
					};
				},
			);
			handle = crypto.randomUUID();
			this.snapshots.set(handle, snapshot);
		}
		const snapshot = this.snapshots.get(handle);
		const headers = new Headers({
			"content-type": "application/json",
			"electric-schema": JSON.stringify(electricSchema),
			"cache-control": "no-store",
			"electric-handle": handle,
		});
		if (!snapshot || snapshot.org !== org || snapshot.expires < Date.now())
			return Response.json([{ headers: { control: "must-refetch" } }], {
				status: 409,
				headers,
			});
		if (offset !== "-1") {
			const decoded = snapshot.cursors.get(offset);
			if (!decoded)
				return Response.json([{ headers: { control: "must-refetch" } }], {
					status: 409,
					headers,
				});
			offset = decoded;
		}
		const messages: unknown[] = [];
		let next: string;
		let caughtUp = true;
		if (offset === "-1" || offset.startsWith("s:")) {
			const index = offset === "-1" ? 0 : Number(offset.slice(2));
			const rows = snapshot.rows.slice(index, index + 100);
			for (const row of rows)
				messages.push({
					key: key(org, row.id),
					value: row,
					headers: { operation: "insert", relation: ["public", "sync_probe"] },
				});
			next =
				index + 100 < snapshot.rows.length
					? `s:${index + 100}`
					: `${snapshot.boundary}_0`;
		} else {
			if (!/^\d+_0$/.test(offset)) return new Response(null, { status: 400 });
			const cursorSeq = offset.split("_")[0] ?? "0";
			const events = await this
				.sql`SELECT seq::text,txid::text,plugin_type,payload,schema_version FROM event WHERE org=${org} AND seq>${cursorSeq} ORDER BY seq LIMIT 101`;
			caughtUp = events.length <= 100;
			next = offset;
			for (const event of events.slice(0, 100)) {
				next = `${event.seq}_0`;
				if (
					!["foundation:probe-upserted", "foundation:probe-deleted"].includes(
						event.plugin_type,
					)
				)
					continue;
				let payload: ProbePayload;
				try {
					payload = this.upcasters.decode(
						event.plugin_type,
						event.schema_version,
						event.payload,
					);
				} catch {
					return Response.json(
						{ _tag: "Unavailable", message: "Unsupported event schema" },
						{ status: 503, headers: { "cache-control": "no-store" } },
					);
				}
				const deleted = event.plugin_type === "foundation:probe-deleted";
				messages.push({
					key: key(org, payload.id),
					value: deleted
						? { org, id: payload.id }
						: { org, ...payload, last_seq: event.seq },
					headers: {
						operation: deleted ? "delete" : "update",
						relation: ["public", "sync_probe"],
						txids: [Number(event.txid)],
					},
				});
			}
		}
		if (!next.startsWith("s:") && caughtUp) {
			messages.push({ headers: { control: "up-to-date" } });
			headers.set("electric-up-to-date", "true");
		}
		// Keep the client-compatible numeric wire syntax without exposing a sequence.
		// The immutable snapshot owns the issued token and its exact internal cursor.
		let token = [...snapshot.cursors].find(([, value]) => value === next)?.[0];
		if (!token) {
			token = `${BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`)}_0`;
			snapshot.cursors.set(token, next);
		}
		headers.set("electric-offset", token);
		return Response.json(messages, { headers });
	}
}

/** Non-200 page result inside an SSE connection (expired handle etc). */
export class SsePageError extends Error {
	constructor(
		public status: number,
		public detail: string,
	) {
		super(`SSE page error: ${status}`);
	}
}
