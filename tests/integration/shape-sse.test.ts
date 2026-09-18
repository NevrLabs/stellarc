import { ShapeStream } from "@electric-sql/client";
import { expect, test } from "vitest";
import { startTestServer } from "./test-server";

const resources: Array<() => unknown> = [];
process.on("exit", () => {
	for (const close of resources) close();
});

const isChange = (
	m: unknown,
): m is {
	key: string;
	value: Record<string, unknown>;
	headers: Record<string, unknown>;
} => typeof m === "object" && m !== null && "key" in m;
const isUpToDate = (m: unknown): m is { headers: { control: string } } =>
	typeof m === "object" &&
	m !== null &&
	"headers" in m &&
	(m as { headers: { control?: string } }).headers?.control === "up-to-date";

/** Collect messages from a stock ShapeStream; flushes happen at up-to-date. */
class Collector {
	private messages: unknown[] = [];
	private waiters: Array<{ when: (m: unknown[]) => boolean; go: () => void }> =
		[];
	constructor(stream: ShapeStream) {
		stream.subscribe((batch) => {
			this.messages.push(...batch);
			for (const w of this.waiters.splice(0)) if (w.when(this.messages)) w.go();
		});
	}
	async until(
		when: (m: unknown[]) => boolean,
		timeoutMs = 30000,
	): Promise<unknown[]> {
		if (when(this.messages)) return this.messages;
		await Promise.race([
			new Promise<void>((resolve) => {
				this.waiters.push({ when, go: resolve });
			}),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error("stream wait timed out")), timeoutMs),
			),
		]);
		return this.messages;
	}
	all() {
		return this.messages;
	}
}

const latest = (messages: unknown[], id: string) =>
	messages.filter((m) => isChange(m) && m.key.includes(`"a-${id}"`)).at(-1) as
		| {
				key: string;
				value: Record<string, unknown>;
				headers: Record<string, unknown>;
		  }
		| undefined;

test("S03 stock client liveSse:true round-trip: JSON snapshot then SSE tail; canonicalShapeKey unaffected", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "a-1", "v1");
	const stream = new ShapeStream({
		url: `${server.url}/orgs/org-a/v1/shape`,
		params: { table: "sync_probe" },
		liveSse: true,
		headers: { authorization: "Bearer org-a" },
	});
	const collector = new Collector(stream);
	try {
		// Snapshot over JSON, then the SSE tail delivers the mutation.
		await collector.until(
			(m) => latest(m, "1") !== undefined && m.some(isUpToDate),
		);
		await server.write("org-a", "a-1", "v2");
		const messages = await collector.until(
			(m) => (latest(m, "1")?.value as { value?: string })?.value === "v2",
		);
		const change = latest(messages, "1");
		expect(change?.headers.txids).toBeDefined();
		// canonicalShapeKey: the new params are excluded client-side (spec S03).
		const { canonicalShapeKey } = await import("@electric-sql/client");
		const base = new URL("http://t/orgs/o/v1/shape?table=sync_probe");
		const withSse = new URL(base);
		for (const [k, v] of [
			["live_sse", "true"],
			["experimental_live_sse", "true"],
			["live", "true"],
			["handle", "h"],
			["offset", "1_0"],
			["cursor", "c"],
		] as const)
			withSse.searchParams.set(k, v);
		expect(canonicalShapeKey(base)).toBe(canonicalShapeKey(withSse));
	} finally {
		stream.unsubscribeAll();
	}
});

