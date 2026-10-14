import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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

/** Bare git repo the fake agent clones and pushes to (NEVR-199). */
async function bareRepo() {
	const dir = await mkdtemp(join(tmpdir(), "stellarc-remote-"));
	resources.push(() => rm(dir, { recursive: true, force: true }));
	const bare = join(dir, "origin.git");
	await mkdir(bare, { recursive: true });
	execFileSync("git", ["init", "--quiet", "--bare", "-b", "main", bare]);
	return { dir, bare };
}

/** Run the next claimed task end-to-end through the node seam. */
async function runOne(p: Awaited<ReturnType<typeof plane>>, token: string) {
	const client = new PlaneClient(p.url, token);
	const c = await claim(client);
	return executeClaimed(
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
}

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

// ── run budgets (NEVR-178) ──────────────────────────────────────────────────

test("B1 budget exhaustion parks the task (no attempt burn) and the window reset resumes it", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	// The fake "spend" run reports exactly 1500 total tokens at finish.
	const b = await p.op("POST", "budgets", {
		scope: "agent",
		agentId,
		window: "daily",
		ceilingTokens: 1500,
	});
	expect(b.status).toBe(201);
	expect(b.body.ceilingTokens).toBe(1500);

	// First run fits inside the ceiling and completes normally.
	const first = await p.op("POST", "tasks", { agentId, prompt: "spend" });
	const client = new PlaneClient(p.url, token);
	const c1 = await claim(client);
	expect(c1.task.id).toBe(first.body.id);
	const done1 = await executeClaimed(
		client,
		{
			server: p.url,
			token,
			workRoot: await workRoot(),
			concurrency: 1,
			harnesses: { fake: FAKE },
		},
		c1.task,
	);
	expect(done1.outcome).toBe("completed");
	expect((await p.op("GET", `tasks/${first.body.id}`)).body.task.status).toBe(
		"completed",
	);

	// The next task parks: 1500 consumed >= 1500 ceiling, daily window.
	const second = await p.op("POST", "tasks", { agentId, prompt: "echo hi" });
	expect(await client.call("claim", { waitMs: 0 })).toBeNull();
	const parked = (await p.op("GET", `tasks/${second.body.id}`)).body;
	expect(parked.task.status).toBe("budget_exhausted");
	expect(parked.task.attempt).toBe(0); // no attempt burn
	expect(parked.task.failureCode).toBeNull(); // parked, not failed
	expect(parked.task.parked).toMatchObject({
		budgetId: b.body.id,
		window: "daily",
		consumedTokens: 1500,
		ceilingTokens: 1500,
	});
	expect(typeof parked.task.parked.resetAt).toBe("string");
	const events = await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' ORDER BY seq`;
	expect(events.map((e) => e.plugin_type)).toContain("agents:task_parked");

	// Window reset: backdate the usage out of the current window (same state a
	// rolled-over daily window produces), then the claim loop resumes the task.
	await p.db
		.sql`UPDATE agent_task_usage SET occurred_at = now() - interval '2 days'`;
	const c2 = await claim(client);
	expect(c2.task.id).toBe(second.body.id); // same task, not a new one
	expect(c2.task.attempt).toBe(1); // first attempt ever → nothing was burned
	const done2 = await executeClaimed(
		client,
		{
			server: p.url,
			token,
			workRoot: await workRoot(),
			concurrency: 1,
			harnesses: { fake: FAKE },
		},
		c2.task,
	);
	expect(done2.outcome).toBe("completed");
	expect((await p.op("GET", `tasks/${second.body.id}`)).body.task.status).toBe(
		"completed",
	);
});

