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

/**
 * Per-table wire policy. The engine owns the protocol mechanics (snapshot
 * boundary, cursors, tails, reconnect, long-poll); a spec owns only what is
 * table-specific: the snapshot query, the electric schema header and the
 * event→message mapping. `sync_probe` is the T0 identity of this contract and
 * its behaviour is byte-identical to the pre-generalization engine.
 */
export interface ShapeTableSpec {
	readonly schema: Record<
		string,
		{ type: string; not_null?: boolean; pk_index?: number }
	>;
	/** Snapshot rows in wire form (org included), ordered by id, inside the
	 * engine's repeatable-read transaction. */
	readonly snapshot: (
		tx: Parameters<Parameters<Sql["begin"]>[1]>[0],
		org: string,
		params: URLSearchParams,
	) => Promise<Array<Record<string, unknown>>>;
	/** Map one log event to a table message. Return null when the event
	 * belongs to another table (the offset still advances — exact-once per
	 * table is preserved). Throwing means an unsupported schema (503). */
	readonly eventMessage: (
		event: {
			seq: string;
			txid: string;
			plugin_type: string;
			payload: unknown;
			schema_version: number;
		},
		org: string,
		params: URLSearchParams,
	) => { id: string; value: Record<string, unknown>; deleted: boolean } | null;
	readonly extraParams?: ReadonlySet<string>;
	readonly requireParams?: readonly string[];
}

export class ShapeEngine {
	afterProjectionRead?: () => Promise<void>;
	private snapshots = new Map<
		string,
		{
			org: string;
			table: string;
			rows: Array<Record<string, unknown>>;
			boundary: string;
			expires: number;
			cursors: Map<string, string>;
		}
	>();
	private tables = new Map<string, ShapeTableSpec>();
	constructor(
		private sql: Sql,
		private upcasters = new UpcasterRegistry(),
		private telemetry?: (entry: { org: string; log: string }) => void,
	) {}
	registerTable(name: string, spec: ShapeTableSpec) {
		this.tables.set(name, spec);
	}
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
		const table = url.searchParams.get("table") ?? "sync_probe";
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
							"stellarc.shape.table": table,
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

	private tableSpec(table: string): ShapeTableSpec {
		if (table === "sync_probe") return probeTable(this.upcasters);
		return this.tables.get(table) ?? probeTable(this.upcasters);
	}

	private async page(org: string, url: URL): Promise<Response> {
		const q = url.searchParams;
		const table = q.get("table") ?? "sync_probe";
		const spec = this.tableSpec(table);
		const allowed = new Set([
			"table",
			"offset",
			"handle",
			"live",
			"log",
			"cursor",
			"expired_handle",
			"cache-buster",
			...(spec.extraParams ?? []),
		]);
		if ([...q.keys()].some((k) => !allowed.has(k)))
			return new Response(null, { status: 400 });
		if (table !== "sync_probe" && !this.tables.has(table))
			return new Response(null, { status: 404 });
		for (const required of spec.requireParams ?? [])
			if (!q.get(required)) return new Response(null, { status: 400 });
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
					const rows = await spec.snapshot(tx, org, q);
					await this.afterProjectionRead?.();
					const [counter] =
						await tx`SELECT seq::text FROM org_event_counter WHERE org=${org}`;
					return {
						org,
						table,
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
			"electric-schema": JSON.stringify(spec.schema),
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
					key: key(org, String(row.id)),
					value: row,
					headers: { operation: "insert", relation: ["public", table] },
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
			for (const raw of events.slice(0, 100)) {
				const event = {
					seq: String(raw.seq),
					txid: String(raw.txid),
					plugin_type: String(raw.plugin_type),
					payload: raw.payload,
					schema_version: Number(raw.schema_version),
				};
				next = `${event.seq}_0`;
				let mapped: {
					id: string;
					value: Record<string, unknown>;
					deleted: boolean;
				} | null;
				try {
					mapped = spec.eventMessage(event, org, q);
				} catch {
					return Response.json(
						{ _tag: "Unavailable", message: "Unsupported event schema" },
						{ status: 503, headers: { "cache-control": "no-store" } },
					);
				}
				if (!mapped) continue;
				messages.push({
					key: key(org, mapped.id),
					value: mapped.value,
					headers: {
						operation: mapped.deleted ? "delete" : "update",
						relation: ["public", table],
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

/** T0 sync_probe identity of the ShapeTableSpec contract. */
export function probeTable(upcasters: UpcasterRegistry): ShapeTableSpec {
	return {
		schema: electricSchema,
		snapshot: async (tx, org) =>
			(await tx<
				Array<Record<string, unknown>>
			>`SELECT org,id,value,last_seq::text FROM sync_probe WHERE org=${org} ORDER BY id`) as Array<
				Record<string, unknown>
			>,
		eventMessage: (event, org) => {
			if (
				!["foundation:probe-upserted", "foundation:probe-deleted"].includes(
					event.plugin_type,
				)
			)
				return null;
			const payload = upcasters.decode(
				event.plugin_type,
				event.schema_version,
				event.payload,
			) as ProbePayload;
			const deleted = event.plugin_type === "foundation:probe-deleted";
			return {
				id: payload.id,
				value: deleted
					? { org, id: payload.id }
					: { org, ...payload, last_seq: event.seq },
				deleted,
			};
		},
	};
}
