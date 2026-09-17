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
const sseFramesControl = Metric.counter("stellarc_shape_sse_frames_total", {
	description: "data: frames emitted, control vs operation",
});
const sseFallbacks = Metric.counter("stellarc_shape_sse_fallbacks_total");

/** Close-time summary of one SSE connection, recorded by the owning Effect. */
export interface SseStreamSummary {
	frames: number;
	fallback: boolean;
	durationMs: number;
}

/** Record the close-time metrics in the caller's runtime (ADR 0010). */
export const recordSseMetrics = (
	summary: SseStreamSummary,
): Effect.Effect<void> =>
	Effect.gen(function* () {
		for (let i = 0; i < summary.frames; i++)
			yield* Metric.increment(sseFramesControl);
		if (summary.fallback) yield* Metric.increment(sseFallbacks);
		yield* Metric.update(sseDuration, summary.durationMs / 1000);
	});

export interface SsePageResult {
	/** Messages from one page fetch - change frames plus, when caught up, the
	 * closing `up-to-date` control message. */
	messages: unknown[];
	/** The internal cursor the page advanced to (already issued-token mapped). */
	nextCursor: string;
	/** Whether the page reached the log head (up-to-date was appended). */
	caughtUp: boolean;
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
	let lastEmit = Date.now();
	let sawUpToDate = false;
	let position = url.searchParams.get("offset") ?? "-1";
	let frames = 0;
	let firstPage = true;
	let summary: SseStreamSummary = { frames: 0, fallback: true, durationMs: 0 };
	const start = Date.now();
	try {
		while (Date.now() < deadline) {
			signal?.throwIfAborted();
			if (!options.authorize()) return summary; // revocation: clean close
			const result = await raceAbort(options.page(url), signal);
			for (const message of result.messages) {
				if (
					(message as { headers?: { control?: string } }).headers?.control ===
					"up-to-date"
				)
					continue; // SSE emits its own boundary frames below
				emit(encodeDataFrame(message));
				frames++;
			}
			const hadChanges = result.messages.length > 0;
			position = result.nextCursor;
			// Tail from the advanced position on the next page fetch so writes
			// during the held-open stream are picked up (client tracks position
			// via our up-to-date frames, our pages advance via this).
			url.searchParams.set("offset", result.nextCursor);
			if (hadChanges) {
				// Changes must flush to subscribers now: an up-to-date boundary
				// right behind them (the stock client only publishes on
				// up-to-date frames in SSE mode).
				emit(
					encodeDataFrame({
						headers: {
							control: "up-to-date",
							global_last_seen_lsn: position.split("_")[0] ?? "0",
						},
					}),
				);
				frames++;
				sawUpToDate = true;
			}
			if (firstPage) {
				// The stream opened mid-log (tailing from an issued offset): the
				// first quiet page still owes the client one boundary so its
				// LiveState offset advances off the SSE frame.
				firstPage = false;
				if (!hadChanges) {
					emit(
						encodeDataFrame({
							headers: {
								control: "up-to-date",
								global_last_seen_lsn: position.split("_")[0] ?? "0",
							},
						}),
					);
					frames++;
					sawUpToDate = true;
				}
			}
			// Idle keep-alive: comments at the interval while nothing else flows.
			const idleFor = Date.now() - lastEmit;
			if (idleFor >= kaInterval) {
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
		// Cycle close: final up-to-date frame + clean FIN.
		emit(
			encodeDataFrame({
				headers: {
					control: "up-to-date",
					global_last_seen_lsn: position.split("_")[0] ?? "0",
				},
			}),
		);
		frames++;
	} catch (error) {
		if (signal?.aborted) throw signal.reason ?? error; // client disconnect
		// Mid-stream failure: one final must-refetch frame, then close - the
		// client re-requests and hits the sanitized JSON error path.
		try {
			emit(encodeDataFrame({ headers: { control: "must-refetch" } }));
			frames++;
		} catch {}
		return summary;
	} finally {
		summary = {
			frames,
			fallback: !sawUpToDate,
			durationMs: Date.now() - start,
		};
	}
	return summary;
}
