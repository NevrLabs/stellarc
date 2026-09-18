import { expect, test } from "vitest";
import {
	encodeDataFrame,
	encodeKa,
	negotiateSse,
	runSseStream,
	SSE_CYCLE_MS,
	SSE_KA_INTERVAL_MS,
} from "../../packages/sync/src/sse";

const shapeUrl = (params: Record<string, string>) =>
	new URL(
		`http://test/orgs/o/v1/shape?${new URLSearchParams({
			table: "sync_probe",
			...params,
		})}`,
	);
const accept = "text/event-stream";
const qualifying = {
	live: "true",
	live_sse: "true",
	experimental_live_sse: "true",
	handle: "h",
	offset: "123_0",
};

test("S14/S15 unit: frames_total splits control vs operation via the kind attribute", async () => {
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { ManagedRuntime } = await import("effect");
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		const sse = await import("../../packages/sync/src/sse");
		// Effect metric registries are process-global: snapshot the counter
		// before, then assert the DELTA of this recording (order-independent).
		const readKinds = () => {
			const points = telemetry.metrics
				.getMetrics()
				.flatMap((r) => r.scopeMetrics.flatMap((sc) => sc.metrics))
				.find((m) => m.descriptor.name === "stellarc_shape_sse_frames_total")
			?.dataPoints ?? [];
			return new Map(
				points
					.filter((p) => p.attributes && "kind" in p.attributes)
				.map((p) => [String(p.attributes?.kind), Number(p.value)]),
			);
		};
		await telemetry.reader.forceFlush();
		const before = readKinds();
		// One connection closing after two change frames + two boundary
		// frames (control): the counter must record the split, not one blob.
		await runtime.runPromise(
			sse.recordSseMetrics({
				frames: 4, // total data: frames (control + operation)
				controlFrames: 2,
				fallback: false,
				durationMs: 10,
				close: "cycle",
			}),
		);
		await telemetry.reader.forceFlush();
		const after = readKinds();
		// Spec table: "data: frames emitted, split by control vs operation".
		// This test is deliberately FIRST in the file: Effect's metric registry
		// is process-global, so later SSE tests' recordings would ride the same
		// counter into this exporter and blur exact deltas.
		expect(after.get("control")).toBe(2);
		expect(after.get("operation")).toBe(2);
	} finally {
		await runtime.dispose();
	}
});

test("S01 SSE negotiation serves text/event-stream only for the full qualifying combination", () => {
	expect(negotiateSse(shapeUrl(qualifying), accept)).toBe(true);
	// Missing or non-SSE Accept header never negotiates a stream.
	expect(negotiateSse(shapeUrl(qualifying), "*/*")).toBe(false);
	expect(negotiateSse(shapeUrl(qualifying), null)).toBe(false);
	expect(negotiateSse(shapeUrl(qualifying), undefined)).toBe(false);
	// offset=-1 is the initial snapshot: always a JSON request, never a stream.
	expect(negotiateSse(shapeUrl({ ...qualifying, offset: "-1" }), accept)).toBe(
		false,
	);
	// Missing handle or live_sse=false long-polls.
	expect(negotiateSse(shapeUrl({ ...qualifying, handle: "" }), accept)).toBe(
		false,
	);
	expect(
		negotiateSse(shapeUrl({ ...qualifying, live_sse: "false" }), accept),
	).toBe(false);
	expect(negotiateSse(shapeUrl({ ...qualifying, live: "false" }), accept)).toBe(
		false,
	);
});

test("S02 non-qualifying requests ignore the SSE params and serve JSON semantics", async () => {
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const postgres = (await import("postgres")).default;
	const sql = postgres("postgres://localhost:1/unused", { connect_timeout: 1 });
	try {
		const engine = new ShapeEngine(sql);
		// live_sse=true without live=true: allowlisted, ignored, JSON path.
		// An unknown handle is a 409 must-refetch JSON body - never a 400, never a stream.
		const passive = await engine.shape(
			"org",
			shapeUrl({
				live_sse: "true",
				experimental_live_sse: "true",
				handle: "bogus",
				offset: "5_0",
			}),
		);
		expect(passive.status).toBe(409);
		expect(passive.headers.get("content-type")).toContain("application/json");
		// Full SSE params but no Accept header: long-poll path, still JSON (409 via
		// the bogus handle, proving the engine never entered a stream branch).
		const noAccept = await engine.shape(
			"org",
			shapeUrl({ ...qualifying, handle: "bogus" }),
		);
		expect(noAccept.status).toBe(409);
		expect(noAccept.headers.get("content-type")).toContain("application/json");
	} finally {
		await sql.end();
	}
});

