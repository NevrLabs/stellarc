import { Cause, Effect, Exit, Metric, MetricBoundaries, Runtime } from "effect";

const liveConnections = Metric.gauge("stellarc_shape_live_connections");
const tailWait = Metric.histogram(
	"stellarc_shape_tail_wait_seconds",
	MetricBoundaries.exponential({ start: 0.01, factor: 2, count: 13 }),
);
let activeLiveConnections = 0;

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
import { type ProbePayload, UpcasterRegistry } from "./upcasters";

export class ShapeEngine {
	afterProjectionRead?: () => Promise<void>;
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
	constructor(
		private sql: Sql,
		private upcasters = new UpcasterRegistry(),
		private telemetry: (entry: { org: string; log: string }) => void = (
			entry,
		) => console.info("shape request", entry),
	) {}
	shapeEffect = Effect.fn("Sync.shape")(
		(org: string, url: URL, signal?: AbortSignal) => {
			const self = this;
			return Effect.gen(function* () {
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
					Effect.sync(() => ++activeLiveConnections).pipe(
						Effect.tap((count) => Metric.set(liveConnections, count)),
					),
					() => request,
					() =>
						Effect.gen(function* () {
							yield* Metric.set(liveConnections, --activeLiveConnections);
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
	private async runShape(
		org: string,
		url: URL,
		signal: AbortSignal | undefined,
		page: (url: URL) => Promise<Response>,
	): Promise<Response> {
		const q = url.searchParams;
		if (q.has("log")) this.telemetry({ org, log: q.get("log") ?? "full" });
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
			"log",
			"cursor",
			"expired_handle",
			"cache-buster",
		]);
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
