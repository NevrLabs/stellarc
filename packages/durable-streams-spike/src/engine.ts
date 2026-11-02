import { Cause, Effect, Exit } from "effect";
import type { Sql } from "postgres";

/**
 * NEVR-438 spike: serves the Durable Streams protocol READ path
 * (PROTOCOL.md §§5.5-5.8, 9.1) directly from Stellarc's append-only event log
 * (packages/db migrations/0001_foundation.sql).
 *
 * Streams are *derived views*, not stored objects: the stream
 * `/orgs/:org/streams/sessions/:sessionId` is the subsequence of `event` rows
 * with plugin_type 'agent.session.message' whose payload->>'sessionId' matches.
 * Per docs/building-a-server.md ("a database sync server might only implement
 * reads and use its own injection system for writes") writes flow through the
 * existing event-log append path (see ./append.ts); POST/DELETE are 501.
 *
 * Offset mapping: the protocol requires opaque, lexicographically sortable,
 * strictly increasing per-stream tokens ("read-seq_byte-offset"). The org's
 * commit-ordered event seq (org_event_counter, advanced inside the write tx —
 * ADR 0007 contract 1) is used directly, zero-padded to 16 digits with a zero
 * byte part: `0000000000000042_0000000000000000`. A subsequence of a strictly
 * increasing sequence is strictly increasing, so this is conforming per
 * stream, and byte-exact resumption holds because each message is exactly one
 * deterministically serialized JSON object.
 *
 * Each event row maps to one Durable State change message
 * (packages/state/STATE-PROTOCOL.md §"Change messages"):
 *   { type: "message", key: <seq>, value: {...payload, id, seq},
 *     headers: { operation: "insert", txid, timestamp } }
 * The stream is append-only, so every message is an insert and no
 * snapshot-start/snapshot-end control messages are synthesized: the log IS
 * the state. Control markers become necessary only when this handler serves
 * mutable projections (see docs/research-2026-11-02-durable-streams.md).
 */

/** Deterministic JSON: fixed key order, no whitespace. Byte-exact on replay. */
const serialize = (value: unknown) => JSON.stringify(value);

const pad16 = (n: bigint | number) => String(n).padStart(16, "0");
const offsetFor = (seq: bigint) => `${pad16(seq)}_${pad16(0)}`;
const OFFSET_PATTERN = /^\d{16}_\d{16}$/;

/** Parse a client-supplied offset into the event seq it reads after. */
const parseOffset = (raw: string | null): bigint | null => {
	if (raw === null || raw === "-1") return 0n;
	if (!OFFSET_PATTERN.test(raw)) return null;
	const seq = BigInt(raw.split("_")[0]);
	return seq < 0n ? null : seq;
};

export interface SessionEventRow {
	seq: string;
	actor: string;
	payload: {
		sessionId: string;
		role: string;
		content: string;
	};
	txid: string;
	created_at: Date;
}

/** event row -> Durable State change message (deterministic key order). */
export function toStateEvent(row: SessionEventRow) {
	return {
		type: "message",
		key: row.seq,
		value: {
			id: row.seq,
			seq: row.seq,
			sessionId: row.payload.sessionId,
			role: row.payload.role,
			content: row.payload.content,
			actor: row.actor,
		},
		headers: {
			operation: "insert",
			txid: row.txid,
			timestamp: row.created_at.toISOString(),
		},
	};
}

/**
 * Fault injection for the spike's negative controls. The resume test's
 * "feature" is honoring the client's offset on reconnect; these flags remove
 * exactly that feature and the test must go red (duplicates / loss).
 */
export interface SpikeFaults {
	ignoreResumeOffset?: boolean;
	skipOneOnResume?: boolean;
}

export interface DurableStreamsEngineOptions {
	faults?: SpikeFaults;
	/** Catch-up page size (protocol: server-defined chunk size). */
	chunk?: number;
	/** Long-poll window before 204. */
	longPollMs?: number;
	/** SSE connection lifetime before cycling (spec: ~60s). */
	sseMaxMs?: number;
	/** Tail poll interval while waiting. */
	pollIntervalMs?: number;
}

async function runEffect<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
	const exit = await Effect.runPromiseExit(effect);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}

const noContent = (headers: Record<string, string>) =>
	new Response(null, { status: 204, headers });

const notImplemented = () =>
	new Response(
		serialize({
			_tag: "NotImplemented",
			message:
				"Read-path spike: appends flow through the event-log write path (packages/domain); stream deletion is not applicable to derived views.",
		}),
		{ status: 501, headers: { "content-type": "application/json" } },
	);

export class DurableStreamsEngine {
	private readonly faults: SpikeFaults;
	private readonly chunk: number;
	private readonly longPollMs: number;
	private readonly sseMaxMs: number;
	private readonly pollIntervalMs: number;

