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