test("B2 usage lands as a typed record + agents:usage_recorded event with txid; a raise resumes the parked task", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const b = await p.op("POST", "budgets", {
		scope: "agent",
		agentId,
		window: "daily",
		ceilingTokens: 1000, // below one "spend" run (1500)
	});
	expect(b.status).toBe(201);
	const client = new PlaneClient(p.url, token);
	const cfg = {
		server: p.url,
		token,
		workRoot: await workRoot(),
		concurrency: 1,
		harnesses: { fake: FAKE },
	};
	const t = await p.op("POST", "tasks", { agentId, prompt: "spend" });
	const c = await claim(client);
	await executeClaimed(client, cfg, c.task);

	// Typed usage row: token totals from PromptResponse.usage, cost/context from
	// the mid-run usage_update, merged into one record.
	const [usage] = (await p.db.sql`
    SELECT tokens_total::text AS tokens_total, tokens_in::text AS tokens_in, tokens_out::text AS tokens_out,
      thought_tokens::text AS thought_tokens, cached_read_tokens::text AS cached_read_tokens,
      context_tokens::text AS context_tokens, cost_amount::text AS cost_amount, cost_currency
    FROM agent_task_usage WHERE task_id=${t.body.id} AND attempt=1`) as {
		tokens_total: string;
		tokens_in: string;
		tokens_out: string;
		thought_tokens: string;
		cached_read_tokens: string;
		context_tokens: string;
		cost_amount: string;
		cost_currency: string;
	}[];
	expect(Number(usage.tokens_total)).toBe(1500);
	expect(Number(usage.tokens_in)).toBe(1000);
	expect(Number(usage.tokens_out)).toBe(500);
	expect(Number(usage.thought_tokens)).toBe(50);
	expect(Number(usage.cached_read_tokens)).toBe(200);
	expect(Number(usage.context_tokens)).toBe(1200);
	expect(Number(usage.cost_amount)).toBe(0.42);
	expect(usage.cost_currency).toBe("USD");

	// Org-log event with a real txid.
	const [ev] = await p.db.sql<{ plugin_type: string; txid: string }[]>`
    SELECT plugin_type, txid FROM event WHERE org='acme' AND plugin_type='agents:usage_recorded'`;
	expect(ev).toBeDefined();
	expect(Number(ev.txid)).toBeGreaterThan(0);

	// Second task parks (1500 >= 1000)…
	const t2 = await p.op("POST", "tasks", { agentId, prompt: "echo x" });
	expect(await client.call("claim", { waitMs: 0 })).toBeNull();
	expect((await p.op("GET", `tasks/${t2.body.id}`)).body.task.status).toBe(
		"budget_exhausted",
	);
	// …and an admin raise resumes it without creating a new task.
	const raise = await p.op("PATCH", `budgets/${b.body.id}`, {
		ceilingTokens: 100000,
	});
	expect(raise.status).toBe(200);
	expect(raise.body.requeued).toBe(1);
	expect((await p.op("GET", `tasks/${t2.body.id}`)).body.task.status).toBe(
		"queued",
	);
	const c2 = await claim(client);
	expect(c2.task.id).toBe(t2.body.id);
	const done = await executeClaimed(client, cfg, c2.task);
	expect(done.outcome).toBe("completed");
	const listed = await p.op("GET", "tasks");
	expect(listed.body.tasks).toHaveLength(2); // no new task was created
	const types = (
		await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' ORDER BY seq`
	).map((e) => e.plugin_type);
	for (const expected of [
		"agents:budget_created",
		"agents:usage_recorded",
		"agents:task_parked",
		"agents:budget_updated",
	])
		expect(types).toContain(expected);
});

test("B3 negative control: no budget configured → claim/finish unchanged, and agent_error never retries", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const client = new PlaneClient(p.url, token);
	const cfg = {
		server: p.url,
		token,
		workRoot: await workRoot(),
		concurrency: 1,
		harnesses: { fake: FAKE },
	};
	// A usage-reporting run completes and records usage, but parks nothing.
	await p.op("POST", "tasks", { agentId, prompt: "spend" });
	const c = await claim(client);
	const done = await executeClaimed(client, cfg, c.task);
	expect(done.outcome).toBe("completed");
	// The very next task claims immediately — no budget gating at all.
	const t2 = await p.op("POST", "tasks", { agentId, prompt: "echo x" });
	const c2 = await claim(client);
	expect(c2.task.id).toBe(t2.body.id);
	await executeClaimed(client, cfg, c2.task);
	expect((await p.op("GET", `tasks/${t2.body.id}`)).body.task.status).toBe(
		"completed",
	);
	const types = (
		await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' ORDER BY seq`
	).map((e) => e.plugin_type);
	expect(types).not.toContain("agents:task_parked");
	expect(types.filter((x) => x.startsWith("agents:budget_"))).toHaveLength(0);
	// agent_error.* still fails out at the first attempt, never retried.
	const t3 = await p.op("POST", "tasks", { agentId, prompt: "refuse" });
	const c3 = await claim(client);
	const failed = await executeClaimed(client, cfg, c3.task);
	expect(failed.failureCode).toBe("agent_error.refusal");
	const after = (await p.op("GET", `tasks/${t3.body.id}`)).body.task;
	expect(after.status).toBe("failed");
	expect(after.attempt).toBe(1);
	expect(await client.call("claim", { waitMs: 0 })).toBeNull();
});

