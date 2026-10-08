import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as acp from "@agentclientprotocol/sdk";
import { executeClaimed, type NodeConfig, PlaneClient, runNode } from "./main";
import { runTask, TranscriptFolder } from "./runner";

/**
 * Behavioural gate for the stellarc-node daemon. The daemon itself uses no
 * Effect (the v4 migration changed nothing here), so this test is deliberately
 * self-contained: a plain Bun.serve fake plane and the fake ACP agent fixture.
 * Assertions read the plane wire types through unannotated locals so the file
 * typechecks against packages/agents' protocol whether or not that package's
 * own v4 port has landed (its schema types are in flux in parallel work).
 */

const FAKE = {
	command: process.execPath,
	args: [join(process.cwd(), "tests/fixtures/fake-acp-agent.ts")],
};
const TASK = {
	id: "t1",
	org: "acme",
	attempt: 1,
	prompt: "echo PONG",
	subjectRef: null,
	leaseMs: 60_000,
	agent: {
		id: "a1",
		name: "byo",
		harness: "fake",
		model: null,
		instructions: "",
		mcpServers: [] as ReadonlyArray<{
			readonly name: string;
			readonly command: string;
			readonly args: ReadonlyArray<string>;
			readonly env: ReadonlyArray<{ name: string; value: string }>;
		}>,
	},
};
const workRoot = () => mkdtemp(join(tmpdir(), "stellarc-node-test-"));
const text = (body: unknown) =>
	(body as { content: Array<{ text: string }> }).content[0].text;

describe("TranscriptFolder", () => {
	test("coalesces consecutive message/thought chunks into ordered items", () => {
		const f = new TranscriptFolder();
		f.userPrompt("hi");
		f.update({
			sessionUpdate: "agent_thought_chunk",
			content: { type: "text", text: "thinking" },
		} as acp.SessionUpdate);
		f.update({
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Hello, " },
		} as acp.SessionUpdate);
		f.update({
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "world" },
		} as acp.SessionUpdate);
		const items = f.take(true);
		const kinds: string[] = items.map((i) => i.kind);
		expect(kinds).toEqual(["message", "thinking", "message"]);
		const msg = items[2].body as { role: string };
		expect(msg.role).toBe("assistant");
		expect(text(items[2].body)).toBe("Hello, world");
	});
});

describe("runTask (fake ACP agent)", () => {
	test("echo prompt completes end_turn and streams the assistant reply", async () => {
		const items: unknown[] = [];
		const out = await runTask(TASK, FAKE, {
			workdir: await workRoot(),
			heartbeatMs: 5_000,
			onStart: async () => {},
			onItems: async (batch) => {
				items.push(...batch);
			},
			heartbeat: async () => false,
		});
		expect(out).toEqual({ outcome: "completed", stopReason: "end_turn" });
		const replies = items
			.map((i) => i as { kind: string; body: unknown })
			.filter((i) => i.kind === "message")
			.map((i) => i.body as { role: string })
			.filter((b) => b.role === "assistant");
		expect(replies).toHaveLength(1);
		expect(text(replies[0])).toBe("Hello, PONG");
	});

	test("refusal maps to agent_error.refusal", async () => {
		const out = await runTask({ ...TASK, prompt: "refuse" }, FAKE, {
			workdir: await workRoot(),
			heartbeatMs: 5_000,
			onStart: async () => {},
			onItems: async () => {},
			heartbeat: async () => false,
		});
		const failureCode = out.failureCode as string | undefined;
		expect(out.outcome).toBe("failed");
		expect(failureCode).toBe("agent_error.refusal");
	});

	test("harness crash maps to platform.harness_exited", async () => {
		const out = await runTask({ ...TASK, prompt: "crash" }, FAKE, {
			workdir: await workRoot(),
			heartbeatMs: 5_000,
			onStart: async () => {},
			onItems: async () => {},
			heartbeat: async () => false,
		});
		const failureCode = out.failureCode as string | undefined;
		expect(out.outcome).toBe("failed");
		expect(failureCode).toBe("platform.harness_exited");
	});

	test("cancelled heartbeat cancels a hanging agent", async () => {
		const out = await runTask({ ...TASK, prompt: "hang" }, FAKE, {
			workdir: await workRoot(),
			heartbeatMs: 300,
			onStart: async () => {},
			onItems: async () => {},
			heartbeat: async () => true,
		});
		const outcome = out.outcome as string;
		const stopReason = out.stopReason as string | undefined;
		expect(outcome).toBe("cancelled");
		expect(stopReason).toBe("cancelled");
	});
});

