import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	executeClaimed,
	PlaneClient,
	runNode,
} from "../../apps/stellarc-node/src/main";
import {
	agentsHttp,
	appendMemoryEvents,
	rebuildMemoryProjection,
	staticOperatorAuth,
} from "../../packages/agents/src/index";
import type { TaskDescriptor } from "../../packages/agents/src/protocol";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

const OPERATOR = "test-operator-token";
const FAKE = {
	command: process.execPath,
	args: [join(process.cwd(), "tests/fixtures/fake-acp-agent.ts")],
};
const resources: Array<() => Promise<void>> = [];
beforeEach(() => expect(resources).toHaveLength(0));
afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

async function plane(leaseMs = 60_000) {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const agents = agentsHttp(db.sql, {
		operatorAuth: staticOperatorAuth(OPERATOR),
		leaseMs,
	});
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 45,
		fetch: (r) =>
			agents.matches(r)
				? agents.handler(r)
				: new Response("nope", { status: 404 }),
	});
	resources.push(async () => {
		server.stop(true);
		await agents.dispose();
	});
	const url = server.url.origin;
	const op = async (
		method: string,
		path: string,
		body?: unknown,
		token = OPERATOR,
	) => {
		const res = await fetch(`${url}/orgs/acme/v1/${path}`, {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		return {
			status: res.status,
			// biome-ignore lint/suspicious/noExplicitAny: test JSON
			body: (await res.json().catch(() => null)) as any,
		};
	};
	return { db, url, op, store: agents.store };
}

async function workRoot() {
	const dir = await mkdtemp(join(tmpdir(), "stellarc-node-"));
	resources.push(() => rm(dir, { recursive: true, force: true }));
	return dir;
}

async function registerNodeAndAgent(
	p: Awaited<ReturnType<typeof plane>>,
	harness = "fake",
) {
	const n = await p.op("POST", "nodes", { name: "laptop" });
	expect(n.status).toBe(201);
	const client = new PlaneClient(p.url, n.body.token);
	await client.call("hello", { version: "test", harnesses: [harness] });
	const a = await p.op("POST", "agents", {
		name: "builder",
		nodeId: n.body.node.id,
		harness,
		model: "fake-large",
		instructions: "You are terse.",
		mcpServers: [{ name: "kaneo", command: "kaneo-mcp" }],
	});
	expect(a.status).toBe(201);
	return {
		token: n.body.token as string,
		nodeId: n.body.node.id as string,
		agentId: a.body.id as string,
		client,
	};
}

const claim = async (client: PlaneClient) => {
	const c = await client.call<{ task: TaskDescriptor }>("claim", { waitMs: 0 });
	if (!c) throw new Error("expected a claimable task");
	return c;
};

const waitFor = async <T>(f: () => Promise<T | undefined>, ms = 15000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await f();
		if (v !== undefined) return v;
		if (Date.now() > end) throw new Error("timeout");
		await new Promise((r) => setTimeout(r, 100));
	}
};

