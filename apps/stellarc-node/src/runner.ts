import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type {
	FailureCode,
	Item,
	ItemKind,
	TaskDescriptor,
} from "../../../packages/agents/src/protocol";

/** A locally installed harness the node is willing to launch. Credentials and
 * binaries stay on the node (D14/D16); the plane only learns the name. */
export interface HarnessSpec {
	readonly command: string;
	readonly args: ReadonlyArray<string>;
	readonly env?: Readonly<Record<string, string>>;
}

export interface RunHooks {
	readonly onStart: (nativeSessionId: string) => Promise<void>;
	readonly onItems: (items: ReadonlyArray<Item>) => Promise<void>;
	/** Resolves true when the plane says the task was cancelled. */
	readonly heartbeat: () => Promise<boolean>;
	readonly heartbeatMs: number;
	readonly workdir: string;
	readonly log?: (msg: string) => void;
}

export interface RunOutcome {
	readonly outcome: "completed" | "cancelled" | "failed";
	readonly stopReason?: string;
	readonly failureCode?: FailureCode;
	readonly failureMessage?: string;
}

const STOP: Record<string, RunOutcome> = {
	end_turn: { outcome: "completed", stopReason: "end_turn" },
	cancelled: { outcome: "cancelled", stopReason: "cancelled" },
	refusal: {
		outcome: "failed",
		stopReason: "refusal",
		failureCode: "agent_error.refusal",
	},
	max_tokens: {
		outcome: "failed",
		stopReason: "max_tokens",
		failureCode: "agent_error.max_tokens",
	},
	max_turn_requests: {
		outcome: "failed",
		stopReason: "max_turn_requests",
		failureCode: "agent_error.max_turn_requests",
	},
};

/** Folds ACP session/update notifications into transcript items (D22): parts
 * are transport-only, so consecutive message/thought chunks coalesce into one
 * item and flush when the stream changes kind. */
export class TranscriptFolder {
	private seq = 0;
	private open: {
		kind: "message" | "thinking";
		text: string;
		at: string;
	} | null = null;
	private ready: Item[] = [];

	private push(kind: ItemKind, body: unknown, at = new Date().toISOString()) {
		this.ready.push({ seq: this.seq++, kind, body, occurredAt: at });
	}
	private close() {
		if (!this.open) return;
		const { kind, text, at } = this.open;
		this.open = null;
		this.push(
			kind,
			kind === "message"
				? { role: "assistant", content: [{ type: "text", text }] }
				: { text, redacted: false, provider_opaque: false },
			at,
		);
	}
	private chunk(kind: "message" | "thinking", block: acp.ContentBlock) {
		const text = block.type === "text" ? block.text : `[${block.type}]`;
		if (this.open?.kind !== kind) {
			this.close();
			this.open = { kind, text: "", at: new Date().toISOString() };
		}
		this.open.text += text;
	}

	userPrompt(text: string) {
		this.push("message", { role: "user", content: [{ type: "text", text }] });
	}

	update(u: acp.SessionUpdate) {
		switch (u.sessionUpdate) {
			case "agent_message_chunk":
				return this.chunk("message", u.content);
			case "agent_thought_chunk":
				return this.chunk("thinking", u.content);
			case "user_message_chunk":
				return;
			case "tool_call":
				this.close();
				return this.push("tool_call", {
					call_id: u.toolCallId,
					title: u.title,
					kind: u.kind ?? "other",
					status: u.status ?? "pending",
					input: u.rawInput ?? null,
					locations: u.locations ?? [],
				});
			case "tool_call_update":
				if (u.status !== "completed" && u.status !== "failed") return;
				this.close();
				return this.push("tool_result", {
					call_id: u.toolCallId,
					status: u.status,
					is_error: u.status === "failed",
					title: u.title ?? null,
					content: u.content ?? [],
					output: u.rawOutput ?? null,
				});
			default:
				this.close();
				return this.push("harness_meta", { subtype: u.sessionUpdate, data: u });
		}
	}

	config(body: Record<string, unknown>) {
		this.close();
		this.push("config", body);
	}

	/** Drain completed items; `final` also closes the open chunk run. */
	take(final = false): Item[] {
		if (final) this.close();
		const out = this.ready;
		this.ready = [];
		return out;
	}
}

function pickPermission(
	options: ReadonlyArray<acp.PermissionOption>,
): acp.RequestPermissionResponse {
	// The node owner chose to run this agent unattended on their own machine;
	// harness-level sandboxing is the harness's business (D4).
	const allow =
		options.find((o) => o.kind === "allow_once") ??
		options.find((o) => o.kind === "allow_always");
	return allow
		? { outcome: { outcome: "selected", optionId: allow.optionId } }
		: { outcome: { outcome: "cancelled" } };
}

