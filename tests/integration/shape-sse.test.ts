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