test("A1 operator auth: no token 401, wrong token 403, node token cannot act as operator", async () => {
	const p = await plane();
	expect((await p.op("GET", "agents", undefined, "")).status).toBe(401);
	expect((await p.op("GET", "agents", undefined, "wrong")).status).toBe(403);
	const n = await p.op("POST", "nodes", { name: "box" });
	expect((await p.op("GET", "agents", undefined, n.body.token)).status).toBe(
		403,
	);
	const res = await fetch(`${p.url}/v1/node/claim`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${OPERATOR}`,
			"content-type": "application/json",
		},
		body: "{}",
	});
	expect(res.status).toBe(401);
});

test("A2 agent creation requires the node to offer the harness", async () => {
	const p = await plane();
	const n = await p.op("POST", "nodes", { name: "box" });
	const bad = await p.op("POST", "agents", {
		name: "x",
		nodeId: n.body.node.id,
		harness: "fake",
	});
	expect(bad.status).toBe(400);
	expect(bad.body.message).toContain("has not connected");
	await new PlaneClient(p.url, n.body.token).call("hello", {
		version: "t",
		harnesses: ["fake"],
	});
	expect(
		(
			await p.op("POST", "agents", {
				name: "x",
				nodeId: n.body.node.id,
				harness: "fake",
			})
		).status,
	).toBe(201);
	expect(
		(
			await p.op("POST", "agents", {
				name: "x",
				nodeId: n.body.node.id,
				harness: "fake",
			})
		).status,
	).toBe(409);
});

test("A3 end to end: task → node daemon → ACP agent → transcript + completion + event log", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: "tool world",
		subjectRef: "kaneo:KFL-1",
	});
	expect(t.status).toBe(201);
	expect(t.body.status).toBe("queued");
	const controller = new AbortController();
	const node = runNode(
		{
			server: p.url,
			token,
			workRoot: await workRoot(),
			concurrency: 1,
			harnesses: { fake: FAKE },
		},
		{ signal: controller.signal },
	);
	resources.push(async () => {
		controller.abort();
		await node;
	});
	const done = await waitFor(async () => {
		const r = await p.op("GET", `tasks/${t.body.id}`);
		return ["completed", "failed"].includes(r.body.task.status)
			? r.body
			: undefined;
	});
	expect(done.task.status).toBe("completed");
	expect(done.task.stopReason).toBe("end_turn");
	expect(done.task.nativeSessionId).toMatch(/^fake-/);
	const kinds = done.items.map((i: { kind: string }) => i.kind);
	expect(kinds).toEqual([
		"config",
		"message",
		"thinking",
		"tool_call",
		"tool_result",
		"message",
	]);
	const config = done.items[0].body;
	expect(config).toEqual({ model: "fake-large", applied: true });
	const user = done.items[1].body;
	expect(user.role).toBe("user");
	expect(user.content[0].text).toContain("You are terse.");
	expect(done.items[4].body.output).toEqual({ permission: "yes" });
	// Chunks coalesce: one assistant item, not one per chunk.
	expect(done.items[5].body.content[0].text).toBe("Hello, world");
	const events = await p.db.sql<{ plugin_type: string; actor: string }[]>`
    SELECT plugin_type, actor FROM event WHERE org='acme' ORDER BY seq`;
	expect(events.map((e) => e.plugin_type)).toEqual([
		"agents:node-registered",
		"agents:node-hello",
		"agents:agent-created",
		"agents:task-created",
		"agents:node-hello", // the daemon's own hello on connect
		"agents:task-claimed",
		"agents:task-started",
		"agents:task-finished",
	]);
	expect(events[5].actor).toMatch(/^node:node_/);
});

test("A4 agent refusal is agent_error and is NOT retried", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", { agentId, prompt: "refuse" });
	const client = new PlaneClient(p.url, token);
	const claimed = await claim(client);
	const finish = await executeClaimed(
		client,
		{
			server: p.url,
			token,
			workRoot: await workRoot(),
			concurrency: 1,
			harnesses: { fake: FAKE },
		},
		claimed.task,
	);
	expect(finish.failureCode).toBe("agent_error.refusal");
	const r = await p.op("GET", `tasks/${t.body.id}`);
	expect(r.body.task.status).toBe("failed");
	expect(r.body.task.attempt).toBe(1);
});

test("A5 harness crash is a platform fault: requeued, then fails after max attempts", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: "crash",
		maxAttempts: 2,
	});
	const client = new PlaneClient(p.url, token);
	const cfg = {
		server: p.url,
		token,
		workRoot: await workRoot(),
		concurrency: 1,
		harnesses: { fake: FAKE },
	};
	for (const expected of ["queued", "failed"]) {
		const c = await claim(client);
		const f = await executeClaimed(client, cfg, c.task);
		expect(f.failureCode).toBe("platform.harness_exited");
		expect((await p.op("GET", `tasks/${t.body.id}`)).body.task.status).toBe(
			expected,
		);
	}
	expect(await client.call("claim", { waitMs: 0 })).toBeNull();
});

test("A6 operator cancel reaches a hanging agent through the heartbeat", async () => {
	const p = await plane(3000);
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", { agentId, prompt: "hang" });
	const client = new PlaneClient(p.url, token);
	const c = await claim(client);
	const running = executeClaimed(
		client,
		{
			server: p.url,
			token,
			workRoot: await workRoot(),
			concurrency: 1,
			harnesses: { fake: FAKE },
		},
		c.task,
	);
	await waitFor(async () =>
		(await p.op("GET", `tasks/${t.body.id}`)).body.task.status === "running"
			? true
			: undefined,
	);
	expect((await p.op("POST", `tasks/${t.body.id}/cancel`)).status).toBe(200);
	const f = await running;
	expect(f.outcome).toBe("cancelled");
	expect((await p.op("GET", `tasks/${t.body.id}`)).body.task.status).toBe(
		"cancelled",
	);
});

test("A7 lease expiry requeues a task whose node went dark; stale node cannot report", async () => {
	const p = await plane(300);
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", { agentId, prompt: "echo hi" });
	const client = new PlaneClient(p.url, token);
	const first = await claim(client);
	expect(first.task.attempt).toBe(1);
	await new Promise((r) => setTimeout(r, 450));
	const second = await claim(client);
	expect(second.task.id).toBe(t.body.id);
	expect(second.task.attempt).toBe(2);
	await expect(
		client.call(`tasks/${t.body.id}/finish`, {
			attempt: 1,
			outcome: "completed",
		}),
	).rejects.toThrow(/409/);
});

test("A8 tasks only route to the node their agent is bound to", async () => {
	const p = await plane();
	const { agentId } = await registerNodeAndAgent(p);
	const other = await p.op("POST", "nodes", { name: "other" });
	await p.op("POST", "tasks", { agentId, prompt: "echo x" });
	const stranger = new PlaneClient(p.url, other.body.token);
	expect(await stranger.call("claim", { waitMs: 0 })).toBeNull();
	// and the store refuses cross-node reports outright
	const rows = await Effect.runPromise(p.store.listTasks("acme"));
	await expect(
		stranger.call(`tasks/${rows[0].id}/start`, { attempt: 1 }),
	).rejects.toThrow(/409/);
});

// ── memory (NEVR-179) ────────────────────────────────────────────────────────

/** One daemon per test, reused across tasks (each runToCompletion spawn
 * re-claimed slowly and blew the 30s test timeout). */
async function startDaemon(
	p: Awaited<ReturnType<typeof plane>>,
	token: string,
) {
	const controller = new AbortController();
	const node = runNode(
		{
			server: p.url,
			token,
			workRoot: await workRoot(),
			concurrency: 1,
			harnesses: { fake: FAKE },
		},
		{ signal: controller.signal },
	);
	resources.push(async () => {
		controller.abort();
		await node;
	});
	return async (taskId: string) =>
		waitFor(async () => {
			const r = await p.op("GET", `tasks/${taskId}`);
			return ["completed", "failed"].includes(r.body.task.status)
				? r.body
				: undefined;
		});
}

/** First user message item of a completed task = the composed prompt. */
// biome-ignore lint/suspicious/noExplicitAny: test JSON
const composedPrompt = (done: { items: Array<{ kind: string; body: any }> }) =>
	done.items.find((i) => i.kind === "message" && i.body.role === "user")?.body
		.content[0].text as string;

test("M1 memory written by operator is injected into the next run's prompt", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const run = await startDaemon(p, token);
	// Run 1: no memory yet — the prompt is instructions + task prompt only.
	const t1 = await p.op("POST", "tasks", { agentId, prompt: "echo one" });
	const done1 = await run(t1.body.id);
	expect(done1.task.status).toBe("completed");
	expect(composedPrompt(done1)).not.toContain("Agent memory");
	// Operator writes memory; run 2's composed prompt contains the block.
	const w = await p.op("POST", `agents/${agentId}/memory/entries`, {
		kind: "preference",
		content: "The user prefers tabs over spaces",
	});
	expect(w.status).toBe(201);
	const t2 = await p.op("POST", "tasks", { agentId, prompt: "echo two" });
	const done2 = await run(t2.body.id);
	expect(done2.task.status).toBe("completed");
	const text = composedPrompt(done2);
	expect(text).toContain("# Agent memory");
	expect(text).toContain("(preference) The user prefers tabs over spaces");
	// The memory block is prepended ahead of instructions.
	expect(text.indexOf("# Agent memory")).toBeLessThan(
		text.indexOf("You are terse."),
	);
	expect(text.indexOf("You are terse.")).toBeLessThan(text.indexOf("echo two"));
}, 120_000);

test("M2 operator delete is honored: projection loses the entry and the next prompt drops it", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const w = await p.op("POST", `agents/${agentId}/memory/entries`, {
		kind: "fact",
		content: "Project uses bun workspaces",
	});
	expect(w.status).toBe(201);
	const id = w.body.id as string;
	const run = await startDaemon(p, token);
	const t1 = await p.op("POST", "tasks", { agentId, prompt: "echo a" });
	await run(t1.body.id);
	const del = await p.op("DELETE", `agents/${agentId}/memory/entries/${id}`);
	expect(del.status).toBe(200);
	const list = await p.op("GET", `agents/${agentId}/memory`);
	expect(list.status).toBe(200);
	expect(list.body.memory).toHaveLength(0);
	const t2 = await p.op("POST", "tasks", { agentId, prompt: "echo b" });
	const done2 = await run(t2.body.id);
	expect(composedPrompt(done2)).not.toContain("Project uses bun workspaces");
	const events = await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' AND plugin_type LIKE 'agents:memory_%' ORDER BY seq`;
	expect(events.map((e) => e.plugin_type)).toEqual([
		"agents:memory_written",
		"agents:memory_deleted",
	]);
}, 120_000);

test("M3 workspace switch off → zero memory events and no memory block (negative control)", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const w = await p.op("POST", `agents/${agentId}/memory/entries`, {
		kind: "skill",
		content: "Knows the deploy pipeline",
	});
	expect(w.status).toBe(201);
	// Turn the workspace switch off.
	const off = await p.op("PUT", "memory/policy", { memoryEnabled: false });
	expect(off.status).toBe(200);
	expect(off.body.memoryEnabled).toBe(false);
	// Injection is off: the next run's prompt has no memory block.
	const run = await startDaemon(p, token);
	const t1 = await p.op("POST", "tasks", { agentId, prompt: "echo x" });
	const done1 = await run(t1.body.id);
	expect(composedPrompt(done1)).not.toContain("Agent memory");
	// Distill is refused while memory is off.
	const d = await p.op("POST", `agents/${agentId}/memory/distill`, {});
	expect(d.status).toBe(409);
	// Operator write/delete are refused too: the off-switch gates EVERY
	// memory-event append path, not just injection and distill.
	const w2 = await p.op("POST", `agents/${agentId}/memory/entries`, {
		kind: "skill",
		content: "Should be refused",
	});
	expect(w2.status).toBe(409);
	const del = await p.op(
		"DELETE",
		`agents/${agentId}/memory/entries/${w.body.id}`,
	);
	expect(del.status).toBe(409);
	// Exactly the one written event from setup; nothing appended after.
	const events = await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' AND plugin_type LIKE 'agents:memory_%' ORDER BY seq`;
	expect(events).toHaveLength(1);
	expect(events[0].plugin_type).toBe("agents:memory_written");
}, 120_000);

