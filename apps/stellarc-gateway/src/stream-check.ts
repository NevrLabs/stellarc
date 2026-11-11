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

// LOCAL intercepted upstream only. No request reaches a provider or live IdP.
const origin = "https://gateway.invalid";
const issuer = "https://issuer.invalid";
const ownerDsn = process.env.SPIKE_OWNER_DSN;
if (typeof ownerDsn !== "string" || !ownerDsn)
	throw new Error("SPIKE_OWNER_DSN required");
const owner = postgres(ownerDsn, {
	max: 3,
	onnotice: () => {},
});

const headerValue = (headers: Headers, name: string): string => {
	const value = headers.get(name);
	if (typeof value !== "string") throw new Error(`${name} missing`);
	return value;
};
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
	clientSecret: "fixture",
	secret: "fixture-secret-long-enough-for-library-checks",
	database: pool,
	authorizationEndpoint: `${issuer}/authorize`,
	tokenEndpoint: `${issuer}/token`,
	jwksUri: `${issuer}/keys`,
	audit: gatewayStore(owner).securityEvent,
	approved: gatewayStore(owner).human,
};
await (await getMigrations(gatewayAuth(config).auth.options)).runMigrations();
await pool.end();
await gatewayStore(owner).bootstrap("operator", "approved-sub", "alpha");
await owner`CREATE ROLE gateway_runtime LOGIN PASSWORD 'disposable-only'`;
await owner`GRANT USAGE ON SCHEMA public TO gateway_runtime`;
await owner`GRANT SELECT,INSERT,UPDATE ON gw_principal,gw_credential,gw_delegation,gw_run,gw_audit_state TO gateway_runtime`;
await owner`GRANT SELECT ON gw_installation,gw_identity_binding TO gateway_runtime`;
await owner`GRANT SELECT,INSERT ON gw_audit TO gateway_runtime`;
await owner`GRANT SELECT,INSERT,UPDATE,DELETE ON "user",account,session,verification TO gateway_runtime`;
let sinkUnavailable = false;
let rejectedExports = 0;
const sink = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch: () => {
		if (sinkUnavailable) {
			rejectedExports++;
			return new Response("fixture export outage", { status: 503 });
		}
		return Response.json({});
	},
});
const app = await gatewayApp({
	GATEWAY_ORIGIN: origin,
	GATEWAY_OIDC_ISSUER: issuer,
	GATEWAY_OIDC_CLIENT: "fixture",
	GATEWAY_OIDC_SECRET: "fixture",
	GATEWAY_AUTH_SECRET: config.secret,
	GATEWAY_OIDC_AUTHORIZE: config.authorizationEndpoint,
	GATEWAY_OIDC_TOKEN: config.tokenEndpoint,
	GATEWAY_OIDC_JWKS: config.jwksUri,
	GATEWAY_DATABASE_URL: process.env.SPIKE_RUNTIME_DSN,
	OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${sink.port}`,
	GATEWAY_PROVIDER_URL: "https://provider.invalid/v1/chat/completions",
	GATEWAY_PROVIDER_SECRET: "PRIVATE_LOCAL_UPSTREAM_FIXTURE",
	GATEWAY_PROVIDER_MODEL: "glm-5.3",
	GATEWAY_ENABLE_LIVE: "approved",
});
const originalFetch = globalThis.fetch;
let upstream!: ReadableStreamDefaultController<Uint8Array>;
let entered!: () => void;
let cancelled = false;
let calls = 0;
const reading = new Promise<void>((resolve) => {
	entered = resolve;
});
const pending = new ReadableStream<Uint8Array>(
	{
		start(controller) {
			upstream = controller;
		},
		pull() {
			entered();
		},
		cancel() {
			cancelled = true;
		},
	},
	{ highWaterMark: 0 },
);
let nextUpstream = pending;
let holdHeaders = false;
let enterHeaders!: () => void;
let fetchAborted = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	if (String(input) !== "https://provider.invalid/v1/chat/completions")
		return originalFetch(input, init);
	calls++;
	if (holdHeaders) {
		enterHeaders();
		return new Promise<Response>((_, reject) => {
			if (!init || !init.signal) throw new Error("init signal missing");
			init.signal.addEventListener(
				"abort",
				() => {
					fetchAborted = true;
					reject(new Error("fixture fetch abort"));
				},
				{ once: true },
			);
		});
	}
	assert.equal(
		new Headers(init?.headers).get("authorization"),
		"Bearer PRIVATE_LOCAL_UPSTREAM_FIXTURE",
	);
	assert.equal(init?.redirect, "error");
	assert.equal(JSON.parse(String(init?.body)).model, "glm-5.3");
	return new Response(nextUpstream, {
		headers: { "content-type": "text/event-stream" },
	});
}) as typeof fetch;
let disposed = false;
try {
	const agent = await app.store.createAgent("operator", ["llm:stream"]);
	const key = await app.store.issue("operator", agent);
	const response = await app.handler(
		new Request(`${origin}/orgs/alpha/v1/chat/completions`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${key.raw}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ stream: true, model: "glm-5.3", messages: [] }),
		}),
	);
	assert.equal(response.status, 200);
	if (!response.body) throw new Error("response body missing");
	const result = response.body.getReader().read();
	await reading; // The production pre-read authorization has already completed.
	await app.store.revoke("operator", key.id);
	upstream.enqueue(new TextEncoder().encode("PRIVATE_POST_REVOCATION_OUTPUT"));
	await assert.rejects(
		result,
		/provider_|scope_denied|invalid_credential|abort/i,
	);
	assert.equal(calls, 1);
	assert.equal(cancelled, true);
	const run = response.headers.get("x-stellarc-run-id");
	const failed = await owner`SELECT outcome FROM gw_run WHERE id=${run}`;
	assert.equal(failed[0].outcome, "failed");
	const terminal =
		await owner`SELECT payload FROM gw_audit WHERE kind='call.failed' AND payload->>'run'=${run}`;
	assert.equal(terminal.length, 1);
	console.log("PASS pending-upstream-read-revocation-stops-output-no-retry");
	const secondKey = await app.store.issue("operator", agent);
	const streamRequest = () =>
		new Request(`${origin}/orgs/alpha/v1/chat/completions`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${secondKey.raw}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ stream: true, model: "glm-5.3", messages: [] }),
		});
	for (const multiline of [false, true]) {
		const data = JSON.stringify({ text: "x".repeat(70000) });
		const wire = `${multiline ? `data: ${data.slice(0, 1)}\ndata: ${data.slice(1)}` : `data: ${data}`}\n\ndata: [DONE]\n\n`;
		for (const width of [wire.length, 10000]) {
			nextUpstream = new ReadableStream({
				start(c) {
					for (let i = 0; i < wire.length; i += width)
						c.enqueue(new TextEncoder().encode(wire.slice(i, i + width)));
					c.close();
				},
			});
			const response = await app.handler(streamRequest());
			await assert.rejects(
				response.text(),
				/provider_|scope_denied|invalid_credential|abort/i,
				`main 70k complete event multiline=${multiline} width=${width}`,
			);
		}
	}
	console.log("PASS main-70k-complete-event-chunk-independent");
	for (const data of [
		'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
		'event: error\ndata: {"message":"provider failed"}\n\n',
		'data: {"error":{"message":"provider failed"}}\n\n',
	]) {
		nextUpstream = new ReadableStream({
			start(c) {
				c.enqueue(new TextEncoder().encode(data));
				c.close();
			},
		});
		const incomplete = await app.handler(streamRequest());
		if (!incomplete.body) throw new Error("incomplete body missing");
		const reader = incomplete.body.getReader();
		let output = "";
		await assert.rejects(
			async () => {
				for (;;) {
					const next = await reader.read();
					if (next.done) break;
					output += new TextDecoder().decode(next.value);
				}
			},
			/provider_|scope_denied|invalid_credential|abort/i,
			"provider EOF/error must not become successful completion",
		);
		assert.ok(!output.includes("[DONE]"));
		const id = headerValue(incomplete.headers, "x-stellarc-run-id");
		const outcome = await owner`SELECT outcome FROM gw_run WHERE id=${id}`;
		assert.equal(outcome[0].outcome, "failed");
		const events =
			await owner`SELECT kind FROM gw_audit WHERE payload->>'run'=${id} AND kind IN ('call.completed','call.failed')`;
		assert.deepEqual(
			events.map((e) => e.kind),
			["call.failed"],
		);
	}
	console.log("PASS provider-eof-and-error-frames-fail-without-done");
	nextUpstream = new ReadableStream({
		start(c) {
			for (const data of [
				'data: {"choices":[]}\r',
				"\n\r\ndata: [DO",
				"NE]\n\n",
			])
				c.enqueue(new TextEncoder().encode(data));
			c.close();
		},
	});
	const completed = await app.handler(streamRequest());
	const output = await completed.text();
	assert.equal(
		output.match(/\[DONE\]/g)?.length,
		1,
		"forward one audited successful terminal frame",
	);
	const completedId = headerValue(completed.headers, "x-stellarc-run-id");
	const completedRow =
		await owner`SELECT outcome FROM gw_run WHERE id=${completedId}`;
	assert.equal(completedRow[0].outcome, "completed");
	console.log("PASS split-provider-terminal-frame-exactly-once");
	const originalFinish = app.store.finish;
	// Revocation during awaited successful persistence must withhold terminal bytes.
	let releaseFinish!: () => void;
	let enterFinish!: () => void;
	const finishHeld = new Promise<void>((r) => {
		releaseFinish = r;
	});
	const finishEntered = new Promise<void>((r) => {
		enterFinish = r;
	});
	app.store.finish = async (id, outcome) => {
		if (outcome === "completed") {
			socketRun = id;
			enterFinish();
			await finishHeld;
		}
		await originalFinish(id, outcome);
	};
	nextUpstream = new ReadableStream({
		start(c) {
			c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
			c.close();
		},
	});
	const socketServer = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: (r) => app.handler(new Request(origin + new URL(r.url).pathname, r)),
	});
	let socketRun = "";
	let socketBytes = "";
	const socket = createConnection({
		host: "127.0.0.1",
		port: socketServer.port ?? 0,
	});
	const heldRead = new Promise<void>((resolve, reject) => {
		socket.on("data", (bytes) => {
			socketBytes += bytes.toString();
		});
		socket.on("error", reject);
		socket.on("close", () => resolve());
		socket.on("connect", () => {
			const payload = JSON.stringify({
				stream: true,
				model: "glm-5.3",
				messages: [],
			});
			socket.write(
				`POST /orgs/alpha/v1/chat/completions HTTP/1.1\r\nHost: gateway.invalid\r\nAuthorization: Bearer ${secondKey.raw}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(payload)}\r\nConnection: close\r\n\r\n${payload}`,
			);
		});
	});
	await finishEntered;
	let delivered = false;
	void heldRead.then(
		() => {
			delivered = true;
		},
		() => {},
	);
	await new Promise((r) => setTimeout(r, 50));
	assert.equal(delivered, false, "held finalizer releases zero terminal");
	assert.equal(socketBytes.includes("[DONE]"), false);
	try {
		await owner`UPDATE gw_principal SET permissions='[]'::jsonb WHERE id=${agent}`;
		releaseFinish();
		await heldRead;
		assert.equal(
			socketBytes.includes("[DONE]"),
			false,
			"revoked during finish releases no terminal over socket",
		);
	} finally {
		releaseFinish();
		await owner`UPDATE gw_principal SET permissions='["llm:stream"]'::jsonb WHERE id=${agent}`;
		app.store.finish = originalFinish;
		socket.destroy();
		socketServer.stop(true);
	}
	const heldId = socketRun;
	assert.equal(
		(await owner`SELECT outcome FROM gw_run WHERE id=${heldId}`)[0].outcome,
		"completed",
		"completion means upstream done, not delivery",
	);
	console.log("PASS held-finish-zero-terminal-post-finish-revocation");
	let terminalAttempts = 0;
	let terminalDenied = false;
	app.store.finish = async (id, outcome) => {
		terminalAttempts++;
		if (terminalAttempts === 1) {
			await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
			try {
				await originalFinish(id, outcome);
			} catch (error) {
				terminalDenied = true;
				throw error;
			} finally {
				await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
			}
			assert.fail("audit INSERT revocation must reject terminal persistence");
		}
		await originalFinish(id, outcome);
	};
	nextUpstream = new ReadableStream({
		start(c) {
			c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
			c.close();
		},
	});
	const recovered = await app.handler(streamRequest());
	assert.match(
		await recovered.text(),
		/\[DONE\]/,
		"transient terminal write must recover before successful delivery",
	);
	assert.equal(terminalAttempts, 2);
	assert.equal(terminalDenied, true);
	const recoveredId = headerValue(recovered.headers, "x-stellarc-run-id");
	const recoveredRow =
		await owner`SELECT outcome FROM gw_run WHERE id=${recoveredId}`;
	assert.equal(recoveredRow[0].outcome, "completed");
	const recoveredAudit =
		await owner`SELECT kind FROM gw_audit WHERE payload->>'run'=${recoveredId} AND kind IN ('call.completed','call.failed','call.cancelled')`;
	assert.deepEqual(
		recoveredAudit.map((row) => row.kind),
		["call.completed"],
	);
	app.store.finish = originalFinish;
	console.log("PASS transient-terminal-write-recovers-exactly-once");
	sinkUnavailable = true;
	const rejectedBeforeRecovery = rejectedExports;
	const orphan = await app.store.authorize(
		secondKey.raw,
		"alpha",
		"llm:stream",
		"export-outage-orphan",
		"",
	);
	const orphanRunId = orphan.runId;
	if (typeof orphanRunId !== "string")
		throw new Error("orphan admission missing");
	let outageAttempts = 0;
	app.store.finish = async (id, outcome) => {
		outageAttempts++;
		if (outageAttempts === 1)
			await owner`REVOKE INSERT ON gw_audit FROM gateway_runtime`;
		await originalFinish(id, outcome);
	};
	let outageId: string | undefined;
	try {
		nextUpstream = new ReadableStream({
			start(c) {
				c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
				c.close();
			},
		});
		const outage = await app.handler(streamRequest());
		outageId = headerValue(outage.headers, "x-stellarc-run-id");
		assert.equal(outage.status, 200);
		await assert.rejects(
			outage.text(),
			/provider_|scope_denied|invalid_credential|abort/i,
		);
		assert.equal(
			outageAttempts,
			3,
			"terminal persistence retries must be bounded",
		);
		const stranded =
			await owner`SELECT outcome,ended_at FROM gw_run WHERE id=${outageId}`;
		assert.equal(
			stranded[0].outcome,
			"running",
			"unpersisted completion must not be reported as durable success",
		);
		assert.equal(stranded[0].ended_at, null);
		const events =
			await owner`SELECT kind FROM gw_audit WHERE payload->>'run'=${outageId} AND kind IN ('call.completed','call.failed','call.cancelled')`;
		assert.equal(events.length, 0);
	} finally {
		await owner`GRANT INSERT ON gw_audit TO gateway_runtime`;
		app.store.finish = originalFinish;
	}
	await owner`UPDATE gw_run SET recover_after=clock_timestamp()-interval '1 second' WHERE id=${orphanRunId}`;
	const providerCallsBeforeRecovery = calls;
	// Observe the actual background recovery loop; the fixture must not call recover.
	if (outageId) {
		const deadline = Date.now() + 12000;
		while (
			(
				await owner`SELECT 1 FROM gw_run WHERE id IN (${outageId},${orphanRunId}) AND outcome='running'`
			).length > 0 &&
			Date.now() < deadline
		)
			await new Promise((resolve) => setTimeout(resolve, 50));
		const recoveredOutage =
			await owner`SELECT outcome,terminal_choice FROM gw_run WHERE id=${outageId}`;
		assert.equal(recoveredOutage[0].outcome, "completed");
		assert.equal(recoveredOutage[0].terminal_choice, "completed");
		const events =
			await owner`SELECT kind FROM gw_audit WHERE payload->>'run'=${outageId} AND kind='call.completed'`;
		assert.equal(events.length, 1);
		assert.ok(
			rejectedExports > rejectedBeforeRecovery,
			"recovery must run despite a real OTLP rejection",
		);
	}
	assert.equal(
		(await owner`SELECT outcome FROM gw_run WHERE id=${orphanRunId}`)[0]
			.outcome,
		"interrupted",
	);
	const orphanEvents =
		await owner`SELECT kind,payload FROM gw_audit WHERE payload->>'run'=${orphanRunId} AND kind IN ('call.interrupted','call.completed','call.failed','call.cancelled')`;
	assert.equal(orphanEvents.length, 1);
	assert.equal(orphanEvents[0].kind, "call.interrupted");
	assert.equal(orphanEvents[0].payload.externalEffect, "unknown");
	assert.equal(
		calls,
		providerCallsBeforeRecovery,
		"recovery must never replay provider work",
	);
	sinkUnavailable = false;
	console.log(
		"PASS expired-orphan-recovery-during-otlp-outage-no-effect-replay",
	);
	console.log("PASS terminal-recovery-independent-of-otlp-export-outage");
	console.log(
		"PASS sustained-terminal-audit-outage-withholds-success-bounded-retries",
	);
	const abort = new AbortController();
	nextUpstream = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
			controller.close();
		},
	});
	app.store.finish = async (id, outcome) => {
		if (outcome === "completed") abort.abort();
		return originalFinish(id, outcome);
	};
	const interrupted = await app.handler(
		new Request(`${origin}/orgs/alpha/v1/chat/completions`, {
			method: "POST",
			signal: abort.signal,
			headers: {
				authorization: `Bearer ${secondKey.raw}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ stream: true, model: "glm-5.3", messages: [] }),
		}),
	);
	assert.equal(interrupted.status, 200);
	await assert.rejects(
		interrupted.body?.getReader().read() ??
			Promise.reject(new Error("body missing")),
		/provider_|scope_denied|invalid_credential|abort/i,
		"abort during terminal persistence must not release DONE",
	);
	app.store.finish = originalFinish;
	console.log("PASS cancellation-during-terminal-persistence-withholds-done");
	holdHeaders = true;
	const headersEntered = new Promise<void>((r) => {
		enterHeaders = r;
	});
	const fetchController = new AbortController();
	const beforeHeaders = app.handler(
		new Request(streamRequest(), { signal: fetchController.signal }),
	);
	await headersEntered;
	fetchController.abort();
	assert.equal((await beforeHeaders).status, 503);
	assert.equal(fetchAborted, true);
	holdHeaders = false;
	console.log("PASS abort-fetch-before-headers-settles-no-replay");
	for (const mode of ["consumer", "abort", "deadline"]) {
		let upstreamCancelled = false;
		nextUpstream = new ReadableStream(
			{
				cancel() {
					upstreamCancelled = true;
				},
			},
			{ highWaterMark: 0 },
		);
		const controller = new AbortController();
		const request = streamRequest();
		const response = await app.handler(
			new Request(request, { signal: controller.signal }),
		);
		if (mode === "consumer") await response.body?.cancel();
		else if (mode === "abort") controller.abort();
		const id = headerValue(response.headers, "x-stellarc-run-id");
		const until = Date.now() + (mode === "deadline" ? 33000 : 3000);
		while (
			(await owner`SELECT outcome FROM gw_run WHERE id=${id}`)[0].outcome ===
				"running" &&
			Date.now() < until
		)
			await new Promise((r) => setTimeout(r, 10));
		assert.equal(
			upstreamCancelled,
			true,
			"cancel must stop upstream without a next pull",
		);
		assert.equal(
			(await owner`SELECT outcome FROM gw_run WHERE id=${id}`)[0].outcome,
			"cancelled",
		);
		assert.equal(
			(
				await owner`SELECT 1 FROM gw_audit WHERE payload->>'run'=${id} AND kind='call.cancelled'`
			).length,
			1,
		);
	}
	console.log(
		"PASS no-pull-consumer-cancel-request-abort-and-deadline-settle-once",
	);
	let releaseTerminal!: () => void;
	let enteredTerminal!: () => void;
	const terminalHeld = new Promise<void>((resolve) => {
		releaseTerminal = resolve;
	});
	const terminalEntered = new Promise<void>((resolve) => {
		enteredTerminal = resolve;
	});
	nextUpstream = new ReadableStream({}, { highWaterMark: 0 });
	let finalizer: Promise<void> | undefined;
	app.store.finish = (id, outcome) => {
		finalizer = (async () => {
			enteredTerminal();
			await terminalHeld;
			await originalFinish(id, outcome);
		})();
		return finalizer;
	};
	const shutdownStream = await app.handler(
		new Request(`${origin}/orgs/alpha/v1/chat/completions`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${secondKey.raw}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ stream: true, model: "glm-5.3", messages: [] }),
		}),
	);
	assert.equal(shutdownStream.status, 200);
	const originalAuthorize = app.store.authorize;
	let enteredAdmission!: () => void;
	let releaseAdmission!: () => void;
	const admissionEntered = new Promise<void>((resolve) => {
		enteredAdmission = resolve;
	});
	const admissionHeld = new Promise<void>((resolve) => {
		releaseAdmission = resolve;
	});
	let admissionRun: string | undefined;
	app.store.authorize = async (...args) => {
		const decision = await originalAuthorize(...args);
		if (decision.runId) {
			admissionRun = decision.runId;
			enteredAdmission();
			await admissionHeld;
		}
		return decision;
	};
	const pendingAdmission = app.handler(streamRequest());
	await admissionEntered;
	let shutdownFinished = false;
	const shutdown = app.dispose().then(() => {
		shutdownFinished = true;
	});
	try {
		await terminalEntered;
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(
			shutdownFinished,
			false,
			"shutdown must await the held terminal audit before closing pools",
		);
		releaseTerminal();
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(
			shutdownFinished,
			false,
			"shutdown must also await committed admission returning to its handler",
		);
	} finally {
		releaseTerminal();
		releaseAdmission();
		await pendingAdmission;
		await shutdown;
		disposed = true;
		await finalizer;
	}
	const shutdownRun = shutdownStream.headers.get("x-stellarc-run-id");
	const shutdownOutcome =
		await owner`SELECT outcome FROM gw_run WHERE id=${shutdownRun}`;
	assert.equal(shutdownOutcome[0].outcome, "cancelled");
	assert.ok(admissionRun);
	const admissionOutcome =
		await owner`SELECT outcome FROM gw_run WHERE id=${admissionRun}`;
	assert.equal(
		admissionOutcome[0].outcome,
		"cancelled",
		"shutdown must persist late admission cancellation",
	);
	console.log("PASS shutdown-drains-held-terminal-audit-before-pool-close");
	console.log("PASS shutdown-drains-late-admission-cancellation");
	console.log(
		JSON.stringify({
			realOidc: false,
			realInference: false,
			upstream: "LOCAL FETCH INTERCEPTION ONLY",
		}),
	);
} finally {
	globalThis.fetch = originalFetch;
	if (!disposed) await app.dispose();
	sink.stop(true);
	await owner.end();
}