// ── push attribution (NEVR-199) ─────────────────────────────────────────────

test("P1 a run that pushes records one agents:task_pushed event per push, typed and queryable", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const { bare } = await bareRepo();
	// The fake agent clones the bare repo inside the harness workdir, commits
	// as the agent, and pushes — real git in the harness workdir.
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: `push ${bare}`,
	});
	expect(t.status).toBe(201);
	const finish = await runOne(p, token);
	expect(finish.outcome).toBe("completed");
	expect(finish.pushes).toHaveLength(1);
	const [push] = finish.pushes as [
		{ commitSha: string; ref: string; remote: string; pushedAt: string },
	];
	expect(push.commitSha).toMatch(/^[0-9a-f]{40}$/);
	expect(push.ref).toBe("refs/remotes/origin/main");
	expect(push.remote).toContain(bare);

	// Read surface: the push tuple is queryable on the task view.
	const view = (await p.op("GET", `tasks/${t.body.id}`)).body;
	expect(view.pushes).toHaveLength(1);
	expect(view.pushes[0]).toMatchObject({
		attempt: 1,
		commitSha: push.commitSha,
		ref: "refs/remotes/origin/main",
		remote: push.remote,
	});
	// Typed transcript item, never harness_meta.
	const pushItems = view.items.filter(
		(i: { kind: string }) => i.kind === "push",
	);
	expect(pushItems).toHaveLength(1);
	expect(pushItems[0].body).toMatchObject({
		commitSha: push.commitSha,
		ref: "refs/remotes/origin/main",
	});
	// The pushed sha is real: it is the bare repo's new main.
	const remoteHead = execFileSync("git", [
		"--git-dir",
		bare,
		"rev-parse",
		"refs/heads/main",
	])
		.toString()
		.trim();
	expect(push.commitSha).toBe(remoteHead);

	// Org log: one task_pushed event with the D12 attribution chain —
	// actor = the agent principal, onBehalfOf = the task creator ("operator").
	const events = await p.db.sql<
		{
			plugin_type: string;
			actor: string;
			payload: {
				id: string;
				attempt: number;
				agentId: string;
				commitSha: string;
				ref: string;
				remote: string;
				onBehalfOf: string;
			};
		}[]
	>`SELECT plugin_type, actor, payload FROM event WHERE org='acme' AND plugin_type='agents:task_pushed' ORDER BY seq`;
	expect(events).toHaveLength(1);
	const [ev] = events;
	expect(ev.actor).toBe(`agent:${agentId}`);
	expect(ev.payload).toMatchObject({
		id: t.body.id,
		attempt: 1,
		agentId,
		commitSha: push.commitSha,
		ref: "refs/remotes/origin/main",
		remote: push.remote,
		onBehalfOf: "operator",
	});
});

test("P2 runs with no pushes emit nothing", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", { agentId, prompt: "echo hi" });
	const finish = await runOne(p, token);
	expect(finish.outcome).toBe("completed");
	// Node omits the field entirely when nothing was pushed.
	expect(finish.pushes).toBeUndefined();
	const view = (await p.op("GET", `tasks/${t.body.id}`)).body;
	expect(view.pushes).toEqual([]);
	expect(
		view.items.filter((i: { kind: string }) => i.kind === "push"),
	).toHaveLength(0);
	const events = await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' AND plugin_type='agents:task_pushed'`;
	expect(events).toHaveLength(0);
});