	constructor(
		private sql: Sql,
		options: DurableStreamsEngineOptions = {},
	) {
		this.faults = options.faults ?? {};
		this.chunk = options.chunk ?? 200;
		this.longPollMs = options.longPollMs ?? 20_000;
		this.sseMaxMs = options.sseMaxMs ?? 60_000;
		this.pollIntervalMs = options.pollIntervalMs ?? 100;
	}

	/**
	 * Effect-wrapped request handler; composes into a stellarc-api runtime.
	 * `self` captures the class instance: inside Effect.gen's generator the
	 * bare `this` is the generator's own (untyped) this, not the engine.
	 */
	handleEffect = Effect.fn("DurableStreams.handle")(
		(org: string, sessionId: string, request: Request) => {
			const self = this;
			return Effect.gen(function* () {
				yield* Effect.annotateCurrentSpan({
					"stellarc.ds.org": org,
					"stellarc.ds.session": sessionId,
					"stellarc.ds.live":
						new URL(request.url).searchParams.get("live") ?? "",
				});
				return yield* Effect.tryPromise({
					try: () => self.dispatch(request, org, sessionId),
					catch: (cause) => cause,
				});
			});
		},
	);

	/** Promise bridge for plain Bun/web handlers (one Effect run, no recursion). */
	route(request: Request, org: string, sessionId: string): Promise<Response> {
		return runEffect(
			this.handleEffect(org, sessionId, request) as Effect.Effect<
				Response,
				unknown
			>,
		);
	}

	private async orgExists(org: string): Promise<boolean> {
		const rows = await this
			.sql`SELECT 1 FROM org_event_counter WHERE org=${org}`;
		return rows.length > 0;
	}

	private async readAfter(
		org: string,
		sessionId: string,
		from: bigint,
	): Promise<SessionEventRow[]> {
		// ORDER BY must qualify the column: the select list's `seq::text`
		// aliases to `seq`, and a bare ORDER BY seq would sort the TEXT alias
		// lexicographically (1, 10, 11, ... 2) — corrupting pagination.
		return this.sql<
			SessionEventRow[]
		>`SELECT seq::text, actor, payload, txid::text, created_at
			FROM event
			WHERE org = ${org}
				AND plugin_type = 'agent.session.message'
				AND payload->>'sessionId' = ${sessionId}
				AND seq > ${from.toString()}
			ORDER BY event.seq
			LIMIT ${this.chunk}`;
	}

	/**
	 * Apply negative-control faults to a *resumed* read (offset supplied).
	 * `ignoreResumeOffset` replays the whole stream in one page (loop-free);
	 * `skipOneOnResume` drops the first row of every resumed page.
	 */
	private async faultedPage(
		org: string,
		sessionId: string,
		from: bigint,
		resumed: boolean,
	): Promise<{ body: string; next: bigint; upToDate: boolean }> {
		if (resumed && this.faults.ignoreResumeOffset) {
			const rows = await this.sql<
				SessionEventRow[]
			>`SELECT seq::text, actor, payload, txid::text, created_at
					FROM event
					WHERE org = ${org}
						AND plugin_type = 'agent.session.message'
						AND payload->>'sessionId' = ${sessionId}
					ORDER BY event.seq`;
			return {
				body: serialize(rows.map(toStateEvent)),
				next: BigInt(rows[rows.length - 1]?.seq ?? 0),
				upToDate: true,
			};
		}
		const effective = resumed && this.faults.skipOneOnResume ? from + 1n : from;
		const rows = await this.readAfter(org, sessionId, effective);
		const next = rows.length > 0 ? BigInt(rows[rows.length - 1].seq) : from;
		return {
			body: serialize(rows.map(toStateEvent)),
			next,
			upToDate: rows.length < this.chunk,
		};
	}

	private async catchUp(
		org: string,
		sessionId: string,
		from: bigint,
		resumed: boolean,
	): Promise<{ body: string; next: bigint; upToDate: boolean }> {
		return this.faultedPage(org, sessionId, from, resumed);
	}

	private readonly baseHeaders = (
		org: string,
		next: bigint,
		upToDate: boolean,
	) => {
		const headers: Record<string, string> = {
			"content-type": "application/json",
			"stream-next-offset": offsetFor(next),
			etag: `spike:${org}:${next}`,
			"cache-control": "no-store",
		};
		if (upToDate) headers["stream-up-to-date"] = "true";
		return headers;
	};

