// STL-25: SSE transport for the shape server - frame encoding, negotiation and
// the buffering-signature cadence constants. Byte-compatible with the stock
// @electric-sql/client SSE parser: exactly one JSON message per `data:` frame,
// `: ka` comments on the keep-alive cadence, cycles closed by `up-to-date`.

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