test("S01 raw qualifying request negotiates 200 text/event-stream with immediate flush", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "a-1", "v1");
	// Short cycle: the assert needs a clean cycle close, not the production
	// 20s cadence (the default flaked a 30s budget under loaded CI runners).
	server.sseTiming = { cycleMs: 1500 };
	const base = `${server.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const headers = {
		authorization: "Bearer org-a",
		accept: "text/event-stream",
	};
	const initial = await fetch(`${base}&offset=-1`, { headers });
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	const response = await fetch(
		`${base}&offset=${offset}&handle=${handle}&live=true&live_sse=true&experimental_live_sse=true`,
		{ headers },
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("text/event-stream");
	expect(response.headers.get("electric-handle")).toBe(handle);
	expect(response.headers.get("electric-offset")).toBeTruthy();
	expect(response.headers.get("electric-cursor")).toBeTruthy();
	expect(response.headers.get("cache-control")).toBe("no-store");
	expect(response.headers.get("x-accel-buffering")).toBe("no");
	// The cycle-close up-to-date frame arrives as its own flushed chunk.
	const body = await response.text();
	expect(body).toContain("data: ");
	expect(JSON.parse(body.slice(body.lastIndexOf("data: ") + 6))).toMatchObject({
		headers: { control: "up-to-date" },
	});
});

test("S02 non-qualifying requests serve the JSON long-poll byte-compatibly", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "a-1", "v1");
	const base = `${server.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const headers = { authorization: "Bearer org-a" };
	const initial = await fetch(`${base}&offset=-1`, { headers });
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	// live_sse params present but no Accept header: plain long-poll. A write
	// wakes it with the JSON change body (never a stream) - deterministic,
	// no 20s wait.
	const held = fetch(
		`${base}&offset=${offset}&handle=${handle}&live=true&live_sse=true&experimental_live_sse=true`,
		{ headers },
	);
	await new Promise((r) => setTimeout(r, 200));
	await server.write("org-a", "a-1", "wake");
	const response = await held;
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toContain("application/json");
	const body = (await response.json()) as Array<{
		headers: { control?: string; operation?: string };
	}>;
	expect(body.at(-1)?.headers.control).toBe("up-to-date");
	expect(body.some((m) => m.headers.operation)).toBe(true);
	// Offset=-1 never streams even with full SSE params + Accept: the engine
	// 400s live=true without a handle (existing long-poll contract, spec §3
	// "missing handle ... serves the existing JSON long-poll" = the 400 guard).
	const snapshot = await fetch(
		`${base}&offset=-1&live_sse=true&experimental_live_sse=true&live=true`,
		{ headers: { ...headers, accept: "text/event-stream" } },
	);
	expect(snapshot.status).toBe(400);
	expect(snapshot.headers.get("content-type") ?? "").not.toBe(
		"text/event-stream",
	);
});

test("S04 exactly-once across ≥3 SSE cycles: no dup, no loss", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "a-1", "v1");
	const stream = new ShapeStream({
		url: `${server.url}/orgs/org-a/v1/shape`,
		params: { table: "sync_probe" },
		liveSse: true,
		headers: { authorization: "Bearer org-a" },
	});
	const collector = new Collector(stream);
	try {
		await collector.until(
			(m) => latest(m, "1") !== undefined && m.some(isUpToDate),
		);
		for (let cycle = 0; cycle < 3; cycle++) {
			await server.write("org-a", `a-${cycle + 2}`, `v${cycle + 2}`);
			await collector.until(
				(messages) => latest(messages, `${cycle + 2}`) !== undefined,
			);
		}
		const ids = collector
			.all()
			.filter(isChange)
			.map((m) => (m.value as { id: string }).id);
		expect(new Set(ids).size).toBe(ids.length); // exactly-once
		expect([...new Set(ids)].sort()).toEqual(["a-1", "a-2", "a-3", "a-4"]);
	} finally {
		stream.unsubscribeAll();
	}
});

const metricPoints = (
	server: Awaited<ReturnType<typeof startTestServer>>,
	name: string,
) =>
	server.telemetry.metrics
		.getMetrics()
		.flatMap((resource) =>
			resource.scopeMetrics.flatMap((scope) => scope.metrics),
		)
		.find((metric) => metric.descriptor.name === name)?.dataPoints ?? [];