test("P3 per-attempt attribution with a shared workdir: a crash-after-push retry never re-records the earlier push", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const { bare } = await bareRepo();
	const client = new PlaneClient(p.url, token);
	// One task, two attempts, ONE workdir (workdir is keyed by task id). The
	// harness pushes a commit and then crashes; the retry pushes another.
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: `pushcrash ${bare}`,
		maxAttempts: 2,
	});
	expect(t.status).toBe(201);
	const workRootDir = await workRoot();
	const cfg = {
		server: p.url,
		token,
		workRoot: workRootDir,
		concurrency: 1,
		harnesses: { fake: FAKE },
	};
	const first = await executeClaimed(client, cfg, (await claim(client)).task);
	expect(first.failureCode).toBe("platform.harness_exited");
	// The push still landed and is attributed — the commit exists on the
	// remote regardless of the harness crashing afterwards.
	expect(first.pushes).toHaveLength(1);
	const second = await executeClaimed(client, cfg, (await claim(client)).task);
	expect(second.failureCode).toBe("platform.harness_exited");
	expect(second.pushes).toHaveLength(1);
	expect(second.pushes?.[0].commitSha).not.toBe(first.pushes?.[0].commitSha);

	// Org log: exactly two task_pushed events, one per attempt, distinct shas.
	const events = await p.db.sql<
		{ payload: { attempt: number; commitSha: string } }[]
	>`
    SELECT payload FROM event WHERE org='acme' AND plugin_type='agents:task_pushed' ORDER BY seq`;
	expect(events).toHaveLength(2);
	expect(events[0].payload.attempt).toBe(1);
	expect(events[1].payload.attempt).toBe(2);
	expect(events[0].payload.commitSha).not.toBe(events[1].payload.commitSha);

	// Read surface carries both, keyed by attempt.
	const view = (await p.op("GET", `tasks/${t.body.id}`)).body;
	expect(view.task.status).toBe("failed");
	expect(view.pushes).toHaveLength(2);
	expect(view.pushes.map((x: { attempt: number }) => x.attempt)).toEqual([
		1, 2,
	]);
});

test("P4 remote credentials never leave the node: userinfo stripped from finish, org log, and read surface", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const { bare } = await bareRepo();
	// The harness pushes, then rewrites its remote URL to embed credentials —
	// the node reads the reflog AFTER the harness ran, so the URL it sees
	// carries the secret. The secret must be stripped everywhere downstream.
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: `pushsecret ${bare}`,
	});
	expect(t.status).toBe(201);
	const finish = await runOne(p, token);
	expect(finish.outcome).toBe("completed");
	expect(finish.pushes).toHaveLength(1);
	expect(finish.pushes?.[0].remote).toBe("https://github.com/org/repo.git");
	// Nothing the plane stores or emits contains the secret.
	const view = JSON.stringify((await p.op("GET", `tasks/${t.body.id}`)).body);
	expect(view).not.toContain("sekrit");
	const events = await p.db.sql<{ payload: unknown }[]>`
    SELECT payload FROM event WHERE org='acme' AND plugin_type='agents:task_pushed'`;
	expect(events).toHaveLength(1);
	expect(JSON.stringify(events)).not.toContain("sekrit");
	expect(events[0].payload).toMatchObject({
		remote: "https://github.com/org/repo.git",
	});
});

test("P5 a cancelled finish still records the pushes the harness already made", async () => {
	const p = await plane(3000);
	const { token, agentId } = await registerNodeAndAgent(p);
	const { bare } = await bareRepo();
	const client = new PlaneClient(p.url, token);
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: `pushhang ${bare}`,
	});
	expect(t.status).toBe(201);
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
	// The push that landed before the cancel is recorded anyway.
	expect(f.pushes).toHaveLength(1);
	const view = (await p.op("GET", `tasks/${t.body.id}`)).body;
	expect(view.task.status).toBe("cancelled");
	expect(view.pushes).toHaveLength(1);
	expect(view.pushes[0].attempt).toBe(1);
	const events = await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' AND plugin_type='agents:task_pushed'`;
	expect(events).toHaveLength(1);
});

