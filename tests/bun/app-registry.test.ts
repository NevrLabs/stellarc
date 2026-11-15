import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { staticOperatorAuth } from "../../packages/agents/src/index";
import {
	appsHttp,
	FIRST_PARTY,
	installApps,
} from "../../packages/apps/src/index";
import { migrate } from "../../packages/db/src/migrate";
import { disposablePostgres } from "../helpers/postgres";

/**
 * App registry (ADR 0015 sequence step 1): manifests are installed plane-wide
 * at boot, activation is one row per org with the capabilities that org
 * ratified, and every change lands on that org's log with its actor.
 */

const OPERATOR = "test-operator-token";
// A cold disposable cluster can outlast bun's 5 s default.
setDefaultTimeout(60000);

const resources: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

async function plane() {
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await installApps(db.sql);
	const apps = appsHttp(db.sql, {
		operatorAuth: staticOperatorAuth(OPERATOR),
	});
	resources.push(apps.dispose);
	const call = async (
		method: string,
		path: string,
		body?: unknown,
		token: string | null = OPERATOR,
	) => {
		const request = new Request(`http://plane${path}`, {
			method,
			headers: {
				"content-type": "application/json",
				...(token ? { authorization: ["Bearer", token].join(" ") } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		expect(apps.matches(request)).toBe(true);
		const res = await apps.handler(request);
		// biome-ignore lint/suspicious/noExplicitAny: test JSON
		return { status: res.status, body: (await res.json()) as any };
	};
	const events = async (org: string) =>
		(
			await db.sql`
				SELECT plugin_type, actor, payload FROM event WHERE org = ${org} ORDER BY seq`
		).map((r) => ({ ...r }));
	const installed = async () =>
		(await db.sql`SELECT id, updated_at FROM app ORDER BY id`).map(
			(r) => `${r.id} ${r.updated_at.getTime()}`,
		);
	const writes = async () =>
		(
			await db.sql<{ n: number }[]>`
				SELECT (SELECT count(*) FROM app_activation)::int + (SELECT count(*) FROM event)::int AS n`
		)[0].n;
	return { db, apps, call, events, installed, writes };
}

test("first-party apps are installed; activation is per org, ratified, logged and idempotent", async () => {
	const p = await plane();
	expect(FIRST_PARTY.map((m) => m.id)).toEqual(["agents", "gateway"]);
	const before = await p.installed();
	expect(before).toHaveLength(2);
	await installApps(p.db.sql); // a second boot rewrites nothing
	expect(await p.installed()).toEqual(before);

	const listed = await p.call("GET", "/orgs/acme/v1/apps");
	expect(listed.status).toBe(200);
	expect(listed.body.apps).toEqual([
		{
			id: "agents",
			name: "Agents",
			runs: "server",
			capabilities: ["session:drive"],
			active: false,
			granted: [],
		},
		{
			id: "gateway",
			name: "Gateway",
			runs: "service",
			capabilities: [],
			active: false,
			granted: [],
		},
	]);

	const on = { capabilities: ["session:drive", "session:drive"] };
	for (const _ of [1, 2]) {
		const r = await p.call("POST", "/orgs/acme/v1/apps/agents/activate", on);
		expect(r.status).toBe(200);
		expect(r.body).toEqual({ active: true, granted: ["session:drive"] });
	}
	const agentsOf = async (org: string) =>
		(await p.call("GET", `/orgs/${org}/v1/apps`)).body.apps[0];
	expect(await agentsOf("acme")).toMatchObject({
		active: true,
		granted: ["session:drive"],
	});
	// Another org sees the same install and none of acme's activation.
	expect(await agentsOf("globex")).toMatchObject({
		active: false,
		granted: [],
	});
	expect(await p.events("globex")).toEqual([]);

	// Ratifying less is a change; switching off twice is one change.
	await p.call("POST", "/orgs/acme/v1/apps/agents/activate", {
		capabilities: [],
	});
	expect(await agentsOf("acme")).toMatchObject({ active: true, granted: [] });
	for (const _ of [1, 2]) {
		const r = await p.call("POST", "/orgs/acme/v1/apps/agents/deactivate");
		expect(r.body).toEqual({ active: false, granted: [] });
	}
	expect(await agentsOf("acme")).toMatchObject({ active: false, granted: [] });
	expect(await p.events("acme")).toEqual([
		{
			plugin_type: "apps:activated",
			actor: "operator",
			payload: { appId: "agents", capabilities: ["session:drive"] },
		},
		{
			plugin_type: "apps:activated",
			actor: "operator",
			payload: { appId: "agents", capabilities: [] },
		},
		{
			plugin_type: "apps:deactivated",
			actor: "operator",
			payload: { appId: "agents" },
		},
	]);
});

test("refusals write nothing: no token, wrong token, bad org, unknown app, capability the app never asked for, model:call", async () => {
	const p = await plane();
	const activate = "/orgs/acme/v1/apps/agents/activate";
	const ok = { capabilities: ["session:drive"] };
	const cases: Array<[number, string, string, unknown?, (string | null)?]> = [
		[401, "GET", "/orgs/acme/v1/apps", undefined, null],
		[403, "GET", "/orgs/acme/v1/apps", undefined, "not-the-token"],
		[401, "POST", activate, ok, null],
		[403, "POST", activate, ok, "not-the-token"],
		[400, "GET", "/orgs/-bad/v1/apps"],
		[404, "POST", "/orgs/acme/v1/apps/nope/activate", ok],
		[404, "POST", `${activate}/again`, ok],
		[404, "DELETE", "/orgs/acme/v1/apps/agents"],
		[400, "POST", activate, {}],
		[400, "POST", activate, { capabilities: ["repo:write"] }],
		[400, "POST", activate, { capabilities: ["model:call"] }],
		// The Gateway asks for nothing, so nothing can be ratified for it.
		[400, "POST", "/orgs/acme/v1/apps/gateway/activate", ok],
	];
	for (const [status, method, path, body, token] of cases)
		expect(
			(await p.call(method, path, body, token)).status,
			`${method} ${path}`,
		).toBe(status);
	expect(await p.writes()).toBe(0);
	expect(p.apps.matches(new Request("http://plane/orgs/acme/v1/agents"))).toBe(
		false,
	);
});

test("the manifest is the ceiling: a capability it stops asking for is no longer granted, and model:call never installs", async () => {
	const p = await plane();
	await p.call("POST", "/orgs/acme/v1/apps/agents/activate", {
		capabilities: ["session:drive"],
	});
	await installApps(p.db.sql, [{ ...FIRST_PARTY[0], capabilities: [] }]);
	const [agents] = (await p.call("GET", "/orgs/acme/v1/apps")).body.apps;
	expect(agents).toMatchObject({ active: true, capabilities: [], granted: [] });
	await expect(
		installApps(p.db.sql, [
			{
				id: "rogue",
				name: "Rogue",
				runs: "service",
				capabilities: ["model:call"],
			},
		]),
	).rejects.toThrow();
	expect(await p.db.sql`SELECT 1 FROM app WHERE id = 'rogue'`).toHaveLength(0);
});