test("S11 allowlist accepts literal live_sse/experimental_live_sse and rejects every other value before SQL (T18 successor)", async () => {
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const postgres = (await import("postgres")).default;
	const sql = postgres("postgres://localhost:1/unused", { connect_timeout: 1 });
	try {
		const engine = new ShapeEngine(sql);
		for (const [name, value] of [
			["live_sse", "1"],
			["live_sse", "false"],
			["experimental_live_sse", "yes"],
			["live_sse", ""],
			["unknown", "true"],
			["where", ""],
		] as const) {
			const url = shapeUrl({ offset: "-1" });
			url.searchParams.set(name, value);
			const response = await engine.shape("org", url);
			expect(response.status, `${name}=${value}`).toBe(400);
		}
		// The exact literals the stock client sends pass the allowlist and the
		// strict-boolean gate, then hit the JSON long-poll semantics (409 on an
		// unknown handle - no SQL, no stream, not a 400).
		const accepted = await engine.shape(
			"org",
			shapeUrl({ ...qualifying, handle: "bogus" }),
		);
		expect(accepted.status).toBe(409);
	} finally {
		await sql.end();
	}
});

test("S03 unit: the frame encoder emits exactly one JSON message per data: frame", () => {
	const change = {
		key: JSON.stringify(["org", "a-1"]),
		value: { org: "org", id: "a-1", value: "v", last_seq: "3" },
		headers: { operation: "update", txids: [42] },
	};
	const control = {
		headers: { control: "up-to-date", global_last_seen_lsn: "7" },
	};
	for (const message of [change, control]) {
		const frame = encodeDataFrame(message);
		const text = new TextDecoder().decode(frame);
		expect(text.startsWith("data: ")).toBe(true);
		expect(text.endsWith("\n\n")).toBe(true);
		expect(text.slice(6, -2)).not.toContain("\n");
		expect(JSON.parse(text.slice(6, -2))).toEqual(message);
	}
	// Two messages must occupy two frames - the stock parser reads one message
	// per `data:` frame and would choke on a concatenated batch.
	const batch = [change, control].map(encodeDataFrame);
	const joined = new TextDecoder().decode(batch[0]).trim();
	expect(joined).not.toContain(JSON.stringify(control.headers));
	expect(new TextDecoder().decode(batch[1])).toBe(
		`data: ${JSON.stringify(control)}\n\n`,
	);
});

test("S10 unit: keep-alive comments use the comment syntax and the mandated cadence", () => {
	expect(new TextDecoder().decode(encodeKa())).toBe(": ka\n\n");
	expect(SSE_KA_INTERVAL_MS).toBe(15000);
	expect(SSE_CYCLE_MS).toBe(20000);
});