test("P6 plane-side redaction: a node that reports a credential-bearing remote gets it stripped on ingest", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const client = new PlaneClient(p.url, token);
	const t = await p.op("POST", "tasks", { agentId, prompt: "echo x" });
	expect(t.status).toBe(201);
	const c = await claim(client);
	// A misbehaving node reports the secret directly in Finish.pushes.
	await client.call(`tasks/${c.task.id}/finish`, {
		attempt: c.task.attempt,
		outcome: "completed",
		pushes: [
			{
				commitSha: "a".repeat(40),
				ref: "refs/remotes/origin/main",
				remote: "https://agent:tok3n@github.com/org/repo.git",
				pushedAt: new Date().toISOString(),
			},
		],
	});
	const view = JSON.stringify((await p.op("GET", `tasks/${t.body.id}`)).body);
	expect(view).not.toContain("tok3n");
	const events = await p.db.sql<{ payload: unknown }[]>`
    SELECT payload FROM event WHERE org='acme' AND plugin_type='agents:task_pushed'`;
	expect(events).toHaveLength(1);
	expect(JSON.stringify(events)).not.toContain("tok3n");
});

// ── scoped permissions (NEVR-198) ───────────────────────────────────────────

/** registerNodeAndAgent variant that takes a permissionPolicy. */
async function registerNodeAndPolicyAgent(
	p: Awaited<ReturnType<typeof plane>>,
	permissionPolicy: { autoAllow: string[] } | undefined,
) {
	const n = await p.op("POST", "nodes", { name: "laptop" });
	expect(n.status).toBe(201);
	const client = new PlaneClient(p.url, n.body.token);
	await client.call("hello", { version: "test", harnesses: ["fake"] });
	const a = await p.op("POST", "agents", {
		name: "scoped",
		nodeId: n.body.node.id,
		harness: "fake",
		permissionPolicy,
	});
	expect(a.status).toBe(201);
	return {
		token: n.body.token as string,
		agentId: a.body.id as string,
		client,
	};
}

