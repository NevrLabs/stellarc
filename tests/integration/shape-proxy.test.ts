import { ShapeStream } from "@electric-sql/client";
import { expect, test } from "vitest";
import { startProxy } from "../helpers/proxy-fixture";
import { startTestServer } from "./test-server";

const resources: Array<() => unknown> = [];
process.on("exit", () => {
	for (const close of resources) close();
});

const isChange = (
	m: unknown,
): m is { key: string; value: Record<string, unknown> } =>
	typeof m === "object" && m !== null && "key" in m;

const unsubscribers: Array<() => void> = [];

test("S08 through a buffering proxy the stock client falls back to long-poll and still converges", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	// Short cycles so buffered SSE connections close < 1s: the stock
	// client's min-connection-duration heuristic (1s, 3 consecutive) sees the
	// buffering signature and permanently falls back to long-poll.
	server.sseTiming = { cycleMs: 400 };
	await server.write("org-a", "a-1", "v1");
	const proxy = startProxy(server.url, { mode: "buffer" });
	resources.push(proxy.close);
	const seen = new Set<string>();
	const stream = new ShapeStream({
		url: `${proxy.url}/orgs/org-a/v1/shape`,
		params: { table: "sync_probe" },
		liveSse: true,
		headers: { authorization: "Bearer org-a" },
	});
	unsubscribers.push(
		stream.subscribe((batch) => {
			for (const message of batch) {
				if (isChange(message))
					seen.add((message.value as { id?: string }).id ?? "");
			}
		}),
	);
	// Snapshot must converge even while the client churns through buffered SSE
	// connections (each delivers its whole body at close, 400ms cadence).
	await expect.poll(() => seen.has("a-1"), { timeout: 15000 }).toBe(true);
	// Keep data flowing through the tail so the fallback long-poll has
	// something to deliver once the streak flips the client state.
	await server.write("org-a", "a-2", "v2");
	await expect.poll(() => seen.has("a-2"), { timeout: 15000 }).toBe(true);
	// The fallback: after the 3-connection short streak, every subsequent
	// live request omits live_sse (only the SSE branch appends it).
	await expect
		.poll(
			() => {
				const list = proxy.requests();
				const lastSse = list
					.map((r) => r.url.includes("live_sse=true"))
					.lastIndexOf(true);
				return (
					lastSse >= 2 &&
					list.slice(lastSse + 1).some((r) => r.url.includes("live=true"))
				);
			},
			{ timeout: 15000 },
		)
		.toBe(true);
	expect(
		proxy.requests().filter((r) => r.url.includes("live_sse=true")).length,
	).toBeGreaterThanOrEqual(3);
});

test("S09 through a flushing proxy SSE is live: change frame arrives <1s, not at cycle close", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	// Long cycle: if the proxy buffered, the frame could only arrive at close
	// (20s) - far past the 1s assertion. The latency oracle is honest. The
	// first idle boundary rides the first keep-alive tick (gated cadence,
	// ADR 0012), so ka is fast too.
	server.sseTiming = { cycleMs: 60000, kaMs: 150 };
	await server.write("org-a", "a-1", "v1");
	const proxy = startProxy(server.url, { mode: "flush" });
	resources.push(proxy.close);
	// Raw SSE through the proxy: first frame (immediate up-to-date), then a
	// write must traverse < 1s.
	const base = `${proxy.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const headers = { authorization: "Bearer org-a" };
	const initial = await fetch(`${base}&offset=-1`, { headers });
	await initial.text();
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	const response = await fetch(
		`${base}&offset=${offset}&handle=${handle}&live=true&live_sse=true&experimental_live_sse=true`,
		{ headers: { ...headers, accept: "text/event-stream" } },
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("text/event-stream");
	const reader = response.body?.getReader();
	if (!reader) throw new Error("SSE response had no body");
	const first = await reader.read();
	expect(first.done).toBe(false); // headers + first frame flushed immediately
	await server.write("org-a", "a-live", "v1");
	const began = Date.now();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (new TextDecoder().decode(value).includes("a-live")) {
			expect(Date.now() - began).toBeLessThan(1000);
			break;
		}
	}
	await reader.cancel().catch(() => undefined);
});

test("S10 a connection closed before its first up-to-date flush is counted as the fallback signature", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	// ka slower than the cycle: an idle-held stream cannot flush its first
	// boundary before the 400ms deadline closes it.
	server.sseTiming = { cycleMs: 400, kaMs: 1000 };
	await server.write("org-a", "a-1", "v1");
	const proxy = startProxy(server.url, { mode: "buffer" });
	resources.push(proxy.close);
	const base = `${proxy.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const headers = {
		authorization: "Bearer org-a",
		accept: "text/event-stream",
	};
	const initial = await fetch(`${base}&offset=-1`, { headers });
	await initial.text();
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	// >=4 short buffered connections. Under the gated cadence (ADR 0012) an
	// idle-held stream first flushes its up-to-date boundary at a keep-alive
	// tick (1000ms) - the 400ms cycle closes every connection pre-flush, so
	// each records the fallback signature server-side.
	for (let i = 0; i < 4; i++) {
		const response = await fetch(
			`${base}&offset=${offset}&handle=${handle}&live=true&live_sse=true&experimental_live_sse=true`,
			{ headers },
		);
		await response.text(); // drains at close - the buffering signature
	}
	await server.telemetry.reader.forceFlush();
	const fallbacks = server.telemetry.metrics
		.getMetrics()
		.flatMap((r) => r.scopeMetrics.flatMap((s) => s.metrics))
		.find((m) => m.descriptor.name === "stellarc_shape_sse_fallbacks_total");
	expect(fallbacks?.dataPoints.at(-1)?.value).toBeGreaterThanOrEqual(4);
	// Every buffered connection closed at its cycle deadline (clean closes,
	// zero disconnects): the fallback counter measures buffering, not
	// client churn (STL-25 D2).
	const closes = server.telemetry.spans
		.getFinishedSpans()
		.filter((span) => span.name === "stellarc.shape.sse")
		.map((span) => span.attributes["stellarc.shape.sse.close"]);
	expect(closes.filter((c) => c === "disconnect").length).toBe(0);
	expect(closes.filter((c) => c === "cycle").length).toBeGreaterThanOrEqual(4);
});
