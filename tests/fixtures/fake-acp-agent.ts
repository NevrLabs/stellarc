#!/usr/bin/env bun
// Minimal ACP agent for tests. Behaviour is chosen by the first word of the
// prompt's last line: "echo <text>" | "tool" | "refuse" | "crash" | "hang".
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const stream = acp.ndJsonStream(
	Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
	Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
);
const cancelled = new Set<string>();
let counter = 0;

new acp.AgentSideConnection(
	(conn) => ({
		initialize: async () => ({
			protocolVersion: acp.PROTOCOL_VERSION,
			agentCapabilities: { loadSession: false },
		}),
		newSession: async (p) => ({
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
		}),
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
