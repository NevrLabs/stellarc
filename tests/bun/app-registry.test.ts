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

	// Two identical calls at once, then a third: one row, one event.
	const on = { capabilities: ["session:drive", "session:drive"] };
	const activate = () =>
		p.call("POST", "/orgs/acme/v1/apps/agents/activate", on);
	for (const r of [
		...(await Promise.all([activate(), activate()])),
		await activate(),
	]) {
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
	await p.call("POST", "/orgs/globex/v1/apps/agents/activate", on);
	const globexLog = await p.events("globex");
	expect(globexLog).toHaveLength(1);

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
	// Switching acme off left globex on, with its log untouched.
	expect(await agentsOf("globex")).toMatchObject({
		active: true,
		granted: ["session:drive"],
	});
	expect(await p.events("globex")).toEqual(globexLog);
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
	const deactivate = "/orgs/acme/v1/apps/agents/deactivate";
	const ok = { capabilities: ["session:drive"] };
	// One existing activation, so a refused deactivate has something to remove.
	expect((await p.call("POST", activate, ok)).status).toBe(200);
	const before = await p.writes();
	expect(before).toBe(2);
	const cases: Array<[number, string, string, unknown?, (string | null)?]> = [
		[401, "GET", "/orgs/acme/v1/apps", undefined, null],
		[403, "GET", "/orgs/acme/v1/apps", undefined, "not-the-token"],
		// Same length in characters as the real token, longer in bytes.
		[403, "GET", "/orgs/acme/v1/apps", undefined, "test-operator-tok\u00e9n"],
		[401, "POST", activate, ok, null],
		[403, "POST", activate, ok, "not-the-token"],
		[401, "POST", deactivate, undefined, null],
		[403, "POST", deactivate, undefined, "not-the-token"],
		// Auth comes before any lookup: no token learns nothing about an app.
		[401, "POST", "/orgs/acme/v1/apps/nope/activate", ok, null],
		[401, "POST", "/orgs/acme/v1/apps/nope/deactivate", undefined, null],
		[401, "POST", activate, { capabilities: "not-a-list" }, null],
		[400, "GET", "/orgs/-bad/v1/apps"],
		[404, "POST", "/orgs/acme/v1/apps/nope/activate", ok],
		[404, "POST", "/orgs/acme/v1/apps/nope/deactivate"],
		[404, "POST", `${activate}/again`, ok],
		[404, "DELETE", "/orgs/acme/v1/apps/agents"],
		[400, "POST", activate, {}],
		[400, "POST", activate, { capabilities: ["repo:write"] }],
		[400, "POST", activate, { capabilities: ["model:call"] }],
		[400, "POST", activate, { capabilities: Array(65).fill("session:drive") }],
		// The Gateway asks for nothing, so nothing can be ratified for it.
		[400, "POST", "/orgs/acme/v1/apps/gateway/activate", ok],
	];
	for (const [status, method, path, body, token] of cases)
		expect(
			(await p.call(method, path, body, token)).status,
			`${method} ${path}`,
		).toBe(status);
	expect(await p.writes()).toBe(before);
	expect(p.apps.matches(new Request("http://plane/orgs/acme/v1/agents"))).toBe(
		false,
	);
});

test("a manifest that stops asking for a capability narrows each org's grant on its log; asking again needs a new ratification; bad manifests install nothing", async () => {
	const p = await plane();
	const on = { capabilities: ["session:drive"] };
	await p.call("POST", "/orgs/acme/v1/apps/agents/activate", on);
	const agents = async () =>
		(await p.call("GET", "/orgs/acme/v1/apps")).body.apps[0];

	await installApps(p.db.sql, [{ ...FIRST_PARTY[0], capabilities: [] }]);
	expect(await agents()).toMatchObject({
		active: true,
		capabilities: [],
		granted: [],
	});
	const narrowed = [
		{
			plugin_type: "apps:activated",
			actor: "operator",
			payload: { appId: "agents", capabilities: ["session:drive"] },
		},
		{
			plugin_type: "apps:activated",
			actor: "plane",
			payload: { appId: "agents", capabilities: [] },
		},
	];
	expect(await p.events("acme")).toEqual(narrowed);

	// The manifest asks again (a rollback): the org's old yes does not return.
	await installApps(p.db.sql);
	expect(await agents()).toMatchObject({
		active: true,
		capabilities: ["session:drive"],
		granted: [],
	});
	expect(await p.events("acme")).toEqual(narrowed);

	const fine = {
		id: "extra",
		name: "Extra",
		runs: "service",
		capabilities: [],
	};
	// Every manifest is checked before any is written.
	for (const bad of [
		{ ...fine, id: "rogue", capabilities: ["model:call"] },
		{ ...fine, id: "rogue", capabilities: ["model:calls"] },
		{ ...fine, id: "apps" },
		{ ...fine, id: "foundation" },
	])
		await expect(installApps(p.db.sql, [fine, bad])).rejects.toThrow();
	expect(await p.installed()).toHaveLength(2);
});

test("a retried transaction keeps row and log in step: a drifted event counter heals and the activation is logged once", async () => {
	const p = await plane();
	// The counter sits at 0 while seq 1 is taken, so the first append collides
	// and the whole body runs again after the heal.
	await p.db.sql`INSERT INTO org_event_counter(org) VALUES ('acme')`;
	await p.db.sql`
		INSERT INTO event(org, seq, plugin_type, actor, payload, schema_version, txid)
		VALUES ('acme', 1, 'apps:drift-seed', 'operator', '{}', 1, pg_current_xact_id()::text::bigint)`;
	const r = await p.call("POST", "/orgs/acme/v1/apps/agents/activate", {
		capabilities: ["session:drive"],
	});
	expect(r.status).toBe(200);
	expect((await p.events("acme")).map((e) => e.plugin_type)).toEqual([
		"apps:drift-seed",
		"apps:activated",
	]);
	expect(
		await p.db.sql`SELECT 1 FROM app_activation WHERE org = 'acme'`,
	).toHaveLength(1);
});
