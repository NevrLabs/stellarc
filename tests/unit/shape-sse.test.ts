import { expect, test } from "vitest";
import {
	encodeDataFrame,
	encodeKa,
	negotiateSse,
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
