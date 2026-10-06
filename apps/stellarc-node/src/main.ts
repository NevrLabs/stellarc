import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	Finish,
	Item,
	TaskDescriptor,
} from "../../../packages/agents/src/protocol";
import { type HarnessSpec, runTask } from "./runner";

/** stellarc-node: the bring-your-own-agent runtime. Runs on the agent owner's
 * machine, holds harness binaries + credentials, pulls tasks routed to agents
 * bound to this node, drives them over ACP, and reports claims back (D14). */

export interface NodeConfig {
	readonly server: string;
	readonly token: string;
	readonly workRoot: string;
	readonly concurrency: number;
	readonly harnesses: Readonly<Record<string, HarnessSpec>>;
}

/** Well-known ACP launchers, used when the node config names a harness without
 * a command. Each entry is just a local default; owners may override any. */
export const KNOWN_HARNESSES: Readonly<Record<string, HarnessSpec>> = {
	hermes: { command: "hermes", args: ["acp"] },
	goose: { command: "goose", args: ["acp"] },
	"claude-code": {
		command: "npx",
		args: ["-y", "@zed-industries/claude-code-acp"],
	},
	codex: { command: "npx", args: ["-y", "@zed-industries/codex-acp"] },
	gemini: { command: "gemini", args: ["--experimental-acp"] },
	opencode: { command: "opencode", args: ["acp"] },
};

export async function loadConfig(path?: string): Promise<NodeConfig> {
	const file =
		path ??
		process.env.STELLARC_NODE_CONFIG ??
		join(homedir(), ".config", "stellarc", "node.json");
	const raw = JSON.parse(await readFile(file, "utf8")) as {
		server: string;
		token?: string;
		tokenEnv?: string;
		workRoot?: string;
		concurrency?: number;
		harnesses: Record<string, Partial<HarnessSpec> | null>;
	};
	const token =
		raw.token ??
		(raw.tokenEnv ? process.env[raw.tokenEnv] : undefined) ??
		process.env.STELLARC_NODE_TOKEN;
	if (!token)
		throw new Error(
			"node token missing (token, tokenEnv or STELLARC_NODE_TOKEN)",
		);
	const harnesses: Record<string, HarnessSpec> = {};
	for (const [name, spec] of Object.entries(raw.harnesses)) {
		const base = KNOWN_HARNESSES[name];
		const command = spec?.command ?? base?.command;
		if (!command) throw new Error(`harness "${name}" needs a command`);
		harnesses[name] = {
			command,
			args: spec?.args ?? (spec?.command ? [] : (base?.args ?? [])),
			env: spec?.env,
		};
	}
	return {
		server: raw.server.replace(/\/$/, ""),
		token,
		workRoot:
			raw.workRoot ??
			join(homedir(), ".local", "share", "stellarc-node", "work"),
		concurrency: raw.concurrency ?? 2,
		harnesses,
	};
}

export class PlaneClient {
	constructor(
		private readonly server: string,
		private readonly token: string,
	) {}
	async call<T>(
		path: string,
		body: unknown,
		signal?: AbortSignal,
	): Promise<T | null> {
		const res = await fetch(`${this.server}/v1/node/${path}`, {
			method: "POST",
			signal,
			headers: {
				authorization: `Bearer ${this.token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		});
		if (res.status === 204) return null;
		const text = await res.text();
		if (!res.ok) throw new PlaneError(res.status, text);
		return JSON.parse(text) as T;
	}
}
export class PlaneError extends Error {
	constructor(
		readonly status: number,
		readonly body: string,
	) {
		super(`plane ${status}: ${body.slice(0, 300)}`);
	}
}

export async function executeClaimed(
	plane: PlaneClient,
	config: NodeConfig,
	task: TaskDescriptor,
	log: (m: string) => void = () => {},
): Promise<Finish> {
	const base = { attempt: task.attempt };
	const harness = config.harnesses[task.agent.harness];
	let finish: Finish;
	if (!harness) {
		finish = {
			...base,
			outcome: "failed",
			failureCode: "platform.harness_unavailable",
			failureMessage: `harness "${task.agent.harness}" not configured on this node`,
		};
	} else {
		const result = await runTask(task, harness, {
			workdir: join(config.workRoot, task.org, task.agent.name, task.id),
			heartbeatMs: Math.max(1000, Math.floor(task.leaseMs / 3)),
			log,
			onStart: async (nativeSessionId) => {
				await plane.call(`tasks/${task.id}/start`, {
					...base,
					nativeSessionId,
				});
			},
			onItems: async (items: ReadonlyArray<Item>) => {
				await plane.call(`tasks/${task.id}/items`, { ...base, items });
			},
			heartbeat: async () =>
				(
					await plane.call<{ cancelled: boolean }>(
						`tasks/${task.id}/heartbeat`,
						base,
					)
				)?.cancelled ?? false,
		});
		finish = { ...base, ...result };
	}
	await plane.call(`tasks/${task.id}/finish`, finish);
	return finish;
}

export async function runNode(
	config: NodeConfig,
	options: {
		signal?: AbortSignal;
		log?: (m: string) => void;
		version?: string;
	} = {},
) {
	const log = options.log ?? (() => {});
	const plane = new PlaneClient(config.server, config.token);
	await plane.call("hello", {
		version: options.version ?? "0.1.0",
		harnesses: Object.keys(config.harnesses),
	});
	log(
		`connected to ${config.server}; harnesses: ${Object.keys(config.harnesses).join(", ")}`,
	);
	const running = new Set<Promise<unknown>>();
	let backoff = 1000;
	while (!options.signal?.aborted) {
		if (running.size >= config.concurrency) {
			await Promise.race(running);
			continue;
		}
		let claimed: { task: TaskDescriptor } | null;
		try {
			claimed = await plane.call<{ task: TaskDescriptor }>(
				"claim",
				{ waitMs: 20000 },
				options.signal,
			);
			backoff = 1000;
		} catch (error) {
			if (options.signal?.aborted) break;
			log(`claim failed: ${error}; retrying in ${backoff}ms`);
			await new Promise((r) => setTimeout(r, backoff));
			backoff = Math.min(backoff * 2, 30000);
			continue;
		}
		if (!claimed) continue;
		const { task } = claimed;
		log(
			`task ${task.id} attempt ${task.attempt} → ${task.agent.name} (${task.agent.harness})`,
		);
		const p = executeClaimed(plane, config, task, log)
			.then((f) =>
				log(
					`task ${task.id} ${f.outcome}${f.failureCode ? ` (${f.failureCode})` : ""}`,
				),
			)
			.catch((error) => log(`task ${task.id} report failed: ${error}`))
			.finally(() => running.delete(p));
		running.add(p);
	}
	await Promise.allSettled(running);
}

if (import.meta.main) {
	const config = await loadConfig(process.argv[2]);
	const controller = new AbortController();
	process.on("SIGINT", () => controller.abort());
	process.on("SIGTERM", () => controller.abort());
	await runNode(config, {
		signal: controller.signal,
		log: (m) => console.log(`[stellarc-node] ${new Date().toISOString()} ${m}`),
	});
}