test("S10/S07 unit: runSseStream emits ka comments on idle, up-to-date at cycle close, stops on revocation and abort", async () => {
	const chunks: string[] = [];
	const emit = (chunk: Uint8Array) =>
		chunks.push(new TextDecoder().decode(chunk));
	const control = (frame: string) => {
		const message = JSON.parse(frame.slice(6));
		return message.headers?.control as string | undefined;
	};
	// Idle quiet stream: no rows ever, fast ka cadence.
	let authorized = true;
	const quiet = await runSseStream(
		new URL("http://t/shape?offset=5_0"),
		undefined,
		emit,
		{
			page: async () => ({
				messages: [],
				nextCursor: "5_0",
				caughtUp: true,
				schemaHeader: null,
			}),
			authorize: () => authorized,
			kaIntervalMs: 30,
			cycleMs: 150,
		},
	);
	expect(quiet).toMatchObject({ fallback: false });
	const frames = chunks.join("");
	expect(frames).toContain(": ka");
	// Up-to-date close frame carries the position for client offset advance.
	const dataFrames = chunks.filter((c) => c.startsWith("data: "));
	const last = dataFrames.at(-1) ?? "";
	expect(control(last)).toBe("up-to-date");
	expect(JSON.parse(last.slice(6)).headers.global_last_seen_lsn).toBe("5");

	// Revocation mid-stream: stops without the close frame (clean FIN, the
	// reconnect gets the sanitized 401/403 from the standard path).
	chunks.length = 0;
	authorized = false;
	await runSseStream(new URL("http://t/shape?offset=5_0"), undefined, emit, {
		page: async () => ({
			messages: [],
			nextCursor: "5_0",
			caughtUp: true,
			schemaHeader: null,
		}),
		authorize: () => authorized,
		cycleMs: 150,
	});
	expect(chunks.filter((c) => c.startsWith("data:")).length).toBe(0);

	// Client abort: resolves with the truthful disconnect summary (no
	// blanket fallback - this close kind feeds the metrics recorder), no
	// further frames emitted.
	chunks.length = 0;
	const controller = new AbortController();
	const pending = runSseStream(
		new URL("http://t/shape?offset=5_0"),
		controller.signal,
		emit,
		{
			page: () => new Promise(() => {}),
			authorize: () => true,
			kaIntervalMs: 50,
			cycleMs: 10000,
		},
	);
	controller.abort();
	const aborted = await pending;
	expect(aborted).toMatchObject({ close: "disconnect", fallback: true });
	expect(chunks.length).toBe(0);

	// Mid-stream failure: one final must-refetch frame, then a clean close
	// (the client re-requests and hits the sanitized JSON error path).
	chunks.length = 0;
	const failed = await runSseStream(
		new URL("http://t/shape?offset=5_0"),
		undefined,
		emit,
		{
			page: async () => {
				throw new Error("db gone");
			},
			authorize: () => true,
		},
	);
	expect(failed.fallback).toBe(true);
	expect(control(chunks.at(-1) ?? "")).toBe("must-refetch");
});

test("S15 unit: a stream that never reaches up-to-date increments the fallback signature counter", async () => {
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const { ManagedRuntime } = await import("effect");
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	try {
		// A mid-stream failure closes before any up-to-date frame: the
		// buffering signature counter must be observable through OTel.
		const chunks: string[] = [];
		const sse = await import("../../packages/sync/src/sse");
		const summary = await sse
			.runSseStream(
				new URL("http://t/shape?offset=5_0"),
				undefined,
				(c) => chunks.push(new TextDecoder().decode(c)),
				{
					page: async () => {
						throw new Error("buffered proxy closed us");
					},
					authorize: () => true,
				},
			)
			.catch(() => undefined);
		expect(summary).toBeDefined();
		await runtime.runPromise(
			sse.recordSseMetrics(summary as NonNullable<typeof summary>),
		);
		await telemetry.reader.forceFlush();
		const names = telemetry.metrics
			.getMetrics()
			.flatMap((r) =>
				r.scopeMetrics.flatMap((s) => s.metrics.map((m) => m.descriptor.name)),
			);
		expect(names).toContain("stellarc_shape_sse_fallbacks_total");
	} finally {
		await runtime.dispose();
	}
});

test("S03 unit: canonicalShapeKey from the installed stock client excludes live_sse/experimental_live_sse", async () => {
	const { canonicalShapeKey } = await import("@electric-sql/client");
	const base = new URL("http://t/orgs/o/v1/shape?table=sync_probe");
	const withSse = new URL(base);
	withSse.searchParams.set("live_sse", "true");
	withSse.searchParams.set("experimental_live_sse", "true");
	withSse.searchParams.set("live", "true");
	withSse.searchParams.set("handle", "h");
	withSse.searchParams.set("offset", "1_0");
	withSse.searchParams.set("cursor", "c");
	expect(canonicalShapeKey(base)).toBe(canonicalShapeKey(withSse));
});