const gaugeValue = (server: Awaited<ReturnType<typeof startTestServer>>) => {
	// InMemory CUMULATIVE exporter keeps one collection record per flush; the
	// live reading is the NEWEST record's datapoint.
	const records = server.telemetry.metrics
		.getMetrics()
		.flatMap((resource) =>
			resource.scopeMetrics.flatMap((scope) => scope.metrics),
		)
		.filter(
			(metric) => metric.descriptor.name === "stellarc_shape_live_connections",
		);
	return records.at(-1)?.dataPoints.at(-1)?.value;
};

const sseSpans = (server: Awaited<ReturnType<typeof startTestServer>>) =>
	server.telemetry.spans
		.getFinishedSpans()
		.filter((span) => span.name === "stellarc.shape.sse");

/** Open a qualifying SSE stream and read the first flushed frame. */
async function openSse(
	server: Awaited<ReturnType<typeof startTestServer>>,
	org: string,
	signal?: AbortSignal,
) {
	const base = `${server.url}/orgs/${org}/v1/shape?table=sync_probe`;
	const headers = { authorization: `Bearer ${org}` };
	const initial = await fetch(`${base}&offset=-1`, { headers });
	await initial.text();
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	const response = await fetch(
		`${base}&offset=${offset}&handle=${handle}&live=true&live_sse=true&experimental_live_sse=true`,
		{
			headers: { ...headers, accept: "text/event-stream" },
			signal,
		},
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("text/event-stream");
	const reader = response.body?.getReader();
	if (!reader) throw new Error("SSE response had no body");
	const first = await reader.read();
	expect(first.done).toBe(false);
	return { response, reader };
}

test("S06 client disconnect aborts the held stream: gauge released, SQL tail stops, sse span ends with disconnect", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "a-1", "v1");
	const controller = new AbortController();
	const { reader } = await openSse(server, "org-a", controller.signal);
	const tails = () =>
		server.telemetry.spans
			.getFinishedSpans()
			.filter((span) => span.name === "stellarc.shape.tail").length;
	await expect.poll(tails).toBeGreaterThan(0);
	await server.telemetry.reader.forceFlush();
	// Exactly one live connection while held (S15 counts it once).
	expect(gaugeValue(server)).toBe(1);
	controller.abort();
	await reader.cancel().catch(() => undefined);
	// The disconnect propagates: the per-connection span closes with the
	// disconnect kind (default 20s cycle could not have elapsed).
	await expect
		.poll(() =>
			sseSpans(server).some(
				(span) => span.attributes["stellarc.shape.sse.close"] === "disconnect",
			),
		)
		.toBe(true);
	const stoppedAt = tails();
	await new Promise((resolve) => setTimeout(resolve, 400));
	expect(tails()).toBe(stoppedAt); // SQL tail polling stopped
	await server.telemetry.reader.forceFlush();
	expect(gaugeValue(server)).toBe(0); // gauge back to baseline
});

test("S15 gauge counts SSE exactly once across frames; duration recorded at cycle close", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	// Short cadence so one full cycle fits inside the test budget.
	server.sseTiming = { cycleMs: 1500, kaMs: 400 };
	await server.write("org-a", "a-1", "v1");
	const { reader } = await openSse(server, "org-a");
	const received: string[] = [];
	const readLoop = (async () => {
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				received.push(new TextDecoder().decode(value));
			}
		} catch {
			// stream closed
		}
	})();
	await server.write("org-a", "a-2", "v2");
	await server.write("org-a", "a-3", "v3");
	await expect.poll(() => received.join("").includes('"a-3"')).toBe(true);
	// Frames flowed on ONE held connection: the gauge must still read 1 —
	// a per-frame re-register inflates it (negative control).
	await server.telemetry.reader.forceFlush();
	expect(gaugeValue(server)).toBe(1);
	await readLoop; // cycle close ends the stream cleanly
	await server.telemetry.reader.forceFlush();
	expect(gaugeValue(server)).toBe(0);
	expect(
		metricPoints(server, "stellarc_shape_sse_duration_seconds").length,
	).toBeGreaterThan(0);
	const closed = sseSpans(server).find(
		(span) => span.attributes["stellarc.shape.sse.close"] === "cycle",
	);
	expect(closed).toBeDefined();
	expect(closed?.attributes["stellarc.shape.table"]).toBe("sync_probe");
	expect(closed?.attributes["stellarc.org"]).toBe("org-a");
	expect(typeof closed?.attributes["stellarc.shape.events_sent"]).toBe(
		"number",
	);
	// The per-connection span shares the request trace with its page spans.
	const tail = server.telemetry.spans
		.getFinishedSpans()
		.find((span) => span.name === "stellarc.shape.tail");
	expect(closed?.spanContext().traceId).toBe(tail?.spanContext().traceId);
});

