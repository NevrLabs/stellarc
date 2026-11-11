import { type JsonBatch, stream } from "@durable-streams/client";
import { MaterializedState } from "@durable-streams/state";
import { createStateSchema, createStreamDB } from "@durable-streams/state/db";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import {
	appendSessionEventsRun,
	type SessionMessage,
} from "../../packages/durable-streams-spike/src/append";
import {
	DurableStreamsEngine,
	type SpikeFaults,
} from "../../packages/durable-streams-spike/src/engine";
import { disposablePostgres } from "../helpers/postgres";

interface MessageRow {
	id: string;
	seq: string;
	sessionId: string;
	role: string;
	content: string;
	actor: string;
}

interface ChangeMessage {
	type: string;
	key: string;
	value: MessageRow;
	headers: { operation: "insert"; txid: string; timestamp: string };
}

/** Minimal Standard Schema validator (the state layer only needs round-trip). */
const messageRowSchema: StandardSchemaV1<MessageRow, MessageRow> = {
	"~standard": {
		version: 1,
		vendor: "stellarc.spike",
		validate: (value) => ({ value: value as MessageRow }),
	},
};

const resources: Array<() => Promise<void>> = [];

beforeEach(() => {
	expect(resources).toHaveLength(0);
});

afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

async function startSpike(faults?: SpikeFaults) {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const engine = new DurableStreamsEngine(db.sql, {
		faults,
		chunk: 8,
		longPollMs: 1500,
		sseMaxMs: 3000,
		pollIntervalMs: 50,
	});
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 30,
		fetch: (request) => {
			const match = new URL(request.url).pathname.match(
				/^\/orgs\/([^/]+)\/streams\/sessions\/([^/]+)$/,
			);
			if (!match) return new Response("no such stream", { status: 404 });
			return engine.route(request, match[1], match[2]);
		},
	});
	resources.push(() => Promise.resolve(server.stop(true)));
	const append = (org: string, sessionId: string, messages: SessionMessage[]) =>
		appendSessionEventsRun(db.sql, org, "agent-7", sessionId, messages);
	return {
		sql: db.sql as Sql,
		url: (org: string, sessionId: string) =>
			`${server.url.origin}/orgs/${org}/streams/sessions/${sessionId}`,
		append,
	};
}

const content = (n: number) =>
	`message-${String(n).padStart(2, "0")}-${"x".repeat(40 + (n % 17))}`;

const messages = (count: number, from = 0): SessionMessage[] =>
	Array.from({ length: count }, (_, i) => ({
		role: (["user", "assistant", "tool"] as const)[(from + i) % 3],
		content: content(from + i + 1),
	}));

/**
 * Live subscription handle. The stock client paginates catch-up only in a
 * live mode (live:false yields a single response), so every subscription
 * here runs live and is torn down with its AbortSignal — which is exactly
 * the disconnect this spike must survive.
 */
function watch(
	url: string,
	{
		offset = "-1",
		live = true,
		timeoutMs = 8000,
		stopOnUpToDate = true,
		stopAt,
	}: {
		offset?: string;
		live?: boolean | "sse" | "long-poll";
		timeoutMs?: number;
		/** Drains resolve (and disconnect) at up-to-date; live tails opt out. */
		stopOnUpToDate?: boolean;
		/** Disconnect as soon as this many items have been delivered. */
		stopAt?: number;
	} = {},
) {
	const items: ChangeMessage[] = [];
	let lastOffset = offset;
	const aborter = new AbortController();
	const done = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			aborter.abort();
			reject(new Error(`stream stalled after ${items.length} items`));
		}, timeoutMs);
		const settle = (fn: () => void) => {
			clearTimeout(timer);
			fn();
		};
		void stream<ChangeMessage>({ url, offset, live, signal: aborter.signal })
			.then((res) => {
				let unsubscribe: (() => void) | undefined;
				const poll = stopOnUpToDate
					? setInterval(() => {
							if (res.upToDate) {
								clearInterval(poll);
								unsubscribe?.();
								aborter.abort();
								settle(resolve);
							}
						}, 20)
					: undefined;
				resources.push(async () => {
					clearInterval(poll);
				});
				unsubscribe = res.subscribeJson((batch: JsonBatch<ChangeMessage>) => {
					// Nothing is delivered after a disconnect, so lastOffset always
					// matches the items held.
					if (aborter.signal.aborted) return;
					lastOffset = batch.offset;
					items.push(...batch.items);
					// Any progress re-arms the stall timer.
					clearTimeout(timer);
					timer.refresh();
					// Cut the connection from inside delivery: a timer-based cut
					// races catch-up and can find the whole stream already delivered.
					if (stopAt !== undefined && items.length >= stopAt) {
						clearInterval(poll);
						aborter.abort();
						settle(resolve);
					}
				});
				resources.push(async () => {
					unsubscribe();
					aborter.abort();
				});
			})
			.catch((error) => settle(() => reject(error)));
	});
	// The caller decides whether "done" (drained to up-to-date) or a manual
	// abort mid-stream is the exit; never leave rejections floating.
	done.catch(() => {});
	return {
		items,
		get lastOffset() {
			return lastOffset;
		},
		abort: () => aborter.abort(),
		done,
	};
}

/** Catch-up drain: subscribe live, wait for up-to-date, return what arrived. */
async function drain(url: string, offset?: string) {
	const handle = watch(url, offset === undefined ? {} : { offset });
	await handle.done;
	return { items: handle.items, lastOffset: handle.lastOffset };
}

