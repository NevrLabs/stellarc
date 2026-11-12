import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	executeClaimed,
	type NodeConfig,
	PlaneClient,
} from "../../apps/stellarc-node/src/main";
import { renderResumeDigest } from "../../apps/stellarc-node/src/runner";
import {
	agentsHttp,
	staticOperatorAuth,
} from "../../packages/agents/src/index";
import type { TaskDescriptor } from "../../packages/agents/src/protocol";
import {
	type ContextReceiptView,
	projectContextReceipts,
} from "../../packages/agents/src/store";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

/**
 * NEVR-624 — per-run context receipt on the event log (Multica #10426
 * pattern). A receipt records WHAT each attempt received — one row per
 * context source (instructions | prompt | resume-digest | mcp-server), sizes,
 * 12-char SHA-256 prefixes, delivery, confidence — appended in the same
 * transaction as task-started. The privacy shape is the design: METADATA
 * ONLY, enforced at the schema seam (constructing decode drops excess keys),
 * pinned here by a negative control.
 *
 * Coverage:
 * - C1 first attempt through the REAL node seam ships a receipt whose hashes
 *   and sizes are recomputed independently in this file.
 * - C2 a resumed attempt emits its own receipt, including the resume-digest
 *   row (both attempts crash-retry through the real node seam).
 * - C3 replay: the org log alone folds back into exactly the getTask view.
 * - C4 metadata-only negative control: smuggled content/command/env keys
 *   never survive decode → append.
 * - C5 negative control: a node that reports no receipt (pre-NEVR-624
 *   binary) still starts; zero receipt facts are written.
 */

const OPERATOR = "test-operator-token";
const FAKE = {
	command: process.execPath,
	args: [join(process.cwd(), "tests/fixtures/fake-acp-agent.ts")],
};
const INSTRUCTIONS = "You are terse.";
const PROMPT_C1 = "echo done";
const sha12 = (v: string) =>
	createHash("sha256").update(v).digest("hex").slice(0, 12);
/** Canonical MCP config string the node hashes (runner.contextReceipt):
 * fixed key order by construction, decode-applied defaults included, env
 * deliberately EXCLUDED (credential material — see runner doc comment). */
const mcpConfig = (name: string, command: string) =>
	JSON.stringify({ name, command, args: [] });

const resources: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