	async get(
		org: string,
		sessionId: string,
		url: URL,
		signal?: AbortSignal,
	): Promise<Response> {
		if (!(await this.orgExists(org)))
			return new Response(null, { status: 404 });

		const live = url.searchParams.get("live");
		if (live !== null && !["long-poll", "sse"].includes(live))
			return new Response(null, { status: 400 });
		const offsetParam = url.searchParams.get("offset");
		if (offsetParam === "") return new Response(null, { status: 400 });
		const from = parseOffset(offsetParam);
		if (from === null) return new Response(null, { status: 400 });
		const resumed = offsetParam !== null && offsetParam !== "-1";
		if (live === "sse")
			return this.getSse(org, sessionId, from, resumed, signal);

		if (live === "long-poll") {
			const deadline = Date.now() + this.longPollMs;
			for (;;) {
				signal?.throwIfAborted();
				const page = await this.catchUp(org, sessionId, from, resumed);
				const headers = this.baseHeaders(org, page.next, page.upToDate);
				headers["stream-cursor"] = crypto.randomUUID();
				// §5.7: any data within the window is returned immediately;
				// 204 only on timeout with no new data.
				if (page.body !== "[]")
					return new Response(page.body, { status: 200, headers });
				if (Date.now() >= deadline) return noContent(headers);
				await sleep(
					Math.min(this.pollIntervalMs, deadline - Date.now()),
					signal,
				);
			}
		}

		const page = await this.catchUp(org, sessionId, from, resumed);
		return new Response(page.body, {
			status: 200,
			headers: this.baseHeaders(org, page.next, page.upToDate),
		});
	}

	private getSse(
		org: string,
		sessionId: string,
		from: bigint,
		resumed: boolean,
		signal?: AbortSignal,
	): Response {
		const encoder = new TextEncoder();
		const started = Date.now();
		const { sseMaxMs, pollIntervalMs } = this;
		let cursor = from;
		let stopped = false;
		let announcedCaughtUp = false;

		const stream = new ReadableStream<Uint8Array>({
			start: async (controller) => {
				const send = (event: string, data: unknown) =>
					controller.enqueue(
						encoder.encode(`event: ${event}\ndata: ${serialize(data)}\n\n`),
					);
				try {
					while (!stopped && !signal?.aborted) {
						const page = await this.catchUp(org, sessionId, cursor, resumed);
						const hasData = page.body !== "[]";
						if (hasData) {
							// §5.8: data event, then a control event after it.
							send("data", JSON.parse(page.body));
							cursor = page.next;
							announcedCaughtUp = false;
							send("control", {
								streamNextOffset: offsetFor(cursor),
								streamCursor: crypto.randomUUID(),
							});
						}
						if (page.upToDate && !announcedCaughtUp) {
							send("control", {
								streamNextOffset: offsetFor(cursor),
								streamCursor: crypto.randomUUID(),
								upToDate: true,
							});
							announcedCaughtUp = true;
						}
						if (Date.now() - started >= sseMaxMs) break;
						await sleep(pollIntervalMs, signal);
					}
				} catch {
					// Aborted mid-read: the client resumes from its last offset.
				} finally {
					try {
						controller.close();
					} catch {}
				}
			},
			cancel: () => {
				stopped = true;
			},
		});

		return new Response(stream, {
			status: 200,
			headers: {
				"content-type": "text/event-stream",
				"cache-control": "no-store",
				"stream-next-offset": offsetFor(from),
			},
		});
	}

	async head(org: string, sessionId: string): Promise<Response> {
		if (!(await this.orgExists(org)))
			return new Response(null, { status: 404 });
		const rows = await this
			.sql`SELECT max(seq)::text AS tail FROM event WHERE org=${org}
				AND plugin_type='agent.session.message' AND payload->>'sessionId'=${sessionId}`;
		const tail = rows[0]?.tail ?? "0";
		return new Response(null, {
			status: 200,
			headers: {
				"content-type": "application/json",
				"stream-next-offset": offsetFor(BigInt(tail)),
				"cache-control": "no-store",
			},
		});
	}

	/** Streams are derived views: PUT is idempotent create-if-org-exists. */
	async put(org: string, contentType: string | null): Promise<Response> {
		if (!(await this.orgExists(org)))
			return new Response(null, { status: 404 });
		if (contentType && !contentType.startsWith("application/json"))
			return new Response(null, { status: 409 });
		const [counter] = await this
			.sql`SELECT seq::text FROM org_event_counter WHERE org=${org}`;
		return new Response(null, {
			status: 200,
			headers: {
				"content-type": "application/json",
				"stream-next-offset": offsetFor(BigInt(counter.seq)),
			},
		});
	}

	/** Method dispatch for one request (inside the Effect span). */
	private async dispatch(
		request: Request,
		org: string,
		sessionId: string,
	): Promise<Response> {
		const url = new URL(request.url);
		switch (request.method) {
			case "GET":
				return this.get(org, sessionId, url, request.signal);
			case "HEAD":
				return this.head(org, sessionId);
			case "PUT":
				return this.put(org, request.headers.get("content-type"));
			case "POST":
			case "DELETE":
				return notImplemented();
			default:
				return new Response(null, { status: 405 });
		}
	}
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (ms <= 0) {
			signal?.throwIfAborted();
			return resolve();
		}
		const timer = setTimeout(finish, ms);
		const abort = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
		};
		function finish() {
			signal?.removeEventListener("abort", abort);
			resolve();
		}
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();
	});
}