test("S05 awaitTxId settles over SSE: mutation during subscription delivers headers.txids", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "a-1", "v1");
	const stream = new ShapeStream({
		url: `${server.url}/orgs/org-a/v1/shape`,
		params: { table: "sync_probe" },
		liveSse: true,
		headers: { authorization: "Bearer org-a" },
	});
	const collector = new Collector(stream);
	try {
		await collector.until(
			(m) => latest(m, "1") !== undefined && m.some(isUpToDate),
		);
		// Mutate DURING the held-open subscription: the change frame must carry
		// the mutation's txid or awaitTxId stalls (documented failure mode).
		const mutation = await server.write("org-a", "a-2", "v2");
		const messages = await collector.until((m) => latest(m, "2") !== undefined);
		const change = latest(messages, "2");
		expect(change?.headers.txids).toEqual([mutation.txid]);
	} finally {
		stream.unsubscribeAll();
	}
});

test("S07 revocation closes the stream within the cycle/ka interval; reconnect gets sanitized 401/403", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	server.sseTiming = { cycleMs: 60000, kaMs: 300 }; // long cycle, fast ka
	await server.write("org-a", "a-1", "v1");
	const { reader } = await openSse(server, "org-a");
	const received: string[] = [];
	const readLoop = (async () => {
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				received.push(new TextDecoder().decode(value));
			}
		} catch {}
	})();
	// Sanity: frames flow, then revoke mid-stream.
	await expect.poll(() => received.length > 0, { timeout: 10000 }).toBe(true);
	server.revokeAll = true;
	// Stream must close ≤ ka interval (300ms) + slack, not wait the 60s cycle.
	const closedAt = Date.now();
	await readLoop;
	expect(Date.now() - closedAt).toBeLessThanOrEqual(4000);
	// The reconnect hits the sanitized JSON error path (401: token now denied).
	const base = `${server.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const headers = {
		authorization: "Bearer org-a",
		accept: "text/event-stream",
	};
	const initial = await fetch(`${base}&offset=-1`, { headers });
	expect([401, 403]).toContain(initial.status);
	expect(initial.headers.get("content-type")).toContain("application/json");
	const body = (await initial.json()) as { _tag: string };
	expect(["Unauthenticated", "Forbidden"]).toContain(body._tag);
	await server.telemetry.reader.forceFlush();
	const closes = sseSpans(server)
		.map((span) => span.attributes["stellarc.shape.sse.close"])
		.filter((k) => k === "revocation");
	expect(closes.length).toBeGreaterThan(0);
});

test("S01 pre-stream conflict: qualifying SSE with an expired handle answers 409 must-refetch JSON, never a stream", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "a-1", "v1");
	const base = `${server.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const headers = {
		authorization: "Bearer org-a",
		accept: "text/event-stream",
	};
	// Full qualifying combination but a handle the engine never issued: the
	// pre-stream page answers the sanitized 409 must-refetch JSON contract -
	// status, body, and content-type must never become a stream (spec §3).
	const response = await fetch(
		`${base}&offset=5_0&handle=bogus-handle&live=true&live_sse=true&experimental_live_sse=true`,
		{ headers },
	);
	expect(response.status).toBe(409);
	expect(response.headers.get("content-type")).toContain("application/json");
	const body = (await response.json()) as Array<{
		headers: { control?: string };
	}>;
	expect(body.at(-1)?.headers.control).toBe("must-refetch");
});
