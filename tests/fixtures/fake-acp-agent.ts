#!/usr/bin/env bun
// Minimal ACP agent for tests. Behaviour is chosen by the first word of the
// prompt's last line: "echo <text>" | "tool" | "refuse" | "crash" | "hang" |
// "spend" | "push <bare-repo-path>". Git identity comes from the harness
// environment: the agent is the committer (attribution target, NEVR-199).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const GIT_ID = [
	"-c",
	"user.name=fake-agent",
	"-c",
	"user.email=agent@fake.test",
];

function sh(cwd: string, cmd: string, args: string[]) {
	execFileSync(cmd, args, { cwd, stdio: "ignore" });
}

// "push <bare-path>": clone the bare repo unless a checkout already exists
// (retries reuse the workdir), commit as the agent, push — the fact the node
// must attribute. "pushcrash" does the same and then exits nonzero;
// "pushsecret" rewrites the remote URL to embed credentials after pushing
// (NEVR-199 P4: the secret must never leave the node).
function pushVerb(bare: string, mode: "push" | "pushcrash" | "pushsecret") {
	if (!existsSync("repo")) sh(".", "git", ["clone", "--quiet", bare, "repo"]);
	sh("repo", "git", [
		...GIT_ID,
		"commit",
		"--quiet",
		"--allow-empty",
		"-m",
		"agent work",
	]);
	sh("repo", "git", ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
	if (mode === "pushcrash") process.exit(3);
	if (mode === "pushsecret")
		sh("repo", "git", [
			"remote",
			"set-url",
			"origin",
			"https://user:sekrit@github.com/org/repo.git",
		]);
}

const stream = acp.ndJsonStream(
	Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
	Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
);
const cancelled = new Set<string>();
let counter = 0;
// MCP servers the plane configured for the current session (captured at
// session/new; a harness launches these as its own children).
let sessionMcpServers: Array<{
	name: string;
	command: string;
	args?: Array<string>;
	env?: Array<{ name: string; value: string }>;
}> = [];

new acp.AgentSideConnection(
	(conn) => ({
		initialize: async () => ({
			protocolVersion: acp.PROTOCOL_VERSION,
			agentCapabilities: { loadSession: false },
		}),
		newSession: async (p) => {
			sessionMcpServers = p.mcpServers as typeof sessionMcpServers;
			return {
				sessionId: `fake-${++counter}`,
				configOptions: [
					{
						id: "model",
						name: "Model",
						category: "model",
						type: "select",
						currentValue: "fake-small",
						options: [
							{ value: "fake-small", name: "small" },
							{ value: "fake-large", name: "large" },
						],
					},
				],
				_meta: { mcpServers: p.mcpServers.map((s) => s.name) },
			};
		},
		setSessionConfigOption: async () => ({ configOptions: [] }),
		authenticate: async () => ({}),
		cancel: async (p) => {
			cancelled.add(p.sessionId);
		},
		prompt: async (p) => {
			const text = p.prompt
				.map((b) => (b.type === "text" ? b.text : ""))
				.join("")
				.trim()
				.split("\n")
				.pop() as string;
			const [verb, ...rest] = text.split(" ");
			const say = (t: string) =>
				conn.sessionUpdate({
					sessionId: p.sessionId,
					update: {
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text: t },
					},
				});
			if (verb === "crash") process.exit(3);
			if (verb === "refuse") return { stopReason: "refusal" };
			if (verb === "hang") {
				while (!cancelled.has(p.sessionId))
					await new Promise((r) => setTimeout(r, 50));
				return { stopReason: "cancelled" };
			}
			if (verb === "push" || verb === "pushcrash" || verb === "pushsecret") {
				// NEVR-199: clone the bare repo (reused across attempts), commit
				// as the agent, push — the fact the node must attribute.
				const bare = rest[0];
				if (!bare) return { stopReason: "refusal" };
				const mode =
					verb === "push"
						? "push"
						: verb === "pushcrash"
							? "pushcrash"
							: "pushsecret";
				pushVerb(bare, mode);
				await say("pushed");
				return { stopReason: "end_turn" };
			}
			if (verb === "pushhang") {
				// Push, then hang until cancelled (NEVR-199 P5: pushes recorded
				// even on a cancelled finish).
				const bare = rest[0];
				if (!bare) return { stopReason: "refusal" };
				pushVerb(bare, "push");
				while (!cancelled.has(p.sessionId))
					await new Promise((r) => setTimeout(r, 50));
				return { stopReason: "cancelled" };
			}
			if (verb === "env") {
				// Env-isolation probe (NEVR-198): report the child env as tool
				// output — the test asserts STELLARC_* never reaches us.
				const stellarc = Object.keys(process.env).filter((k) =>
					k.startsWith("STELLARC"),
				);
				const seen: Record<string, string | undefined> = {};
				for (const k of [
					"PATH",
					"HOME",
					"TMPDIR",
					"LANG",
					"STELLARC_NODE_TOKEN",
				])
					seen[k] = process.env[k];
				await say(
					JSON.stringify({ stellarcKeys: stellarc, env: seen, mcpNames: [] }),
				);
				return { stopReason: "end_turn" };
			}
			if (verb === "mcp-env") {
				// Launch the MCP servers the plane actually configured for this
				// session (captured at session/new) the way a harness does: child
				// processes inheriting the harness's own env plus the declared
				// entries. Each probe prints its observable env keys; the test
				// asserts no STELLARC_* leaks into the MCP descendants either.
				const names: string[] = [];
				for (const s of sessionMcpServers) {
					names.push(s.name);
					const proc = Bun.spawn({
						cmd: [s.command, ...(s.args ?? [])],
						env: {
							...process.env,
							...Object.fromEntries(
								(s.env ?? []).map((e) => [e.name, e.value]),
							),
						},
						stdout: "pipe",
					});
					const out = await new Response(proc.stdout).text();
					await proc.exited;
					await say(`${s.name}:${out.trim()}`);
				}
				if (names.length === 0) await say("no-mcp-servers");
				return { stopReason: "end_turn" };
			}
			if (verb === "perm-park") {
				// Permission-parking harness (NEVR-198): requests permission with
				// a resolved (non-template) argument; a grant must continue the
				// SAME session to completion, a reject must end the turn.
				const ask = async (toolCallId: string, toolName: string) => {
					await conn.sessionUpdate({
						sessionId: p.sessionId,
						update: {
							sessionUpdate: "tool_call",
							toolCallId,
							title: `Run ${toolName}`,
							kind: "execute",
							status: "pending",
							name: toolName,
							rawInput: { target: "prod", force: true },
						},
					});
					const perm = await conn.requestPermission({
						sessionId: p.sessionId,
						toolCall: {
							toolCallId,
							title: `Run ${toolName}`,
							name: toolName,
							rawInput: { target: "prod", force: true },
						},
						options: [
							{ optionId: "yes", name: "Allow", kind: "allow_once" },
							{
								optionId: "always",
								name: "Always allow",
								kind: "allow_always",
							},
							{ optionId: "no", name: "Reject", kind: "reject_once" },
						],
					});
					const picked =
						perm.outcome.outcome === "selected"
							? perm.outcome.optionId
							: "none";
					await conn.sessionUpdate({
						sessionId: p.sessionId,
						update: {
							sessionUpdate: "tool_call_update",
							toolCallId,
							status: "completed",
							rawOutput: { picked },
						},
					});
					return picked;
				};
				if (rest[0] === "twice") {
					// Two sequential parked requests (NEVR-201 defect 1): each
					// needs its own verdict — one grant must not approve the
					// second, and neither may leak into the other.
					const first = await ask("call-park-1", "deploy");
					const second = await ask("call-park-2", "destroy");
					await say(`picked:${first},${second}`);
					return { stopReason: "end_turn" };
				}
				const picked = await ask("call-park", "deploy");
				if (picked !== "yes" && picked !== "always") {
					await say(`rejected:${picked}`);
					return { stopReason: "end_turn" };
				}
				await say("granted-and-ran");
				return { stopReason: "end_turn" };
			}
			if (verb === "spend") {
				// Usage-reporting harness: emits an UNSTABLE usage_update mid-run and
				// token totals at finish (NEVR-178 capture path).
				await conn.sessionUpdate({
					sessionId: p.sessionId,
					update: {
						sessionUpdate: "usage_update",
						used: 1200,
						size: 200000,
						cost: { amount: 0.42, currency: "USD" },
					},
				});
				return {
					stopReason: "end_turn",
					usage: {
						totalTokens: 1500,
						inputTokens: 1000,
						outputTokens: 500,
						thoughtTokens: 50,
						cachedReadTokens: 200,
						cachedWriteTokens: 0,
					},
				};
			}
			await conn.sessionUpdate({
				sessionId: p.sessionId,
				update: {
					sessionUpdate: "agent_thought_chunk",
					content: { type: "text", text: "thinking..." },
				},
			});
			if (verb === "tool") {
				await conn.sessionUpdate({
					sessionId: p.sessionId,
					update: {
						sessionUpdate: "tool_call",
						toolCallId: "call-1",
						title: "List files",
						kind: "execute",
						status: "pending",
						rawInput: { command: "ls" },
					},
				});
				const perm = await conn.requestPermission({
					sessionId: p.sessionId,
					toolCall: { toolCallId: "call-1", title: "List files" },
					options: [
						{ optionId: "yes", name: "Allow", kind: "allow_once" },
						{ optionId: "no", name: "Reject", kind: "reject_once" },
					],
				});
				await conn.sessionUpdate({
					sessionId: p.sessionId,
					update: {
						sessionUpdate: "tool_call_update",
						toolCallId: "call-1",
						status: "completed",
						rawOutput: {
							permission:
								perm.outcome.outcome === "selected"
									? perm.outcome.optionId
									: "none",
						},
					},
				});
			}
			await say("Hello, ");
			await say(rest.join(" ") || "done");
			return { stopReason: "end_turn" };
		},
	}),
	stream,
);