test("P1 env isolation: harness child and MCP descendant see no STELLARC_* var", async () => {
	process.env.STELLARC_NODE_TOKEN = "stln_super_secret_node_token";
	process.env.STELLARC_OPERATOR_TOKEN = "op_secret";
	try {
		const p = await plane();
		const { token, agentId } = await registerNodeAndPolicyAgent(p, undefined);
		const t = await p.op("POST", "tasks", { agentId, prompt: "env probe" });
		const client = new PlaneClient(p.url, token);
		const c = await claim(client);
		const done = await executeClaimed(
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
		expect(done.outcome).toBe("completed");
		const r = await p.op("GET", `tasks/${t.body.id}`);
		const text = r.body.items
			.filter((i: { kind: string }) => i.kind === "message")
			.map(
				(i: { body: { content: { text: string }[] } }) =>
					i.body.content[0].text,
			)
			.join("");
		const seen = JSON.parse(text.slice(text.indexOf("{"))) as {
			stellarcKeys: string[];
			env: Record<string, string | undefined>;
		};
		// The harness child cannot observe any STELLARC_* var…
		expect(seen.stellarcKeys).toEqual([]);
		expect(seen.env.STELLARC_NODE_TOKEN).toBeUndefined();
		// …but the allowlist essentials survive.
		expect(seen.env.PATH).toContain("/");
		// MCP descendant: spawned with the harness's own env, inherits nothing
		// extra either.
		const t2 = await p.op("POST", "tasks", {
			agentId,
			prompt: "mcp-env probe",
		});
		const c2 = await claim(client);
		await executeClaimed(
			client,
			{
				server: p.url,
				token,
				workRoot: await workRoot(),
				concurrency: 1,
				harnesses: { fake: FAKE },
			},
			c2.task,
		);
		const r2 = await p.op("GET", `tasks/${t2.body.id}`);
		const text2 = r2.body.items
			.filter((i: { kind: string }) => i.kind === "message")
			.map(
				(i: { body: { content: { text: string }[] } }) =>
					i.body.content[0].text,
			)
			.join("");
		const childKeys = JSON.parse(text2.slice(text2.indexOf("["))) as string[];
		expect(childKeys.filter((k) => k.startsWith("STELLARC"))).toEqual([]);
	} finally {
		delete process.env.STELLARC_NODE_TOKEN;
		delete process.env.STELLARC_OPERATOR_TOKEN;
	}
});

test("P2 non-allowlisted request parks in needs_permission: approval item with resolved values, no attempt burn", async () => {
	// Short lease: the deny verdict rides the next heartbeat, and the default
	// 60s lease would beat every 20s — far past the 30s vitest timeout.
	const p = await plane(3000);
	const { token, agentId } = await registerNodeAndPolicyAgent(p, {
		autoAllow: ["read", "grep"],
	});
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: "perm-park please",
	});
	const client = new PlaneClient(p.url, token);
	const c = await claim(client);
	expect(c.task.attempt).toBe(1);
	const cfg = {
		server: p.url,
		token,
		workRoot: await workRoot(),
		concurrency: 1,
		harnesses: { fake: FAKE },
	};
	// Drive the run but do NOT await it: the permission park must hold it open.
	const running = executeClaimed(client, cfg, c.task);
	const parked = await waitFor(async () => {
		const r = await p.op("GET", `tasks/${t.body.id}`);
		return r.body.task.status === "needs_permission" ? r.body : undefined;
	});
	// Parked, not failed: same attempt, no failure code, lease alive.
	expect(parked.task.attempt).toBe(1);
	expect(parked.task.failureCode).toBeNull();
	expect(parked.task.nativeSessionId).toMatch(/^fake-/);
	// The approval item carries options AND resolved argument values.
	const approvals = parked.items.filter(
		(i: { kind: string }) => i.kind === "approval",
	);
	expect(approvals).toHaveLength(1);
	const body = approvals[0].body as {
		request: { toolName: string; arguments: unknown };
		status: string;
	};
	expect(body.request.toolName).toBe("deploy");
	expect(body.request.arguments).toEqual({ target: "prod", force: true });
	expect(body.status).toBe("pending");
	// Parked tasks are excluded from claims.
	expect(await client.call("claim", { waitMs: 0 })).toBeNull();
	// Deny: fails exactly once with agent_error.permission_denied.
	expect(
		(await p.op("POST", `tasks/${t.body.id}/permission`, { decision: "deny" }))
			.status,
	).toBe(200);
	const f = await running;
	expect(f.outcome).toBe("completed"); // the harness ran to its rejected end_turn
	const after = await p.op("GET", `tasks/${t.body.id}`);
	expect(after.body.task.status).toBe("failed");
	expect(after.body.task.failureCode).toBe("agent_error.permission_denied");
	expect(after.body.task.attempt).toBe(1);
	// Denied tasks never retry.
	expect(await client.call("claim", { waitMs: 0 })).toBeNull();
	// Second decision attempt conflicts.
	expect(
		(await p.op("POST", `tasks/${t.body.id}/permission`, { decision: "grant" }))
			.status,
	).toBe(409);
	// Events: requested (node actor) + denied (operator actor) on the org log.
	const events = await p.db.sql<
		{ plugin_type: string; actor: string; payload: unknown }[]
	>`SELECT plugin_type, actor, payload FROM event WHERE org='acme' AND plugin_type LIKE 'agents:task_permission%' ORDER BY seq`;
	expect(events.map((e) => e.plugin_type)).toEqual([
		"agents:task_permission_requested",
		"agents:task_permission_denied",
	]);
	expect(events[0].actor).toMatch(/^node:node_/);
	expect(events[1].actor).toBe("operator");
});