describe("node ↔ plane protocol (fake plane)", () => {
	// biome-ignore lint/suspicious/noExplicitAny: wire bodies in test doubles
	const calls: Array<{ path: string; body: any }> = [];
	const claimQueue: (typeof TASK)[] = [];
	let heartbeatCancelled = false;
	let server: ReturnType<typeof Bun.serve>;
	let url = "";

	beforeAll(() => {
		server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			idleTimeout: 45,
			async fetch(req) {
				const path = new URL(req.url).pathname.replace(/^\/v1\/node\//, "");
				const body = await req.json().catch(() => ({}));
				calls.push({ path, body });
				switch (path) {
					case "hello":
						return Response.json({ ok: true });
					case "claim":
						return claimQueue.length > 0
							? Response.json({ task: claimQueue.shift() })
							: new Response(null, { status: 204 });
					case "tasks/t1/start":
					case "tasks/t1/items":
					case "tasks/t1/finish":
						return Response.json({ ok: true });
					case "tasks/t1/heartbeat":
						return Response.json({ cancelled: heartbeatCancelled });
					default:
						return new Response("nope", { status: 404 });
				}
			},
		});
		url = server.url.origin;
	});
	afterAll(() => server.stop(true));

	const config = async (
		harnesses: NodeConfig["harnesses"],
	): Promise<NodeConfig> => ({
		server: url,
		token: "test-token",
		workRoot: await workRoot(),
		concurrency: 1,
		harnesses,
	});

	test("PlaneClient parses JSON, maps 204 to null, raises PlaneError", async () => {
		const plane = new PlaneClient(url, "test-token");
		expect(await plane.call<{ ok: boolean }>("hello", { v: 1 })).toEqual({
			ok: true,
		});
		expect(await plane.call("claim", { waitMs: 0 })).toBeNull();
		expect(plane.call("bogus", {})).rejects.toThrow("plane 404");
	});

	test("executeClaimed drives start/items/finish and reports completion", async () => {
		calls.length = 0;
		const finish = await executeClaimed(
			new PlaneClient(url, "test-token"),
			await config({ fake: FAKE }),
			TASK,
		);
		const outcome = finish.outcome as string;
		const stopReason = finish.stopReason as string | undefined;
		expect(finish.attempt).toBe(1);
		expect(outcome).toBe("completed");
		expect(stopReason).toBe("end_turn");
		const paths = calls.map((c) => c.path);
		expect(paths).toContain("tasks/t1/start");
		expect(paths).toContain("tasks/t1/items");
		expect(paths).toContain("tasks/t1/finish");
		const start = calls.find((c) => c.path === "tasks/t1/start");
		expect(String(start?.body.nativeSessionId).startsWith("fake-")).toBe(true);
	});

	test("cancelled heartbeat finishes the task as cancelled", async () => {
		calls.length = 0;
		heartbeatCancelled = true;
		try {
			const finish = await executeClaimed(
				new PlaneClient(url, "test-token"),
				await config({ fake: FAKE }),
				{ ...TASK, prompt: "hang", leaseMs: 1500 },
			);
			const outcome = finish.outcome as string;
			const stopReason = finish.stopReason as string | undefined;
			expect(outcome).toBe("cancelled");
			expect(stopReason).toBe("cancelled");
			expect(calls.some((c) => c.path === "tasks/t1/heartbeat")).toBe(true);
		} finally {
			heartbeatCancelled = false;
		}
	});

	test("unconfigured harness fails with platform.harness_unavailable", async () => {
		const finish = await executeClaimed(
			new PlaneClient(url, "test-token"),
			await config({}),
			TASK,
		);
		const failureCode = finish.failureCode as string | undefined;
		const outcome = finish.outcome as string;
		expect(outcome).toBe("failed");
		expect(failureCode).toBe("platform.harness_unavailable");
	});

	test("runNode long-polls claims, runs the task, drains on abort", async () => {
		calls.length = 0;
		claimQueue.push(TASK);
		const ctl = new AbortController();
		const node = runNode(await config({ fake: FAKE }), {
			signal: ctl.signal,
		});
		const deadline = Date.now() + 60_000;
		while (
			!calls.some((c) => c.path === "tasks/t1/finish") &&
			Date.now() < deadline
		)
			await Bun.sleep(200);
		ctl.abort();
		await node; // must resolve: all in-flight work drained
		const firstClaim = calls.find((c) => c.path === "claim");
		expect(firstClaim?.body.waitMs).toBe(20000);
		expect(calls.some((c) => c.path === "tasks/t1/finish")).toBe(true);
	});
});