async function plane() {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const agents = agentsHttp(db.sql, {
		operatorAuth: staticOperatorAuth(OPERATOR),
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
	const op = async (method: string, path: string, body?: unknown) => {
		const res = await fetch(`${server.url.origin}/orgs/acme/v1/${path}`, {
			method,
			headers: {
				authorization: `Bearer ${OPERATOR}`,
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
	return { db, url: server.url.origin, op };
}

async function registerNodeAndAgent(p: Awaited<ReturnType<typeof plane>>) {
	const n = await p.op("POST", "nodes", { name: "laptop" });
	expect(n.status).toBe(201);
	const client = new PlaneClient(p.url, n.body.token);
	await client.call("hello", { version: "test", harnesses: ["fake"] });
	const a = await p.op("POST", "agents", {
		name: "builder",
		nodeId: n.body.node.id,
		harness: "fake",
		instructions: INSTRUCTIONS,
		mcpServers: [{ name: "kaneo", command: "kaneo-mcp" }],
	});
	expect(a.status).toBe(201);
	return {
		token: n.body.token as string,
		agentId: a.body.id as string,
		client,
	};
}

async function nodeConfig(p: Awaited<ReturnType<typeof plane>>, token: string) {
	const dir = await mkdtemp(join(tmpdir(), "nevr624-"));
	resources.push(() => rm(dir, { recursive: true, force: true }));
	const config: NodeConfig = {
		server: p.url,
		token,
		workRoot: dir,
		concurrency: 1,
		harnesses: { fake: FAKE },
	};
	return config;
}

const claim = async (client: PlaneClient) => {
	const c = await client.call<{ task: TaskDescriptor }>("claim", { waitMs: 0 });
	if (!c) throw new Error("expected a claimable task");
	return c.task;
};

const getTask = async (p: Awaited<ReturnType<typeof plane>>, id: string) =>
	(await p.op("GET", `tasks/${id}`)).body;

/** Fresh completed task through the REAL node seam (claim → executeClaimed). */
async function runCompleted(
	p: Awaited<ReturnType<typeof plane>>,
	token: string,
	agentId: string,
	prompt: string,
) {
	const t = await p.op("POST", "tasks", { agentId, prompt });
	expect(t.status).toBe(201);
	const client = new PlaneClient(p.url, token);
	const task = await claim(client);
	const finish = await executeClaimed(client, await nodeConfig(p, token), task);
	expect(finish.outcome).toBe("completed");
	return t.body.id as string;
}

// ── C1: first attempt receipts, hashes recomputed independently ─────────────

test("C1 every started attempt leaves a receipt: one row per source, metadata recomputed here", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const id = await runCompleted(p, token, agentId, PROMPT_C1);

	const got = await getTask(p, id);
	expect(got.task.status).toBe("completed");
	const rows = got.receipts as Array<Record<string, unknown>>;
	expect(rows.length).toBe(3);
	expect(rows.map((r) => r.kind)).toEqual([
		"instructions",
		"prompt",
		"mcp-server",
	]);
	// The seeded rows: inline delivery, seeded confidence, hash + size of the
	// exact strings the node composed.
	expect(rows[0]).toEqual({
		attempt: 1,
		position: 0,
		kind: "instructions",
		name: "instructions",
		bytes: Buffer.byteLength(INSTRUCTIONS),
		sha256: sha12(INSTRUCTIONS),
		delivery: "inline",
		confidence: "seeded",
	});
	expect(rows[1]).toEqual({
		attempt: 1,
		position: 1,
		kind: "prompt",
		name: "prompt",
		bytes: Buffer.byteLength(PROMPT_C1),
		sha256: sha12(PROMPT_C1),
		delivery: "inline",
		confidence: "seeded",
	});
	// The MCP row: referenced config, never its content — hash over the
	// canonical launch config, name only.
	expect(rows[2]).toEqual({
		attempt: 1,
		position: 2,
		kind: "mcp-server",
		name: "kaneo",
		bytes: Buffer.byteLength(mcpConfig("kaneo", "kaneo-mcp")),
		sha256: sha12(mcpConfig("kaneo", "kaneo-mcp")),
		delivery: "reference",
		confidence: "referenced",
	});
	// Metadata only — no row carries any content-ish key.
	for (const r of rows)
		expect(Object.keys(r).sort()).toEqual(
			[
				"attempt",
				"bytes",
				"confidence",
				"delivery",
				"kind",
				"name",
				"position",
				"sha256",
			].sort(),
		);
}, 120_000);

// ── C2: resumed attempt emits its own receipt incl. the digest row ──────────

test("C2 a resumed attempt emits its own receipt with the resume-digest row (real node seam, both attempts)", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: "crash",
		maxAttempts: 3,
	});
	expect(t.status).toBe(201);
	const client = new PlaneClient(p.url, token);
	const cfg = await nodeConfig(p, token);
	const id = t.body.id as string;

	// Attempt 1: real node seam — starts (receipt ships), then the harness
	// crashes: platform.harness_exited, requeued and resumable.
	const c1 = await claim(client);
	expect(c1.attempt).toBe(1);
	expect(c1.resume).toBeUndefined();
	await executeClaimed(client, cfg, c1);
	expect((await getTask(p, id)).task.status).toBe("queued");

	// Attempt 2: the claim carries the resume payload; the node seeds the
	// digest BEFORE the prompt, so its receipt has four rows.
	const c2 = await claim(client);
	expect(c2.attempt).toBe(2);
	expect(c2.resume?.fromAttempt).toBe(1);
	await executeClaimed(client, cfg, c2);

	const rows = (await getTask(p, id)).receipts as Array<
		ReturnType<typeof projectContextReceipts>[number]
	>;
	const byAttempt = new Map<number, typeof rows>();
	for (const r of rows) {
		const list = byAttempt.get(r.attempt) ?? [];
		list.push(r);
		byAttempt.set(r.attempt, list);
	}
	// Every attempt emitted a receipt — the acceptance line.
	expect([...byAttempt.keys()].sort()).toEqual([1, 2]);
	expect(byAttempt.get(1)?.map((r) => r.kind)).toEqual([
		"instructions",
		"prompt",
		"mcp-server",
	]);
	expect(byAttempt.get(2)?.map((r) => r.kind)).toEqual([
		"instructions",
		"resume-digest",
		"prompt",
		"mcp-server",
	]);
	// The digest row hashes EXACTLY the string renderResumeDigest produced
	// for this attempt's resume payload — recomputed here, independently.
	const resume = c2.resume;
	if (!resume) throw new Error("attempt-2 claim must carry a resume payload");
	const digest = byAttempt.get(2)?.find((r) => r.kind === "resume-digest");
	expect(digest?.name).toBe("resume:attempt-1");
	expect(digest?.sha256).toBe(sha12(renderResumeDigest(resume)));
	expect(digest?.bytes).toBe(Buffer.byteLength(renderResumeDigest(resume)));
	// Same instructions/prompt across attempts → identical rows (change
	// detection: a diverging hash on a later attempt is the signal).
	const pick = (a: number, kind: string) =>
		byAttempt.get(a)?.find((r) => r.kind === kind);
	expect(pick(2, "instructions")?.sha256).toBe(pick(1, "instructions")?.sha256);
	expect(pick(2, "mcp-server")?.sha256).toBe(pick(1, "mcp-server")?.sha256);
}, 120_000);

// ── C3: replay renders receipts from the event log alone ────────────────────

test("C3 replay: the org log alone folds into exactly the getTask view", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const idCompleted = await runCompleted(p, token, agentId, "echo replay");
	const t = await p.op("POST", "tasks", {
		agentId,
		prompt: "crash",
		maxAttempts: 3,
	});
	const client = new PlaneClient(p.url, token);
	const cfg = await nodeConfig(p, token);
	await executeClaimed(client, cfg, await claim(client));
	await executeClaimed(client, cfg, await claim(client));

	const events = await p.db.sql<
		Array<{ plugin_type: string; payload: unknown }>
	>`SELECT plugin_type, payload FROM event WHERE org='acme' ORDER BY seq`;
	expect(events.some((e) => e.plugin_type === "agents:context-receipt")).toBe(
		true,
	);
	// The pure fold (the definition of the view) over the raw log, filtered
	// per task via the payload's id field, equals the projection the read
	// path serves — replay renders receipts from the log alone.
	for (const id of [idCompleted, t.body.id as string]) {
		const view = (await getTask(p, id)).receipts as ContextReceiptView[];
		const taskEvents = await p.db.sql<
			Array<{ payload: { id: string } }>
		>`SELECT payload FROM event WHERE org='acme' AND plugin_type='agents:context-receipt' AND payload->>'id'=${id} ORDER BY seq`;
		const fromLog = projectContextReceipts(
			taskEvents.map((e) => ({ type: "context-receipt", payload: e.payload })),
		);
		expect(fromLog).toEqual(view);
	}
}, 120_000);

// ── C4: metadata-only is enforced at the schema seam ────────────────────────

/**
 * Negative control (the (b)-line runtime pin, scope-denial B1 house pattern).
 * A node that smuggles content-bearing keys on a receipt row — `content`,
 * `command`, `env` — must see them dropped by the constructing decode BEFORE
 * store.start() runs: the org log and the projection table carry none of
 * them, while the six declared fields still land.
 *
 * Sabotage (proves the test can go red): one edit — widen ContextReceiptRow
 * in packages/agents/src/protocol.ts with
 * `content: Schema.optional(Schema.String)`. Decode then KEEPS the smuggled
 * key, and recordContextReceipt's `...r` spread carries it into the org-log
 * payload — the `JSON.stringify(...)` assertion below reddens first. (The
 * projection table additionally names its columns in the INSERT, so leaking
 * THERE takes a second edit; the log is the canonical surface and pins
 * first.)
 */
test("C4 metadata-only: smuggled content/command/env keys never survive decode → append", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", { agentId, prompt: "echo x" });
	const client = new PlaneClient(p.url, token);
	const task = await claim(client);
	expect(task.id).toBe(t.body.id);

	const SECRET = "SECRET-PLAN-TEXT";
	// Schema-valid row PLUS smuggled excess keys — a compromised or buggy
	// node reporting more than the contract.
	await client.call(`tasks/${task.id}/start`, {
		attempt: 1,
		nativeSessionId: "sess-c4",
		contextReceipt: [
			{
				kind: "prompt",
				name: "prompt",
				bytes: 5,
				sha256: sha12("echo x"),
				delivery: "inline",
				confidence: "seeded",
				content: SECRET,
				command: "curl evil.example",
				env: [{ name: "K", value: "V" }],
			},
		],
	});

	// The declared fields landed; the row is queryable.
	const got = await getTask(p, task.id);
	expect(got.task.status).toBe("running");
	expect(got.receipts.length).toBe(1);
	expect(Object.keys(got.receipts[0]).sort()).toEqual(
		[
			"attempt",
			"bytes",
			"confidence",
			"delivery",
			"kind",
			"name",
			"position",
			"sha256",
		].sort(),
	);

	// And nothing content-bearing survived anywhere: org log payloads…
	const log = await p.db.sql<Array<{ payload: unknown }>>`
    SELECT payload FROM event WHERE org='acme' AND plugin_type='agents:context-receipt'`;
	const dump = JSON.stringify(log.map((r) => r.payload));
	expect(dump).not.toContain(SECRET);
	expect(dump).not.toContain("curl evil.example");
	// …and the projection table.
	const table = await p.db.sql`SELECT * FROM agent_task_context_receipt`;
	expect(JSON.stringify(table)).not.toContain(SECRET);
	expect(JSON.stringify(table)).not.toContain("curl evil.example");
	// Exactly one receipt event, and its payload keys are the contract's.
	expect(log.length).toBe(1);
	expect(Object.keys(log[0].payload as object).sort()).toEqual(
		[
			"attempt",
			"bytes",
			"confidence",
			"delivery",
			"id",
			"kind",
			"name",
			"sha256",
		].sort(),
	);
}, 120_000);

// ── C5: a pre-receipt node still starts (no regression) ─────────────────────

test("C5 negative control: a start report with no contextReceipt writes zero receipt facts and still runs", async () => {
	const p = await plane();
	const { token, agentId } = await registerNodeAndAgent(p);
	const t = await p.op("POST", "tasks", { agentId, prompt: "echo old" });
	const client = new PlaneClient(p.url, token);
	const task = await claim(client);
	expect(task.id).toBe(t.body.id);
	await client.call(`tasks/${task.id}/start`, {
		attempt: 1,
		nativeSessionId: "sess-c5",
	});

	const got = await getTask(p, task.id);
	expect(got.task.status).toBe("running");
	expect(got.receipts).toEqual([]);
	const rows = await p.db
		.sql`SELECT * FROM agent_task_context_receipt WHERE task_id=${task.id}`;
	expect(rows.length).toBe(0);
	const events = await p.db
		.sql`SELECT 1 FROM event WHERE org='acme' AND plugin_type='agents:context-receipt'`;
	expect(events.length).toBe(0);
}, 120_000);