test("P3 grant resumes the same attempt and native session", async () => {
	const p = await plane(3000);
	const { token, agentId } = await registerNodeAndPolicyAgent(p, {
		autoAllow: [],
	});
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: "perm-park please",
	});
	const client = new PlaneClient(p.url, token);
	const c = await claim(client);
	const cfg = {
		server: p.url,
		token,
		workRoot: await workRoot(),
		concurrency: 1,
		harnesses: { fake: FAKE },
	};
	const running = executeClaimed(client, cfg, c.task);
	const parked = await waitFor(async () => {
		const r = await p.op("GET", `tasks/${t.body.id}`);
		return r.body.task.status === "needs_permission" ? r.body : undefined;
	});
	const native = parked.task.nativeSessionId;
	// Wait for the harness to actually block on the permission request, then
	// grant: the node continues the held session (no reclaim, same attempt).
	await waitFor(async () =>
		parked.items.some((i: { kind: string }) => i.kind === "approval")
			? true
			: undefined,
	);
	expect(
		(await p.op("POST", `tasks/${t.body.id}/permission`, { decision: "grant" }))
			.status,
	).toBe(200);
	const f = await running;
	expect(f.outcome).toBe("completed");
	const after = await p.op("GET", `tasks/${t.body.id}`);
	expect(after.body.task.status).toBe("completed");
	expect(after.body.task.attempt).toBe(1); // same attempt
	expect(after.body.task.nativeSessionId).toBe(native); // same native session
	// Approval lifecycle recorded: pending → granted.
	const approvals = after.body.items.filter(
		(i: { kind: string }) => i.kind === "approval",
	);
	expect(
		approvals.map((a: { body: { status: string } }) => a.body.status),
	).toEqual(["pending", "granted"]);
	// The tool actually ran after the grant.
	const toolResult = after.body.items.find(
		(i: { kind: string }) => i.kind === "tool_result",
	);
	expect(toolResult.body.output).toEqual({ picked: "yes" });
	const events = await p.db.sql<{ plugin_type: string; actor: string }[]>`
    SELECT plugin_type, actor FROM event WHERE org='acme' AND plugin_type LIKE 'agents:task_permission%' ORDER BY seq`;
	expect(events.map((e) => e.plugin_type)).toEqual([
		"agents:task_permission_requested",
		"agents:task_permission_granted",
	]);
	expect(events[1].actor).toBe("operator");
});

test("P4 allowlisted tool auto-approves with no plane round-trip", async () => {
	const p = await plane();
	// Policy allows the tool the fake agent requests ("deploy" via verb
	// perm-park); everything else parks.
	const { token, agentId } = await registerNodeAndPolicyAgent(p, {
		autoAllow: ["deploy"],
	});
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: "perm-park please",
	});
	const client = new PlaneClient(p.url, token);
	const c = await claim(client);
	const done = await executeClaimed(
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
	expect(done.outcome).toBe("completed");
	const r = await p.op("GET", `tasks/${t.body.id}`);
	expect(r.body.task.status).toBe("completed");
	// No park, no approval item, no permission events.
	expect(
		r.body.items.filter((i: { kind: string }) => i.kind === "approval"),
	).toHaveLength(0);
	const events = await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' AND plugin_type LIKE 'agents:task_permission%'`;
	expect(events).toHaveLength(0);
	// The tool ran (auto-allow chose allow_once).
	const toolResult = r.body.items.find(
		(i: { kind: string }) => i.kind === "tool_result",
	);
	expect(toolResult.body.output).toEqual({ picked: "yes" });
});

test("P5 negative control: no policy → legacy behaviour, everything auto-allowed", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndPolicyAgent(p, undefined);
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: "perm-park please",
	});
	const client = new PlaneClient(p.url, token);
	const c = await claim(client);
	const done = await executeClaimed(
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
	expect(done.outcome).toBe("completed");
	const r = await p.op("GET", `tasks/${t.body.id}`);
	expect(r.body.task.status).toBe("completed");
	expect(
		r.body.items.filter((i: { kind: string }) => i.kind === "approval"),
	).toHaveLength(0);
	const events = await p.db.sql<{ plugin_type: string }[]>`
    SELECT plugin_type FROM event WHERE org='acme' AND plugin_type LIKE 'agents:task_permission%'`;
	expect(events).toHaveLength(0);
});