test("M4 distill run over fixture transcripts produces memory_distilled + refined memory_written events", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const run = await startDaemon(p, token);
	// Two completed runs whose transcripts the distill reads.
	for (const prompt of ["echo hello world", "tool again"]) {
		const t = await p.op("POST", "tasks", { agentId, prompt });
		expect((await run(t.body.id)).task.status).toBe("completed");
	}
	const d = await p.op("POST", `agents/${agentId}/memory/distill`, {});
	expect(d.status).toBe(202);
	expect(d.body.taskType).toBe("memory.distill");
	const done = await run(d.body.id);
	expect(done.task.status).toBe("completed");
	// The fixture's grammar lines became memory events; noise did not.
	// biome-ignore lint/suspicious/noExplicitAny: event payload JSON
	const events = await p.db.sql<{ plugin_type: string; payload: any }[]>`
    SELECT plugin_type, payload FROM event WHERE org='acme' AND plugin_type LIKE 'agents:memory_%' ORDER BY seq`;
	const types = events.map((e) => e.plugin_type);
	expect(types).toContain("agents:memory_written");
	expect(types).toContain("agents:memory_distilled");
	const written = events.filter(
		(e) => e.plugin_type === "agents:memory_written",
	);
	expect(
		written.some(
			(e) => e.payload.content === "The user prefers tabs over spaces",
		),
	).toBe(true);
	expect(
		written.some((e) => e.payload.content === "The user likes terse replies"),
	).toBe(true);
	expect(written).toHaveLength(2);
	// The projection carries them as live, listable entries.
	const list = await p.op("GET", `agents/${agentId}/memory`);
	expect(list.body.memory).toHaveLength(2);
	// And a subsequent run injects the distilled artifacts.
	const t2 = await p.op("POST", "tasks", { agentId, prompt: "echo after" });
	const done2 = await run(t2.body.id);
	expect(composedPrompt(done2)).toContain("The user prefers tabs over spaces");
}, 180_000);