export async function runTask(
	task: TaskDescriptor,
	harness: HarnessSpec,
	hooks: RunHooks,
): Promise<RunOutcome> {
	await mkdir(hooks.workdir, { recursive: true });
	const folder = new TranscriptFolder();
	let child: ReturnType<typeof spawn>;
	try {
		child = spawn(harness.command, [...harness.args], {
			cwd: hooks.workdir,
			env: { ...process.env, ...harness.env },
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch (error) {
		return {
			outcome: "failed",
			failureCode: "platform.harness_unavailable",
			failureMessage: String(error),
		};
	}
	let stderrTail = "";
	child.stderr?.on("data", (d: Buffer) => {
		stderrTail = (stderrTail + d.toString()).slice(-2000);
	});
	const exited = new Promise<RunOutcome>((resolve) => {
		child.on("error", (error) =>
			resolve({
				outcome: "failed",
				failureCode: "platform.harness_unavailable",
				failureMessage: String(error),
			}),
		);
		child.on("exit", (code, signal) =>
			resolve({
				outcome: "failed",
				failureCode: "platform.harness_exited",
				failureMessage:
					`harness exited (code=${code}, signal=${signal}) ${stderrTail.slice(-500)}`.trim(),
			}),
		);
	});

	const stream = acp.ndJsonStream(
		Writable.toWeb(child.stdin as Writable) as WritableStream<Uint8Array>,
		Readable.toWeb(
			child.stdout as Readable,
		) as unknown as ReadableStream<Uint8Array>,
	);
	const conn = new acp.ClientSideConnection(
		() => ({
			sessionUpdate: async (n) => folder.update(n.update),
			requestPermission: async (p) => {
				folder.update({
					sessionUpdate: "tool_call_update",
					toolCallId: p.toolCall.toolCallId,
				} as acp.SessionUpdate);
				return pickPermission(p.options);
			},
		}),
		stream,
	);

	let flushing = Promise.resolve();
	const flush = (final = false) => {
		const items = folder.take(final);
		if (items.length) flushing = flushing.then(() => hooks.onItems(items));
		return flushing;
	};
	let sessionId: string | undefined;
	let cancelled = false;
	const flushTimer = setInterval(() => void flush().catch(() => {}), 500);
	const beat = setInterval(async () => {
		try {
			if ((await hooks.heartbeat()) && !cancelled) {
				cancelled = true;
				if (sessionId) await conn.cancel({ sessionId });
			}
		} catch (error) {
			hooks.log?.(`heartbeat failed: ${error}`);
		}
	}, hooks.heartbeatMs);

	const drive = (async (): Promise<RunOutcome> => {
		try {
			await conn.initialize({
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {
					fs: { readTextFile: false, writeTextFile: false },
				},
			});
			const session = await conn.newSession({
				cwd: hooks.workdir,
				mcpServers: task.agent.mcpServers.map((s) => ({
					name: s.name,
					command: s.command,
					args: [...s.args],
					env: [...s.env],
				})),
			});
			sessionId = session.sessionId;
			await hooks.onStart(session.sessionId);
			if (task.agent.model) {
				// BYO agents choose their own model; we only *request* one when the
				// harness advertises a model selector (ACP config options).
				const opt = session.configOptions?.find((o) => o.category === "model");
				let applied = false;
				if (opt && opt.type === "select") {
					try {
						await conn.setSessionConfigOption({
							sessionId: session.sessionId,
							configId: opt.id,
							value: task.agent.model,
						} as acp.SetSessionConfigOptionRequest);
						applied = true;
					} catch (error) {
						hooks.log?.(`model selection rejected: ${error}`);
					}
				}
				folder.config({ model: task.agent.model, applied });
			}
			const text = task.agent.instructions
				? `${task.agent.instructions}\n\n---\n\n${task.prompt}`
				: task.prompt;
			folder.userPrompt(text);
			if (cancelled) await conn.cancel({ sessionId: session.sessionId });
			const res = await conn.prompt({
				sessionId: session.sessionId,
				prompt: [{ type: "text", text }],
			});
			if (cancelled) return { outcome: "cancelled", stopReason: "cancelled" };
			return (
				STOP[res.stopReason] ?? {
					outcome: "failed",
					stopReason: res.stopReason,
					failureCode: "agent_error.prompt_failed",
				}
			);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: typeof error === "object"
						? JSON.stringify(error)
						: String(error);
			return {
				outcome: "failed",
				failureCode: "platform.protocol_error",
				failureMessage: `${message} ${stderrTail.slice(-500)}`
					.trim()
					.slice(0, 4000),
			};
		}
	})();

	let outcome = await Promise.race([drive, exited]);
	// A crashing harness closes stdout before 'exit' fires, so the ACP call
	// rejects first: give the exit a moment to win the attribution.
	if (outcome.failureCode === "platform.protocol_error") {
		const exit = await Promise.race([
			exited,
			new Promise<null>((r) => setTimeout(() => r(null), 500)),
		]);
		if (exit) outcome = exit;
	}
	clearInterval(flushTimer);
	clearInterval(beat);
	await flush(true).catch((error) =>
		hooks.log?.(`final flush failed: ${error}`),
	);
	child.kill("SIGTERM");
	const killer = setTimeout(() => child.kill("SIGKILL"), 3000);
	await Promise.race([exited, new Promise((r) => setTimeout(r, 3500))]);
	clearTimeout(killer);
	return cancelled && outcome.outcome !== "completed"
		? { outcome: "cancelled", stopReason: "cancelled" }
		: outcome;
}
