import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import postgres from "postgres";
import { gatewayAuth } from "../../../packages/core-auth/src/auth";
import { bindIdentity } from "../../../packages/core-auth/src/database";
import {
	gatewaySchema,
	gatewayStore,
} from "../../../packages/core-auth/src/store";
import { gatewayApp } from "./main";

// Real socket + disposable PG + local OTLP sink. NO live OIDC or inference.
const origin = "https://gateway.invalid";
const issuer = "https://issuer.invalid";
const ownerDsn = process.env.SPIKE_OWNER_DSN;
if (typeof ownerDsn !== "string" || !ownerDsn)
	throw new Error("SPIKE_OWNER_DSN required");
const owner = postgres(ownerDsn, {
	max: 3,
	onnotice: () => {},
});
const pool = new Pool({
	connectionString: process.env.SPIKE_OWNER_DSN,
	max: 2,
});
await owner.unsafe(gatewaySchema);
await bindIdentity(owner, issuer, "fixture", true);
const config = {
	origin,
	issuer,
	clientId: "fixture",
	clientSecret: "fixture-secret",
	secret: "fixture-secret-long-enough-for-library-checks",
	database: pool,
	authorizationEndpoint: `${issuer}/authorize`,
	tokenEndpoint: `${issuer}/token`,
	jwksUri: `${issuer}/keys`,
	audit: gatewayStore(owner).securityEvent,
	approved: gatewayStore(owner).human,
};
console.log("STAGE schema");
await (await getMigrations(gatewayAuth(config).auth.options)).runMigrations();
console.log("STAGE auth migrated");
await pool.end();
// Library migration may retain the supplied pool; subsequent app has its own pool.
await gatewayStore(owner).bootstrap("operator", "approved-sub", "alpha");
await owner`CREATE ROLE gateway_runtime LOGIN PASSWORD 'disposable-only'`;
await owner`GRANT USAGE ON SCHEMA public TO gateway_runtime`;
await owner`GRANT SELECT,INSERT,UPDATE ON gw_principal,gw_credential,gw_delegation,gw_run,gw_audit_state TO gateway_runtime`;
await owner`GRANT SELECT ON gw_installation,gw_identity_binding TO gateway_runtime`;
await owner`GRANT SELECT,INSERT ON gw_audit TO gateway_runtime`;
await owner`GRANT SELECT,INSERT,UPDATE,DELETE ON "user",account,session,verification TO gateway_runtime`;
const sinkMode = "ok";
const batches: unknown[] = [];
const sink = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		const data = await request.json();
		batches.push(data);
		return sinkMode === "ok"
			? Response.json({})
			: Response.json({ partialSuccess: null });
	},
});
const app = await gatewayApp({
	GATEWAY_ORIGIN: origin,
	GATEWAY_OIDC_ISSUER: issuer,
	GATEWAY_OIDC_CLIENT: "fixture",
	GATEWAY_OIDC_SECRET: "fixture-secret",
	GATEWAY_AUTH_SECRET: config.secret,
	GATEWAY_OIDC_AUTHORIZE: config.authorizationEndpoint,
	GATEWAY_OIDC_TOKEN: config.tokenEndpoint,
	GATEWAY_OIDC_JWKS: config.jwksUri,
	GATEWAY_DATABASE_URL: process.env.SPIKE_RUNTIME_DSN,
	OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${sink.port}`,
});
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	idleTimeout: 40,
	fetch: (request) => {
		const url = new URL(request.url);
		return app.handler(
			new Request(origin + url.pathname + url.search, request),
		);
	},
});
const base = `http://127.0.0.1:${server.port}`;
const checks: string[] = [];
const pass = (s: string) => {
	checks.push(s);
	console.log(`PASS ${s}`);
};
const raw = await app.store
	.createAgent("operator", ["llm:stream", "mcp:status"])
	.then((id) => app.store.issue("operator", id));
const headers = {
	authorization: `Bearer ${raw.raw}`,
	"content-type": "application/json",
};
try {
	for (const path of [
		"/auth/login",
		"/api/auth/get-session",
		"/api/auth/oauth2/callback/zitadel?code=bad&state=bad",
	]) {
		const response = await fetch(base + path, {
			redirect: "manual",
			...(path === "/auth/login"
				? {
						method: "POST",
						headers: { origin, "content-type": "application/json" },
						body: "{}",
					}
				: {}),
		});
		assert.equal(response.headers.get("cache-control"), "no-store", path);
		assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
		assert.equal(
			response.headers.get("x-content-type-options"),
			"nosniff",
			path,
		);
		if (path === "/auth/login")
			assert.ok(response.headers.getSetCookie().length > 0);
		await response.text();
	}
	pass("auth-responses-preserve-cookies-and-common-security-headers");
	if (process.env.SLOW_BODY_CHECK === "1") {
		const sockets: ReturnType<typeof createConnection>[] = [];
		try {
			const responses = Array.from(
				{ length: 8 },
				(_, n) =>
					new Promise<string>((resolve, reject) => {
						const socket = createConnection({
							host: "127.0.0.1",
							port: server.port ?? 0,
						});
						sockets.push(socket);
						let text = "";
						socket.setTimeout(35000, () =>
							reject(new Error("slow-body deadline did not release request")),
						);
						socket.on("error", reject);
						socket.on("data", (chunk) => {
							text += chunk.toString();
							if (text.includes("\r\n\r\n")) resolve(text);
						});
						socket.on("connect", () =>
							socket.write(
								`POST ${n < 4 ? "/api/auth/sign-out" : "/orgs/alpha/v1/chat/completions"} HTTP/1.1\r\nHost: gateway.invalid\r\nOrigin: ${origin}\r\nAuthorization: Bearer ${raw.raw}\r\nContent-Type: application/json\r\nContent-Length: 10000\r\nConnection: close\r\n\r\n{`,
							),
						);
					}),
			);
			const result = await Promise.all(responses);
			assert.ok(
				result.every((text) => /^HTTP\/1\.1 408 /.test(text)),
				"all slow auth and LLM bodies must hit server deadline",
			);
			assert.equal((await fetch(`${base}/manage/status`)).status, 401);
			pass("slow-body-socket-deadlines-release-all-auth-and-llm-slots");
		} finally {
			for (const socket of sockets) socket.destroy();
		}
	}
	assert.equal((await fetch(`${base}/manage/status`)).status, 401);
	assert.equal(
		(await fetch(`${base}/api/auth/sign-up/email`, { method: "POST" })).status,
		404,
	);
	assert.equal(
		(
			await fetch(`${base}/auth/login`, {
				method: "POST",
				headers: { origin: "https://evil.invalid" },
			})
		).status,
		403,
	);
	const managementDenial =
		await owner`SELECT count(*)::int AS n FROM gw_audit WHERE kind='management.deny' AND org='system' AND actor='anonymous'`;
	assert.ok(
		managementDenial[0].n >= 1,
		"management denial must be durably audited",
	);
	pass("socket-public-management-denial-no-registration");
	const stream = await fetch(`${base}/orgs/alpha/v1/chat/completions`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: "local-fixture",
			stream: true,
			messages: [],
		}),
	});
	assert.equal(stream.status, 200);
	assert.match(await stream.text(), /fixture-3/);
	const run = stream.headers.get("x-stellarc-run-id");
	if (typeof run !== "string") throw new Error("run id missing");
	assert.match(run, /^[a-f0-9-]{36}$/);
	const ended = await owner`SELECT outcome FROM gw_run WHERE id=${run}`;
	assert.equal(ended[0].outcome, "completed");
	const terminal =
		await owner`SELECT payload FROM gw_audit WHERE kind='call.completed' AND payload->>'run'=${run}`;
	assert.equal(terminal.length, 1);
	assert.equal(terminal[0].payload.usage, "unavailable");
	const traceId = stream.headers.get("x-trace-id");
	if (typeof traceId !== "string") throw new Error("x-trace-id missing");
	assert.match(traceId, /^[a-f0-9]{32}$/);
	pass("socket-fixture-stream-correlated-headers");
	const beforeNonstream = (
		await owner`SELECT count(*)::int AS n FROM gw_run`
	)[0].n;
	const nonstream = await fetch(`${base}/orgs/alpha/v1/chat/completions`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: "local-fixture",
			stream: false,
			messages: [],
		}),
	});
	assert.equal(nonstream.status, 400);
	assert.equal(
		(await owner`SELECT count(*)::int AS n FROM gw_run`)[0].n,
		beforeNonstream,
	);
	pass("socket-nonstream-disabled-before-admission");
	const originalFixtureFinish = app.store.finish;
	let releaseFixture!: () => void;
	let enteredFixture!: () => void;
	const fixtureHeld = new Promise<void>((r) => {
		releaseFixture = r;
	});
	const fixtureEntered = new Promise<void>((r) => {
		enteredFixture = r;
	});
	app.store.finish = async (id, outcome) => {
		if (outcome === "completed") {
			enteredFixture();
			await fixtureHeld;
		}
		await originalFixtureFinish(id, outcome);
	};
	let fixtureOutput = "";
	const fixtureResponse = await fetch(
		`${base}/orgs/alpha/v1/chat/completions`,
		{
			method: "POST",
			headers,
			body: JSON.stringify({
				model: "local-fixture",
				stream: true,
				messages: [],
			}),
		},
	);
	const fixtureRead = (async () => {
		const reader = fixtureResponse.body?.getReader();
		if (!reader) throw new Error("fixture body missing");
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			fixtureOutput += new TextDecoder().decode(next.value);
		}
	})();
	void fixtureRead.catch(() => {});
	await fixtureEntered;
	assert.equal(fixtureOutput.includes("[DONE]"), false);
	const [{ principal: fixtureAgent }] =
		await owner`SELECT principal FROM gw_credential WHERE id=${raw.id}`;
	try {
		await owner`UPDATE gw_principal SET permissions='[]'::jsonb WHERE id=${fixtureAgent}`;
		releaseFixture();
		await assert.rejects(fixtureRead);
		assert.equal(fixtureOutput.includes("[DONE]"), false);
	} finally {
		releaseFixture();
		app.store.finish = originalFixtureFinish;
		await owner`UPDATE gw_principal SET permissions='["llm:stream","mcp:status"]'::jsonb WHERE id=${fixtureAgent}`;
	}
	pass("socket-default-fixture-finalizer-revocation-withholds-done");
	assert.equal(
		(
			await fetch(`${base}/orgs/beta/v1/chat/completions`, {
				method: "POST",
				headers,
				body: JSON.stringify({ model: "local-fixture", stream: true }),
			})
		).status,
		403,
	);
	assert.equal(
		(
			await fetch(`${base}/orgs/alpha/v1/chat/completions`, {
				method: "POST",
				headers: { ...headers, traceparent: "bad" },
				body: "{}",
			})
		).status,
		400,
	);
	pass("socket-tenant-context-denial");
	// Base-URL clients use <origin>/v1; the org comes from the credential.
	const runsBeforeCatalog = (
		await owner`SELECT count(*)::int AS n FROM gw_run`
	)[0].n;
	const catalog = await fetch(`${base}/v1/models`, { headers });
	assert.equal(catalog.status, 200);
	assert.deepEqual(await catalog.json(), {
		object: "list",
		data: [{ id: "local-fixture", object: "model", owned_by: "local-fixture" }],
	});
	assert.equal((await fetch(`${base}/v1/models`)).status, 401);
	const toolOnly = await app.store
		.createAgent("operator", ["mcp:status"])
		.then((id) => app.store.issue("operator", id));
	assert.equal(
		(
			await fetch(`${base}/v1/models`, {
				headers: { authorization: `Bearer ${toolOnly.raw}` },
			})
		).status,
		403,
	);
	assert.equal(
		(await fetch(`${base}/v1/models`, { method: "POST", headers, body: "{}" }))
			.status,
		404,
	);
	assert.equal(
		(await owner`SELECT count(*)::int AS n FROM gw_run`)[0].n,
		runsBeforeCatalog,
	);
	pass("socket-models-catalog-authorized-and-admits-nothing");
	const unscoped = await fetch(`${base}/v1/chat/completions`, {
		method: "POST",
		headers: { ...headers, "x-stellarc-org": "beta" },
		body: JSON.stringify({
			model: "local-fixture",
			stream: true,
			messages: [],
		}),
	});
	assert.equal(unscoped.status, 200);
	assert.match(await unscoped.text(), /fixture-3/);
	const unscopedRun = unscoped.headers.get("x-stellarc-run-id");
	if (typeof unscopedRun !== "string") throw new Error("run id missing");
	const [unscopedRow] =
		await owner`SELECT org,outcome FROM gw_run WHERE id=${unscopedRun}`;
	assert.equal(unscopedRow.org, "alpha");
	assert.equal(unscopedRow.outcome, "completed");
	pass("socket-unscoped-chat-path-takes-org-from-credential");
	let mcpSession = "";
	const rpc = async (value: unknown, bearer = raw.raw) => {
		const response = await fetch(`${base}/mcp`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${bearer}`,
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				"mcp-protocol-version": "2025-11-25",
				...(mcpSession ? { "mcp-session-id": mcpSession } : {}),
			},
			body: JSON.stringify(value),
		});
		const created = response.headers.get("mcp-session-id");
		if (created) mcpSession = created;
		const text = await response.text();
		return { status: response.status, text };
	};
	assert.equal(
		(await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "invalid"))
			.status,
		401,
	);
	const init = await rpc({
		jsonrpc: "2.0",
		id: 1,
		method: "initialize",
		params: {
			protocolVersion: "2025-11-25",
			capabilities: {},
			clientInfo: { name: "fixture", version: "1" },
		},
	});
	console.log("MCP_INIT", init.status, init.text);
	assert.equal(init.status, 200);
	assert.match(init.text, /stellarc-gateway/);
	const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
	assert.equal(list.status, 200);
	assert.match(list.text, /stellarc_status/);
	const tool = await rpc({
		jsonrpc: "2.0",
		id: 3,
		method: "tools/call",
		params: { name: "stellarc_status", arguments: {} },
	});
	assert.equal(tool.status, 200);
	assert.match(tool.text, /LOCAL FIXTURE ONLY/);
	const invalid = await rpc({
		jsonrpc: "2.0",
		id: 4,
		method: "tools/call",
		params: { name: "shell", arguments: { command: "PRIVATE_TOOL_SENTINEL" } },
	});
	assert.match(invalid.text, /error/);
	pass("effect-mcp-wire-initialize-list-tool-and-unknown-deny");
	const other = await app.store
		.createAgent("operator", ["mcp:status"])
		.then((id) => app.store.issue("operator", id));
	assert.equal(
		(await rpc({ jsonrpc: "2.0", id: 6, method: "tools/list" }, other.raw))
			.status,
		404,
	);
	assert.equal(
		(await rpc({ jsonrpc: "2.0", id: 7, method: "tools/list" })).status,
		200,
	);
	pass("mcp-session-bound-to-current-principal");
	const wrongOrigin = await fetch(`${base}/mcp`, {
		method: "POST",
		headers: {
			...headers,
			origin: "https://gateway.invalid:444",
			accept: "application/json, text/event-stream",
			"mcp-session-id": mcpSession,
			"mcp-protocol-version": "2025-11-25",
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/list" }),
	});
	assert.equal(wrongOrigin.status, 403);
	pass("mcp-exact-origin-not-host-only");
	const modern = await fetch(`${base}/mcp`, {
		method: "POST",
		headers: {
			...headers,
			accept: "application/json, text/event-stream",
			"mcp-protocol-version": "2026-07-28",
			"mcp-method": "tools/call",
			"mcp-name": "stellarc_status",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 9,
			method: "tools/call",
			params: {
				name: "stellarc_status",
				arguments: {},
				_meta: {
					"io.modelcontextprotocol/protocolVersion": "2026-07-28",
					"io.modelcontextprotocol/clientCapabilities": {},
				},
			},
		}),
	});
	assert.equal(modern.status, 200);
	assert.match(await modern.text(), /LOCAL FIXTURE ONLY/);
	pass("mcp-stateless-modern-protocol-metadata");
	const originalAuthorize = app.store.authorize;
	const cancelledCall = new AbortController();
	const originalFinish = app.store.finish;
	let finishAttempts = 0;
	app.store.finish = async (id, outcome) => {
		if (++finishAttempts === 1)
			throw new Error("transient MCP terminal fixture");
		await originalFinish(id, outcome);
	};
	let cancelledRun: string | undefined;
	app.store.authorize = async (...args) => {
		const admitted = await originalAuthorize(...args);
		if (admitted.runId) {
			cancelledRun = admitted.runId;
			cancelledCall.abort();
		}
		return admitted;
	};
	try {
		const cancelledResponse = await app.handler(
			new Request(`${origin}/mcp`, {
				method: "POST",
				signal: cancelledCall.signal,
				headers: {
					...headers,
					accept: "application/json, text/event-stream",
					"mcp-protocol-version": "2026-07-28",
					"mcp-method": "tools/call",
					"mcp-name": "stellarc_status",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 10,
					method: "tools/call",
					params: {
						name: "stellarc_status",
						arguments: {},
						_meta: {
							"io.modelcontextprotocol/protocolVersion": "2026-07-28",
							"io.modelcontextprotocol/clientCapabilities": {},
						},
					},
				}),
			}),
		);
		await cancelledResponse.text().catch(() => "");
		assert.ok(
			cancelledRun,
			"cancellation barrier must follow durable admission",
		);
		const run =
			await owner`SELECT outcome FROM gw_run WHERE id=${cancelledRun}`;
		assert.equal(
			run[0].outcome,
			"cancelled",
			"cancelled MCP admission must not complete",
		);
		const events =
			await owner`SELECT kind FROM gw_audit WHERE payload->>'run'=${cancelledRun} AND kind IN ('call.completed','call.failed','call.cancelled')`;
		assert.deepEqual(
			events.map((row) => row.kind),
			["call.cancelled"],
		);
		assert.equal(finishAttempts, 2);
	} finally {
		app.store.authorize = originalAuthorize;
		app.store.finish = originalFinish;
	}
	pass("mcp-cancel-after-admission-persists-cancelled");
	const anonymous =
		await owner`SELECT count(*)::int AS n FROM gw_audit WHERE org='system' AND kind='call.deny' AND actor='anonymous'`;
	assert.ok(
		anonymous[0].n >= 1,
		"invalid MCP bearer must leave durable anonymous denial",
	);
	pass("mcp-invalid-bearer-durable-denial");
	await app.store.revoke("operator", raw.id);
	assert.equal(
		(
			await rpc({
				jsonrpc: "2.0",
				id: 5,
				method: "tools/call",
				params: { name: "stellarc_status", arguments: {} },
			})
		).status,
		401,
	);
	pass("mcp-current-credential-revocation");
	console.log(
		JSON.stringify({ checks, realOidc: false, provider: "LOCAL FIXTURE ONLY" }),
	);
} finally {
	server.stop(true);
	await app.dispose();
	sink.stop(true);
	await owner.end();
}
