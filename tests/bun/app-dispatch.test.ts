import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { Effect } from "effect";
import {
	agentsHttp,
	staticOperatorAuth,
} from "../../packages/agents/src/index";
import {
	activateApp,
	deactivateApp,
	installApps,
} from "../../packages/apps/src/index";
import { requireAppAccess } from "../../packages/apps/src/access";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

setDefaultTimeout(60000);
const resources: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (resources.length) await resources.pop()?.();
});

async function plane() {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await installApps(db.sql);
	const http = agentsHttp(db.sql, {
		operatorAuth: staticOperatorAuth("fixture"),
	});
	resources.push(http.dispose);
	const call = async (
		path: string,
		method = "GET",
		body?: unknown,
		token = "fixture",
	) => {
		const response = await http.handler(
			new Request(`http://plane/orgs/acme/v1/${path}`, {
				method,
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);
		return response;
	};
	const on = (capabilities = ["session:drive"], org = "acme") =>
		activateApp(db.sql, org, "operator", "agents", capabilities);
	const off = () => deactivateApp(db.sql, "acme", "operator", "agents");
	const setup = async () => {
		await on();
		const registered = await Effect.runPromise(
			http.store.createNode("acme", "operator", "box"),
		);
		const node = registered.node;
		await Effect.runPromise(http.store.hello(node, "test", ["fake"]));
		const agent = await Effect.runPromise(
			http.store.createAgent("acme", "operator", {
				name: "worker",
				nodeId: node.id,
				harness: "fake",
				instructions: "",
				mcpServers: [],
			}),
		);
		const create = () =>
			Effect.runPromise(
				http.store.createTask("acme", "operator", {
					agentId: agent.id,
					prompt: "fixture",
				}),
			);
		return { node, agent, create };
	};
	return { db, http, call, on, off, setup };
}

test("dispatch fails closed per org; task observation remains available; execution requires a ratified grant", async () => {
	const p = await plane();
	for (const path of ["nodes", "agents", "budgets"])
		expect((await p.call(path)).status).toBe(403);
	expect((await p.call("tasks")).status).toBe(200);
	expect((await p.call("agents", "GET", undefined, "wrong")).status).toBe(403);
	await p.on(["session:drive"], "globex");
	expect((await p.call("agents")).status).toBe(403);
	const { agent, create } = await p.setup();
	await p.on([]);
	expect((await p.call("agents")).status).toBe(200);
	expect(
		(await p.call("tasks", "POST", { agentId: agent.id, prompt: "no grant" }))
			.status,
	).toBe(403);
	await expect(create()).rejects.toThrow();
	await p.on();
	const task = await create();
	await p.off();
	expect((await p.call(`tasks/${task.id}`)).status).toBe(200);
	expect((await p.call(`tasks/${task.id}/cancel`, "POST")).status).toBe(200);
});

test("disable blocks claims, starts and permission grants but permits reporting, denial, finishing and lease cleanup", async () => {
	const p = await plane();
	const { node, create } = await p.setup();
	const store = p.http.store;
	const first = await create();
	await Effect.runPromise(store.claim(node, 0));
	await p.off();
	await expect(
		Effect.runPromise(store.start(node, first.id, 1)),
	).rejects.toThrow();
	await expect(Effect.runPromise(store.claim(node, 0))).rejects.toThrow();
	await Effect.runPromise(store.hello(node, "disabled", ["fake"]));
	await Effect.runPromise(
		store.appendItems(node, first.id, 1, [
			{
				seq: 0,
				kind: "message",
				body: "report",
				occurredAt: new Date().toISOString(),
			},
		]),
	);
	await Effect.runPromise(
		store.finish(node, first.id, { attempt: 1, outcome: "completed" }),
	);
	await p.on();
	const second = await create();
	await Effect.runPromise(store.claim(node, 0));
	await Effect.runPromise(store.start(node, second.id, 1));
	await p.off();
	await Effect.runPromise(
		store.permissionRequest(node, second.id, {
			attempt: 1,
			request: {
				sessionId: "fixture",
				toolCallId: "tool",
				toolName: "bash",
				title: "fixture",
				options: [{ optionId: "yes", name: "Allow", kind: "allow_once" }],
			},
		}),
	);
	await expect(
		Effect.runPromise(
			store.resolvePermission("acme", "operator", second.id, {
				decision: "grant",
			}),
		),
	).rejects.toThrow();
	await Effect.runPromise(store.heartbeat(node, second.id, 1));
	expect(
		(
			await p.call(`tasks/${second.id}/permission`, "POST", {
				decision: "deny",
			})
		).status,
	).toBe(200);
	await p.on();
	const expired = await create();
	await Effect.runPromise(store.claim(node, 0));
	await p.db
		.sql`UPDATE agent_task SET lease_until=now()-interval '1 second' WHERE id=${expired.id}`;
	await p.off();
	await expect(Effect.runPromise(store.claim(node, 0))).rejects.toThrow();
	const [row] = await p.db
		.sql`SELECT status, attempt FROM agent_task WHERE id=${expired.id}`;
	expect(row).toMatchObject({ status: "queued", attempt: 1 });
});

async function waitForLock(p: Awaited<ReturnType<typeof plane>>, fragment: string) {
	const until = Date.now() + 5000;
	while (Date.now() < until) {
		const [row] = await p.db.sql`
			SELECT count(*)::int AS n FROM pg_stat_activity
			WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'
			AND position(${fragment} IN query) > 0`;
		if (row.n > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`No blocked query: ${fragment}`);
}

// The test controls database locks, not wall-clock race timing.
test("a waiting admission re-evaluates a narrowed grant, and deactivate waits for admitted work to commit", async () => {
	const p = await plane();
	await p.on();
	let release = () => {};
	let locked = () => {};
	const ready = new Promise<void>((resolve) => { locked = resolve; });
	const held = new Promise<void>((resolve) => { release = resolve; });
	const writer = p.db.sql.begin(async (tx) => {
		await tx`SELECT 1 FROM app_activation WHERE org='acme' AND app_id='agents' FOR UPDATE`;
		locked();
		await held;
		await tx`UPDATE app_activation SET capabilities='[]' WHERE org='acme' AND app_id='agents'`;
	});
	await ready;
	// Attach rejection handling immediately, before releasing the writer.
	const admission = p.db.sql.begin((tx) => requireAppAccess(tx, "acme", "agents", "session:drive"))
		.then(() => "admitted", () => "refused");
	try {
		await waitForLock(p, "FROM app_activation v");
	} finally {
		release();
		await writer;
	}
	expect(await admission).toBe("refused");

	await p.on();
	let leave = () => {};
	let entered = () => {};
	const inside = new Promise<void>((resolve) => { entered = resolve; });
	const hold = new Promise<void>((resolve) => { leave = resolve; });
	const reader = p.db.sql.begin(async (tx) => {
		await requireAppAccess(tx, "acme", "agents", "session:drive");
		entered();
		await hold;
	});
	await inside;
	const disabling = p.off();
	try {
		await waitForLock(p, "DELETE FROM app_activation");
	} finally {
		leave();
		await reader;
	}
	await disabling;
	await expect(requireAppAccess(p.db.sql, "acme", "agents", "session:drive")).rejects.toThrow();
});

test("a long-poll claim rechecks access after disable rather than admitting later queued work", async () => {
	const p = await plane();
	const { node, create } = await p.setup();
	const queued = await create();
	await p.db.sql`UPDATE agent_task SET status='completed' WHERE id=${queued.id}`;
	// No task candidate: observe the first pass by its node liveness update.
	await p.db.sql`UPDATE agent_node SET last_seen_at=NULL WHERE id=${node.id}`;
	const polling = Effect.runPromise(p.http.store.claim(node, 3000))
		.then(() => "admitted", () => "refused");
	const until = Date.now() + 2000;
	for (;;) {
		const [seen] = await p.db.sql`SELECT last_seen_at FROM agent_node WHERE id=${node.id}`;
		if (seen.last_seen_at !== null) break;
		if (Date.now() > until) throw new Error("claim never entered its first pass");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	await p.off();
	await p.db.sql`UPDATE agent_task SET status='queued' WHERE id=${queued.id}`;
	expect(await polling).toBe("refused");
	const [row] = await p.db.sql`SELECT status, attempt FROM agent_task WHERE id=${queued.id}`;
	expect(row).toMatchObject({ status: "queued", attempt: 0 });
});