test("T1 catch-up with disconnect + offset resume is exactly-once", {
	timeout: 90_000,
}, async () => {
	const spike = await startSpike();
	await spike.append("t1", "sess-1", messages(50));
	const url = spike.url("t1", "sess-1");

	// Connect from the start, tear the connection down mid-catch-up (~24/50).
	const first = watch(url, { stopAt: 24 });
	await first.done;
	expect(first.items.length).toBeGreaterThanOrEqual(24);
	expect(first.items.length).toBeLessThan(50);

	// Resume from the last delivered offset and drain to up-to-date.
	const second = await drain(url, first.lastOffset);
	const all = [...first.items, ...second.items];
	const keys = all.map((item) => item.key);

	// Exactly-once: 50 distinct messages, no duplicates, no gaps, in order.
	expect(all).toHaveLength(50);
	expect(new Set(keys).size).toBe(50);
	expect(keys.map(Number)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

	// The typed state layer rebuilds identical state from the same events.
	const state = new MaterializedState();
	for (const item of all) state.apply(item);
	expect(state.getType("message").size).toBe(50);
	expect(state.get("message", "7")).toMatchObject({ content: content(7) });
});

test("T2 live SSE tail survives disconnect + resume with no loss or duplication", {
	timeout: 90_000,
}, async () => {
	const spike = await startSpike();
	await spike.append("t2", "sess-1", messages(10));
	const url = spike.url("t2", "sess-1");

	// Live tail over explicit SSE. The first drain also proves SSE catch-up.
	const live = watch(url, { live: "sse", timeoutMs: 15_000 });
	await live.done; // caught up on the first 10 via SSE data events
	live.abort();

	// Reconnect live and append through the event log while tailing.
	const tail = watch(url, {
		live: "sse",
		offset: live.lastOffset,
		timeoutMs: 15_000,
		stopOnUpToDate: false,
	});
	await spike.append("t2", "sess-1", messages(10, 10));
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`live tail only saw ${tail.items.length}`)),
			8000,
		);
		const poll = setInterval(() => {
			if (tail.items.length >= 8) {
				clearInterval(poll);
				clearTimeout(timer);
				resolve();
			}
		}, 10);
	});
	tail.abort(); // disconnect mid-tail, before the rest arrives

	// A fresh catch-up must cover the whole log exactly once, and everything
	// the live connections saw must sit at its exact log position.
	const whole = await drain(url);
	expect(whole.items).toHaveLength(20);
	expect(new Set(whole.items.map((item) => item.key)).size).toBe(20);
	for (const item of [...live.items, ...tail.items]) {
		expect(whole.items[Number(item.key) - 1]?.key).toBe(item.key);
	}
	expect(whole.items[19].value.content).toBe(content(20));
});

test("T3 StreamDB (state/db) preloads, tails, and settles awaitTxId via headers.txid", {
	timeout: 90_000,
}, async () => {
	const spike = await startSpike();
	const { txid: firstTxid } = await spike.append("t3", "sess-1", messages(10));
	const url = spike.url("t3", "sess-1");

	const stateSchema = createStateSchema({
		messages: {
			schema: messageRowSchema,
			type: "message",
			primaryKey: "id",
		},
	});
	const db = createStreamDB({
		streamOptions: { url, contentType: "application/json" },
		state: stateSchema,
		live: true,
	});
	resources.push(async () => db.close());
	await db.preload();
	expect(db.collections.messages.size).toBe(10);

	// Append through the event log; awaitTxId must settle when the batch
	// carrying this txid in headers.txid flows through the stream.
	const { txid } = await spike.append("t3", "sess-1", messages(5, 10));
	expect(txid).not.toBe(firstTxid);
	await db.utils.awaitTxId(txid, 8000);
	expect(db.collections.messages.size).toBe(15);
	const last = Array.from(db.collections.messages.values()).find(
		(row) => row.seq === "15",
	);
	expect(last?.content).toBe(content(15));
});

test("NC1 negative control: ignoring the resume offset is detected as duplication", {
	timeout: 90_000,
}, async () => {
	const spike = await startSpike({ ignoreResumeOffset: true });
	await spike.append("nc1", "sess-1", messages(50));
	const url = spike.url("nc1", "sess-1");

	const first = watch(url, { stopAt: 24 });
	await first.done;
	const second = await drain(url, first.lastOffset);
	const all = [...first.items, ...second.items];

	// The fault replays the prefix on resume: duplicates appear. T1's
	// exactly-once assertions (length 50, unique keys, ordered 1..50) fail.
	expect(all.length).toBeGreaterThan(50);
	expect(new Set(all.map((item) => item.key)).size).toBe(50);
});

test("NC2 negative control: skipping a row on resume is detected as loss", {
	timeout: 90_000,
}, async () => {
	const spike = await startSpike({ skipOneOnResume: true });
	await spike.append("nc2", "sess-1", messages(50));
	const url = spike.url("nc2", "sess-1");

	const first = watch(url, { stopAt: 24 });
	await first.done;
	const second = await drain(url, first.lastOffset);
	const all = [...first.items, ...second.items];

	// The fault drops the first row after the resume boundary: a gap appears
	// and T1's exactly-once assertions go red.
	expect(all.length).toBeLessThan(50);
	const keys = new Set(all.map((item) => item.key));
	const missing = Array.from({ length: 50 }, (_, i) => String(i + 1)).filter(
		(key) => !keys.has(key),
	);
	expect(missing.length).toBeGreaterThan(0);
});
