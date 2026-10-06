/* biome-ignore-all lint/suspicious/noExplicitAny: operator smoke script */
// Live smoke: real PG + agents plane + stellarc-node + a REAL local ACP harness.
// usage: bun tools/smoke-real-harness.ts <harness> [command args...]
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlaneClient, runNode } from "../apps/stellarc-node/src/main";
import { agentsHttp, staticOperatorAuth } from "../packages/agents/src/index";
import { migrate } from "../packages/db/src/migrate";
import { disposablePostgres } from "../tests/helpers/postgres";

const [harness = "hermes", ...cmd] = process.argv.slice(2);
const db = await disposablePostgres();
await migrate(db.sql);
const agents = agentsHttp(db.sql, { operatorAuth: staticOperatorAuth("op") });
const server = Bun.serve({
	port: 0,
	hostname: "127.0.0.1",
	idleTimeout: 45,
	fetch: (r) => agents.handler(r),
});
const url = server.url.origin;
const op = async (m: string, p: string, b?: unknown) =>
	(
		await fetch(`${url}/orgs/demo/v1/${p}`, {
			method: m,
			headers: {
				authorization: "Bearer op",
				"content-type": "application/json",
			},
			body: b ? JSON.stringify(b) : undefined,
		})
	).json() as Promise<any>;
const n = await op("POST", "nodes", { name: "talos" });
await new PlaneClient(url, n.token).call("hello", {
	version: "smoke",
	harnesses: [harness],
});
const a = await op("POST", "agents", {
	name: "byo",
	nodeId: n.node.id,
	harness,
});
const t = await op("POST", "tasks", {
	agentId: a.id,
	prompt:
		"Reply with exactly the single word PONG and nothing else. Do not use any tools.",
});
const ctl = new AbortController();
const spec = cmd.length ? { command: cmd[0], args: cmd.slice(1) } : undefined;
const node = runNode(
	{
		server: url,
		token: n.token,
		workRoot: await mkdtemp(join(tmpdir(), "smoke-")),
		concurrency: 1,
		harnesses: { [harness]: spec ?? { command: "hermes", args: ["acp"] } },
	},
	{ signal: ctl.signal, log: (m) => console.log("[node]", m) },
);
const end = Date.now() + 240_000;
let r: any;
while (Date.now() < end) {
	r = await op("GET", `tasks/${t.id}`);
	if (["completed", "failed", "cancelled"].includes(r.task.status)) break;
	await Bun.sleep(1000);
}
console.log(
	JSON.stringify(
		{
			status: r.task.status,
			stopReason: r.task.stopReason,
			failure: r.task.failureCode,
			msg: r.task.failureMessage?.slice(0, 400),
			native: r.task.nativeSessionId,
			items: r.items.map((i: any) => ({
				k: i.kind,
				b: JSON.stringify(i.body).slice(0, 160),
			})),
		},
		null,
		1,
	),
);
ctl.abort();
await node;
server.stop(true);
await agents.dispose();
await db.close();
process.exit(r.task.status === "completed" ? 0 : 1);
