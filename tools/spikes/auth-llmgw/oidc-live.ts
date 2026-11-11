import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { grantRuntime } from "../../../packages/db/src/migrate";
import { ddl, gateway, Refusal } from "./gateway";
import { oidc } from "./oidc";

// Temporary loopback proof, never mount in the production API.
const callback = "http://127.0.0.1:18790/oidc/callback";
assert.ok(
	process.env.SPIKE_OWNER_DSN &&
		process.env.SPIKE_RUNTIME_DSN &&
		process.env.SPIKE_OIDC_SUBJECT &&
		process.env.SPIKE_OIDC_CLIENT,
);
const owner = postgres(process.env.SPIKE_OWNER_DSN, {
	max: 2,
	onnotice: () => {},
});
await owner.unsafe(
	await readFile(
		new URL(
			"../../../packages/db/migrations/0001_foundation.sql",
			import.meta.url,
		),
		"utf8",
	),
);
await owner.unsafe(ddl);
await owner`CREATE TABLE stellarc_migration(version text PRIMARY KEY, checksum text NOT NULL)`;
await owner`CREATE ROLE authgw_runtime LOGIN PASSWORD 'disposable-only'`;
await grantRuntime(owner, "authgw_runtime");
await owner`GRANT SELECT,INSERT,UPDATE ON authgw_grant,authgw_cursor TO authgw_runtime`;
await owner`GRANT SELECT,UPDATE ON authgw_member TO authgw_runtime`;
const org = `oidc-${crypto.randomUUID()}`;
const actor = "approved-human";
await owner`INSERT INTO authgw_member VALUES (${org},${actor})`;
const sql = postgres(process.env.SPIKE_RUNTIME_DSN, {
	max: 4,
	onnotice: () => {},
});
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const gw = gateway(sql, endpoint ? `${endpoint}/v1/logs` : undefined);
const login = oidc({
	issuer: "https://auth.entelechia.cloud",
	clientId: process.env.SPIKE_OIDC_CLIENT,
	callback,
	members: [{ subject: process.env.SPIKE_OIDC_SUBJECT, org, actor }],
});
let completed = false;
let busy = false;
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 18790,
	async fetch(req) {
		const url = new URL(req.url);
		const headers = {
			"cache-control": "no-store",
			"referrer-policy": "no-referrer",
			"content-security-policy": "default-src 'none'; frame-ancestors 'none'",
		};
		if (
			url.origin !== new URL(callback).origin ||
			req.headers.get("host") !== "127.0.0.1:18790"
		)
			return new Response("wrong origin", { status: 400, headers });
		if (
			req.method !== "GET" ||
			(req.headers.get("sec-fetch-site") === "cross-site" &&
				url.pathname !== "/oidc/callback")
		)
			return new Response("denied", { status: 403, headers });
		if (url.pathname === "/health")
			return Response.json(
				{ ready: true, completed, provider: "LOCAL FIXTURE ONLY" },
				{ headers },
			);
		if (url.pathname === "/login" && !completed && !busy) {
			const begin = await login.begin();
			return new Response(null, {
				status: 302,
				headers: {
					...headers,
					location: begin.url,
					"set-cookie": begin.cookie,
				},
			});
		}
		if (url.pathname !== "/oidc/callback" || completed || busy)
			return new Response("not available", { status: 404, headers });
		busy = true;
		try {
			const identity = await login.complete(req);
			const grant = await gw.issue(identity.org, identity.actor);
			const response = await gw.handler(
				new Request(`http://fixture/orgs/${identity.org}/stream`, {
					method: "POST",
					headers: { authorization: `Bearer ${grant.raw}` },
				}),
			);
			assert.equal(response.status, 200);
			assert.match(await response.text(), /fixture-3/);
			await gw.drain();
			await gw.revoke(grant.id);
			await assert.rejects(
				gw.authorize(grant.raw, identity.org, "post-login-revoke", "", true),
			);
			const exported = endpoint ? await gw.exportAudit() : null;
			const events =
				await owner`SELECT org,seq::text,plugin_type,payload FROM event ORDER BY org, event.seq`;
			await writeFile(
				process.env.SPIKE_OIDC_RECEIPT ?? "oidc-live-receipt.json",
				JSON.stringify(
					{
						kind: "real-oidc-to-local-fixture",
						issuer: "https://auth.entelechia.cloud",
						clientId: process.env.SPIKE_OIDC_CLIENT,
						org,
						actor,
						realOidc: true,
						provider: "LOCAL FIXTURE ONLY",
						requestId: response.headers.get("x-request-id"),
						traceId: response.headers.get("x-trace-id"),
						receiverAccepted: exported,
						events,
					},
					null,
					2,
				),
				{ mode: 0o600 },
			);
			completed = true;
			return new Response(
				"OIDC identity verified. Scoped fixture stream and revocation passed. No paid inference. Receipt saved server-side.",
				{
					headers: {
						...headers,
						"set-cookie":
							"authgw-loopback-login=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
					},
				},
			);
		} catch (error) {
			// No URLs, upstream error text, codes or credentials in logs or response.
			const reason = error instanceof Refusal ? error.reason : "proof_failed";
			console.log(JSON.stringify({ stage: "callback", reason }));
			return new Response(reason, {
				status: error instanceof Refusal ? error.status : 503,
				headers,
			});
		} finally {
			busy = false;
		}
	},
});
console.log(
	JSON.stringify({ stage: "ready", callback, provider: "LOCAL FIXTURE ONLY" }),
);
let stopping = false;
async function stop() {
	if (stopping) return;
	stopping = true;
	server.stop(true);
	await gw.dispose();
	await sql.end();
	await owner.end();
	process.exit(0);
}
setTimeout(() => void stop(), 15 * 60 * 1000);
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
