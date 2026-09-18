// STL-25: SSE transport for the shape server - frame encoding, negotiation,
// the buffering-signature cadence constants, and the stream lifetime driver.
// Byte-compatible with the stock @electric-sql/client SSE parser: exactly one
// JSON message per `data:` frame, `: ka` comments on the keep-alive cadence,
// cycles closed by a final `up-to-date` frame (offset advances via
// `global_last_seen_lsn` on that frame - the client's SSE offset source).

import { Effect, Metric, MetricBoundaries } from "effect";

export const SSE_CYCLE_MS = 20000;
export const SSE_KA_INTERVAL_MS = 15000;
const encoder = new TextEncoder();

/** One protocol message as one `data:` frame, flushed as its own chunk. */
export function encodeDataFrame(message: unknown): Uint8Array {
	// JSON.stringify never emits raw newlines, so the frame stays single-line.
	return encoder.encode(`data: ${JSON.stringify(message)}\n\n`);
}

/** Idle keep-alive comment frame (comment syntax - ignored by every parser). */
export function encodeKa(): Uint8Array {
	return encoder.encode(": ka\n\n");
}

/**
 * SSE negotiation (server rule, matching the stock client):
 * serve SSE only when the request carries live=true + handle + offset!=-1 +
 * Accept: text/event-stream + live_sse=true (experimental_live_sse is
 * accepted-and-ignored). Any other combination serves the existing JSON
 * long-poll - the client never sends SSE params before up-to-date, so this
 * cannot diverge live traffic.
 */
export function negotiateSse(
	url: URL,
	accept: string | null | undefined,
): boolean {
	if (accept === null || accept === undefined) return false;
	if (!accept.toLowerCase().includes("text/event-stream")) return false;
	const q = url.searchParams;
	if (q.get("live") !== "true") return false;
	if (q.get("live_sse") !== "true") return false;
	if (!q.get("handle")) return false;
	const offset = q.get("offset");
	if (!offset || offset === "-1") return false;
	return true;
}

const sseDuration = Metric.histogram(
	"stellarc_shape_sse_duration_seconds",
	MetricBoundaries.exponential({ start: 0.01, factor: 2, count: 16 }),
);
const sseFrameCounter = Metric.counter("stellarc_shape_sse_frames_total", {
	description: "data: frames emitted",
});
const sseFramesControl = sseFrameCounter.pipe(Metric.tagged("kind", "control"));
const sseFramesOperation = sseFrameCounter.pipe(
	Metric.tagged("kind", "operation"),
);
const sseFallbacks = Metric.counter("stellarc_shape_sse_fallbacks_total");

export type SseCloseKind = "cycle" | "disconnect" | "revocation" | "error";

/** Close-time summary of one SSE connection, recorded by the owning Effect. */
export interface SseStreamSummary {
	/** data: frames emitted (control + operation). */
	frames: number;
	/** data: frames carrying a control message (up-to-date, must-refetch). */
	controlFrames: number;
	fallback: boolean;
	durationMs: number;
	close: SseCloseKind;
}

/** Record the close-time metrics in the caller's runtime (ADR 0010). The
 * frames counter splits control vs operation via the `kind` attribute
 * (spec §2: "data: frames emitted, split by control vs operation"). */
export const recordSseMetrics = (
	summary: SseStreamSummary,
): Effect.Effect<void> =>
	Effect.gen(function* () {
		const operations = Math.max(0, summary.frames - summary.controlFrames);
		for (let i = 0; i < summary.controlFrames; i++)
			yield* Metric.increment(sseFramesControl);
		for (let i = 0; i < operations; i++)
			yield* Metric.increment(sseFramesOperation);
		if (summary.fallback) yield* Metric.increment(sseFallbacks);
		yield* Metric.update(sseDuration, summary.durationMs / 1000);
	});

export interface SsePageResult {
	/** Messages from one page fetch - change frames plus, when caught up, the
	 * closing `up-to-date` control message. */
	messages: unknown[];
	/** The internal cursor the page advanced to (already issued-token mapped). */
	nextCursor: string;
	/** Response headers the stream must mirror (electric-schema etc). */
	schemaHeader: string | null;
}

export interface SseStreamOptions {
	/** Fetch one page from the log; must throw on abort. */
	page(url: URL): Promise<SsePageResult>;
	/** Re-authorize the held-open stream; false closes it (revocation). */
	authorize(): boolean;
	/** Test hook: keep-alive interval override (defaults to SSE_KA_INTERVAL_MS). */
	kaIntervalMs?: number;
	/** Test hook: cycle deadline override (defaults to SSE_CYCLE_MS). */
	cycleMs?: number;
}

/** Race a promise against the abort signal so a stuck page still yields to a
 * client disconnect. */