test("M5 rebuildMemoryProjection replays the event log into an identical live set", async () => {
	const p = await plane();
	const { agentId } = await registerNodeAndAgent(p);
	const a = await p.op("POST", `agents/${agentId}/memory/entries`, {
		kind: "fact",
		content: "Kept fact",
	});
	const b = await p.op("POST", `agents/${agentId}/memory/entries`, {
		kind: "fact",
		content: "Doomed fact",
	});
	await p.op("DELETE", `agents/${agentId}/memory/entries/${b.body.id}`);
	const before = await p.op("GET", `agents/${agentId}/memory`);
	expect(before.body.memory.map((m: { content: string }) => m.content)).toEqual(
		["Kept fact"],
	);
	// Wipe the projection and replay the log; the view must converge.
	await p.db.sql`DELETE FROM agent_memory WHERE org='acme'`;
	const gone = await p.op("GET", `agents/${agentId}/memory`);
	expect(gone.body.memory).toHaveLength(0);
	await Effect.runPromise(rebuildMemoryProjection(p.db.sql, "acme"));
	const after = await p.op("GET", `agents/${agentId}/memory`);
	expect(after.body.memory.map((m: { content: string }) => m.content)).toEqual([
		"Kept fact",
	]);
	expect(a.status).toBe(201);
	expect(b.status).toBe(201);
});

test("M6 cross-agent isolation: a delete event for another agent cannot soft-delete this agent's entry", async () => {
	const p = await plane();
	const { agentId, nodeId } = await registerNodeAndAgent(p);
	// A second agent principal in the same org.
	const second = await p.op("POST", "agents", {
		name: "other",
		nodeId,
		harness: "fake",
		model: "fake-large",
		instructions: "You are other.",
		mcpServers: [],
	});
	expect(second.status).toBe(201);
	const w = await p.op("POST", `agents/${agentId}/memory/entries`, {
		kind: "fact",
		content: "A's fact",
	});
	expect(w.status).toBe(201);
	// Forge the defect's exact shape at the single writer: a memory_deleted
	// event naming agent B but carrying agent A's entry id. The projection
	// fold must scope the soft-delete by agent principal, so A keeps its entry.
	await p.db.sql.begin((tx) =>
		appendMemoryEvents(tx, "acme", "operator", [
			{
				type: "memory_deleted",
				payload: { id: w.body.id as string, agentId: second.body.id as string },
			},
		]),
	);
	const list = await p.op("GET", `agents/${agentId}/memory`);
	expect(list.body.memory.map((m: { content: string }) => m.content)).toEqual([
		"A's fact",
	]);
	// The legitimate delete (same agent) still works through the same path.
	await p.db.sql.begin((tx) =>
		appendMemoryEvents(tx, "acme", "operator", [
			{
				type: "memory_deleted",
				payload: { id: w.body.id as string, agentId: agentId as string },
			},
		]),
	);
	const emptied = await p.op("GET", `agents/${agentId}/memory`);
	expect(emptied.body.memory).toHaveLength(0);
});

test("M7 DELETE memory route only matches /entries/:id", async () => {
	const p = await plane();
	const { agentId } = await registerNodeAndAgent(p);
	const w = await p.op("POST", `agents/${agentId}/memory/entries`, {
		kind: "fact",
		content: "Route fact",
	});
	expect(w.status).toBe(201);
	// The over-permissive shape: a non-"entries" sub-segment must NOT delete.
	const bad = await p.op("DELETE", `agents/${agentId}/memory/foo/${w.body.id}`);
	expect(bad.status).toBe(404);
	const list = await p.op("GET", `agents/${agentId}/memory`);
	expect(list.body.memory).toHaveLength(1);
	// The real route still deletes.
	const good = await p.op(
		"DELETE",
		`agents/${agentId}/memory/entries/${w.body.id}`,
	);
	expect(good.status).toBe(200);
	const gone = await p.op("GET", `agents/${agentId}/memory`);
	expect(gone.body.memory).toHaveLength(0);
});