function raceAbort<T>(
	promise: Promise<T>,
	signal: AbortSignal | undefined,
): Promise<T> {
	if (!signal) return promise;
	return new Promise<T>((resolve, reject) => {
		const abort = () =>
			reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) return abort();
		promise.then(
			(value) => {
				signal.removeEventListener("abort", abort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

/**
 * Drive one held-open SSE connection: emit page messages as they arrive,
 * `: ka` comments while idle, close at the 20s cycle deadline with a final
 * up-to-date frame carrying the last position. Returns a close summary for
 * metric recording when the stream ended (cycle close, revocation, or
 * mid-stream page failure - the latter surfaces a final must-refetch frame);
 * a client abort rethrows the abort reason.
 */
export async function runSseStream(
	url: URL,
	signal: AbortSignal | undefined,
	emit: (chunk: Uint8Array) => void,
	options: SseStreamOptions,
): Promise<SseStreamSummary> {
	const kaInterval = options.kaIntervalMs ?? SSE_KA_INTERVAL_MS;
	const deadline = Date.now() + (options.cycleMs ?? SSE_CYCLE_MS);
	const openedAt = Date.now();
	let lastEmit = Date.now();
	// Fallback signature (review-6 option (b), spec §2): the connection
	// closed before the first up-to-date frame was FLUSHED. Boundary frames
	// emitted by this loop are the only up-to-date frames an SSE client ever
	// sees (page control messages are filtered out), so sawUpToDate tracks
	// exactly "an up-to-date flush left the server on this connection". A
	// buffering proxy that only releases bodies at close makes every
	// connection die pre-flush -> fallback; an ordinary client disconnect
	// after any flush is NOT a fallback (recorded with its own close kind).
	let sawUpToDate = false;
	let position = url.searchParams.get("offset") ?? "-1";
	let frames = 0;
	let controlFrames = 0;
	// The client's LiveState offset advances off our first up-to-date frame;
	// on a caught-up log that boundary is deferred to the first keep-alive
	// tick so it (and the ka comments) only traverse proxies that stream.
	let oweBoundary = true;
	let close: SseCloseKind = "cycle";
	const summary = (): SseStreamSummary => ({
		frames,
		controlFrames,
		fallback: !sawUpToDate,
		durationMs: Date.now() - openedAt,
		close,
	});
	const boundary = () =>
		encodeDataFrame({
			headers: {
				control: "up-to-date",
				global_last_seen_lsn: position.split("_")[0] ?? "0",
			},
		});
	try {
		while (Date.now() < deadline) {
			signal?.throwIfAborted();
			if (!options.authorize()) {
				// Revocation: clean close - the reconnect gets 401/403 from
				// the standard path (re-authorized here each cycle AND each
				// keep-alive tick).
				close = "revocation";
				return summary();
			}
			const result = await raceAbort(options.page(url), signal);
			let emitted = false;
			for (const message of result.messages) {
				if (
					(message as { headers?: { control?: string } }).headers?.control ===
					"up-to-date"
				)
					continue; // SSE emits its own boundary frames below
				emit(encodeDataFrame(message));
				frames++;
				emitted = true;
			}
			const hadChanges = result.messages.length > 0;
			position = result.nextCursor;
			// Tail from the advanced position on the next page fetch so writes
			// during the held-open stream are picked up (client tracks position
			// via our up-to-date frames, our pages advance via this).
			url.searchParams.set("offset", result.nextCursor);
			if (hadChanges) {
				// Changes must flush to subscribers now: an up-to-date
				// boundary right behind them (the stock client only publishes
				// on up-to-date frames in SSE mode).
				emit(boundary());
				frames++;
				controlFrames++;
				sawUpToDate = true;
				oweBoundary = false;
				emitted = true;
			} else if (oweBoundary && Date.now() - openedAt >= kaInterval) {
				// Idle-held from open (tailing a caught-up log): the first
				// boundary leaves with the first keep-alive tick - a proxy
				// that buffers it closed this connection pre-flush, which is
				// exactly the fallback signature above.
				emit(boundary());
				frames++;
				controlFrames++;
				sawUpToDate = true;
				oweBoundary = false;
				emitted = true;
			}
			if (emitted) lastEmit = Date.now();
			// Idle keep-alive: comments at the interval while nothing else
			// flows; every tick re-authorizes the held-open stream (spec §3).
			const idleFor = Date.now() - lastEmit;
			if (idleFor >= kaInterval) {
				if (!options.authorize()) {
					close = "revocation";
					return summary();
				}
				emit(encodeKa());
				lastEmit = Date.now();
				continue;
			}
			const until = Math.min(
				deadline,
				Date.now() + Math.max(1, Math.min(100, kaInterval)),
			);
			await new Promise<void>((resolve, reject) => {
				const finish = () => {
					signal?.removeEventListener("abort", abort);
					resolve();
				};
				const timer = setTimeout(finish, Math.max(1, until - Date.now()));
				const abort = () => {
					clearTimeout(timer);
					signal?.removeEventListener("abort", abort);
					reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
				};
				signal?.addEventListener("abort", abort, { once: true });
				if (signal?.aborted) abort();
			});
		}
		// Cycle close: final up-to-date frame + clean FIN. It still owes the
		// client nothing new (sawUpToDate already true when a boundary left),
		// but the deadline close always emits the position-carrying frame so
		// the reconnect continues from the issued offset.
		emit(boundary());
		frames++;
		controlFrames++;
		return summary();
	} catch {
		if (signal?.aborted) {
			// Client disconnect: return a truthful summary (fallback iff no
			// up-to-date frame was flushed before the close) - never a
			// blanket fallback, never a rethrow past the metrics recorder.
			close = "disconnect";
			return summary();
		}
		// Mid-stream failure: one final must-refetch frame, then close - the
		// client re-requests and hits the sanitized JSON error path.
		try {
			emit(encodeDataFrame({ headers: { control: "must-refetch" } }));
			frames++;
			controlFrames++;
		} catch {}
		close = "error";
		return summary();
	}
}
