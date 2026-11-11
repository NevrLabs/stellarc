import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import postgres from "postgres";
import {
	TelemetryLive,
	TelemetryTest,
} from "../../../packages/telemetry/src/index";
import { ddl, gateway, traceContext } from "./gateway";
import { oidc } from "./oidc";

const owner = postgres(process.env.SPIKE_OWNER_DSN!, {
	max: 3,
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
// Use the existing owner/runtime separation check and append-only grants.
const { grantRuntime } = await import("../../../packages/db/src/migrate");
await grantRuntime(owner, "authgw_runtime");
await owner`GRANT SELECT,INSERT,UPDATE ON authgw_grant,authgw_cursor TO authgw_runtime`;
await owner`GRANT SELECT,UPDATE ON authgw_member TO authgw_runtime`;
await owner`INSERT INTO authgw_member VALUES ('alpha','fixture-actor')`;
const sql = postgres(process.env.SPIKE_RUNTIME_DSN!, {
	max: 4,
	onnotice: () => {},
});
let mode = "ok";
const received: unknown[] = [];
const sink = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(req) {
		const responseMode = mode;
		received.push(await req.json());
		if (responseMode === "fail")
			return new Response("unavailable", { status: 503 });
		if (responseMode === "partial")
			return Response.json({ partialSuccess: { rejectedLogRecords: "1" } });
		if (responseMode === "malformed") return new Response("not-json");
		if (responseMode === "partial-null")
			return Response.json({ partialSuccess: null });
		if (responseMode === "partial-array")
			return Response.json({ partialSuccess: [] });
		if (responseMode === "partial-number")
			return Response.json({ partialSuccess: 7 });
		if (responseMode === "partial-unknown")
			return Response.json({ partialSuccess: { unexpected: true } });
		// Receiver has parsed and retained the batch before the client's 3s deadline.
		if (responseMode === "timeout-after-acceptance")
			await new Promise((resolve) => setTimeout(resolve, 3300));
		if (responseMode === "accept-before-cursor-failure")
			await owner`REVOKE INSERT,UPDATE ON authgw_cursor FROM authgw_runtime`;
		return Response.json({});
	},
});
const telemetry = TelemetryTest();
const fixture: { failAttempts: number; failAfterChunk?: number } = {
	failAttempts: 0,
};
const gw = gateway(
	sql,
	`http://127.0.0.1:${sink.port}/v1/logs`,
	telemetry.layer,
	fixture,
);
const checks: string[] = [];
const ok = (name: string) => {
	checks.push(name);
	console.log(`PASS ${name}`);
};
try {
	assert.throws(() =>
		oidc({
			issuer: "http://unsafe",
			clientId: "fixture",
			callback: "https://fixture/callback",
			members: [],
		}),
	);
	const login = oidc({
		issuer: "https://issuer.invalid",
		clientId: "fixture",
		callback: "https://fixture/callback",
		members: [],
	});
	await assert.rejects(
		login.complete(new Request("https://foreign/callback?state=x&code=y")),
	);
	await assert.rejects(
		login.complete(
			new Request("https://fixture/callback?state=x&state=z&code=y"),
		),
	);
	await assert.rejects(
		login.complete(new Request("https://fixture/callback?state=x&code=y")),
	);
	ok("oidc-boundary-guards-no-network");
	assert.throws(() =>
		traceContext(
			new Headers({ traceparent: `00-${"0".repeat(32)}-${"1".repeat(16)}-01` }),
		),
	);
	assert.throws(() => traceContext(new Headers({ traceparent: "malformed" })));
	ok("invalid-context-denied");
	const bodyDenied = await gw.handler(
		new Request("http://fixture/orgs/alpha/stream", {
			method: "POST",
			body: "PRIVATE_PROMPT_SENTINEL",
		}),
	);
	assert.equal(bodyDenied.status, 400);
	ok("body-rejected-without-reading");
	const grant = await gw.issue("alpha", "fixture-actor");
	await assert.rejects(gw.issue("alpha", "fixture-actor", 60000, "admin:*"));
	ok("scope-escalation-denied");
	await assert.rejects(gw.authorize(grant.raw, "beta", "negative", "", true));
	ok("cross-tenant-denied");
	const send = (raw = grant.raw, signal?: AbortSignal) =>
		gw.handler(
			new Request("http://fixture/orgs/alpha/stream", {
				method: "POST",
				headers: {
					authorization: `Bearer ${raw}`,
					traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01`,
					baggage: "org=evil",
				},
				signal,
			}),
		);
	const response = await send();
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("x-trace-id"), "a".repeat(32));
	assert.match(await response.text(), /fixture-3/);
	assert.equal(gw.state().active, 0);
	ok("fixture-stream-context-cleanup");
	fixture.failAttempts = 1;
	const retried = await send();
	assert.equal(retried.status, 200);
	await retried.text();
	fixture.failAttempts = 2;
	const failed = await send();
	assert.equal(failed.status, 502);
	assert.equal(gw.state().active, 0);
	fixture.failAttempts = 0;
	ok("upstream-retry-once-before-stream");
	fixture.failAfterChunk = 1;
	const attemptsBefore = telemetry.spans
		.getFinishedSpans()
		.filter((s) => s.name === "authgw.provider.attempt").length;
	const brokenStream = await send();
	const brokenReader = brokenStream.body!.getReader();
	assert.equal((await brokenReader.read()).done, false);
	await assert.rejects(async () => {
		while (!(await brokenReader.read()).done) {}
	});
	await gw.drain();
	assert.equal(gw.state().active, 0);
	assert.equal(
		telemetry.spans
			.getFinishedSpans()
			.filter((s) => s.name === "authgw.provider.attempt").length -
			attemptsBefore,
		1,
	);
	delete fixture.failAfterChunk;
	ok("post-byte-error-no-retry-cleanup");
	const a = await send();
	const b = await send();
	const c = await send();
	assert.equal(c.status, 429);
	await a.body!.cancel();
	await b.body!.cancel();
	assert.equal(gw.state().active, 0);
	ok("capacity-two-queue-zero-cancel");
	const abort = new AbortController();
	const d = await send(grant.raw, abort.signal);
	abort.abort();
	await d.body!.cancel();
	assert.equal(gw.state().active, 0);
	ok("disconnect-cleanup");
	const e = await send();
	const reader = e.body!.getReader();
	await reader.read();
	await gw.revoke(grant.id);
	// Already-buffered transport data is not recallable; subsequent pull must stop.
	await assert.rejects(async () => {
		while (!(await reader.read()).done) {}
	});
	await assert.rejects(gw.authorize(grant.raw, "alpha", "revoked", "", true));
	ok("revocation-stops-future-pulls");
	const expired = await gw.issue("alpha", "fixture-actor");
	await owner`UPDATE authgw_grant SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${expired.id}`;
	await assert.rejects(gw.authorize(expired.raw, "alpha", "expired", "", true));
	ok("expiry-denied");
	for (const statement of [
		"DELETE FROM event",
		"UPDATE event SET actor='other'",
		"TRUNCATE event",
	])
		await assert.rejects(sql.unsafe(statement));
	ok("runtime-audit-append-only");
	const [{ count: before }] =
		await owner`SELECT count(*)::int AS count FROM authgw_grant`;
	await owner`REVOKE INSERT ON event FROM authgw_runtime`;
	await assert.rejects(gw.issue("alpha", "fixture-actor"));
	const [{ count: after }] =
		await owner`SELECT count(*)::int AS count FROM authgw_grant`;
	assert.equal(after, before);
	await owner`GRANT INSERT ON event TO authgw_runtime`;
	ok("audit-failure-rolls-back-grant");
	await gw.drain();
	// Real PG barriers: a held row lock prevents revoke completing before release.
	const race = await gw.issue("alpha", "fixture-actor");
	let locked!: () => void;
	let unlock!: () => void;
	const lockedSignal = new Promise<void>((resolve) => {
		locked = resolve;
	});
	const unlockSignal = new Promise<void>((resolve) => {
		unlock = resolve;
	});
	const blocker = owner.begin(async (tx) => {
		await tx`SELECT id FROM authgw_grant WHERE id=${race.id} FOR UPDATE`;
		locked();
		await unlockSignal;
	});
	await lockedSignal;
	const revoking = gw.revoke(race.id);
	unlock();
	await blocker;
	await revoking;
	await assert.rejects(
		gw.authorize(race.raw, "alpha", "race-after-revoke", "", true),
	);
	ok("grant-row-barrier-revocation");
	const member = await gw.issue("alpha", "fixture-actor");
	await owner`DELETE FROM authgw_member WHERE org='alpha' AND actor='fixture-actor'`;
	await assert.rejects(
		gw.authorize(member.raw, "alpha", "removed-member", "", true),
	);
	await owner`INSERT INTO authgw_member VALUES ('alpha','fixture-actor')`;
	ok("current-membership-removal-denied");
	// Verify detection query on real generated denials, not a hand-authored result.
	for (let n = 0; n < 5; n++)
		await assert.rejects(
			gw.authorize("invalid", "beta", `detection-${n}`, "", true),
		);
	const detections =
		await owner`SELECT org,count(*)::int AS denied FROM event WHERE plugin_type='authgw:call-denied' AND created_at>now()-interval '5 minutes' GROUP BY org HAVING count(*)>=5`;
	assert.ok(detections.some((d) => d.org === "authgw-system" && d.denied >= 5));
	ok("denial-detection-real-events");
	// Bounded normal capacity rejects before privileged state changes.
	await owner`INSERT INTO org_event_counter(org,seq) VALUES ('bounded',1000)`;
	await owner`INSERT INTO authgw_member VALUES ('bounded','fixture-actor')`;
	await assert.rejects(gw.issue("bounded", "fixture-actor"));
	assert.equal(
		(await owner`SELECT id FROM authgw_grant WHERE org='bounded'`).length,
		0,
	);
	assert.equal(gw.state().gap, true);
	ok("audit-capacity-fails-closed");
	// Artificial counter/cursor positions isolate the real capacity decision;
	// they are not exported audit evidence or a fabricated 1000-event backlog.
	const reserved = await gw.issue("alpha", "fixture-actor");
	const [{ seq: alphaSeq }] =
		await owner`SELECT seq::text FROM org_event_counter WHERE org='alpha'`;
	const [{ seq: anonymousSeq }] =
		await owner`SELECT seq::text FROM org_event_counter WHERE org='authgw-system'`;
	await owner`UPDATE org_event_counter SET seq=1000 WHERE org='alpha'`;
	await gw.revoke(reserved.id);
	assert.equal(
		(await owner`SELECT revoked FROM authgw_grant WHERE id=${reserved.id}`)[0]
			.revoked,
		true,
	);
	await assert.rejects(gw.issue("alpha", "fixture-actor"));
	await owner`UPDATE org_event_counter SET seq=1100 WHERE org='alpha'`;
	await assert.rejects(gw.revoke(member.id));
	assert.equal(
		(await owner`SELECT revoked FROM authgw_grant WHERE id=${member.id}`)[0]
			.revoked,
		false,
	);
	await owner`UPDATE org_event_counter SET seq=1100 WHERE org='authgw-system'`;
	await assert.rejects(
		gw.authorize("invalid", "beta", "emergency-full", "", true),
	);
	assert.equal(
		(
			await owner`SELECT seq::text FROM org_event_counter WHERE org='authgw-system'`
		)[0].seq,
		"1100",
	);
	assert.equal(gw.state().gap, true);
	// Remove test-only capacity event before restoring monotonically ordered fixture history.
	await owner`DELETE FROM event WHERE org='alpha' AND seq=1001`;
	await owner`UPDATE org_event_counter SET seq=${alphaSeq} WHERE org='alpha'`;
	await owner`UPDATE org_event_counter SET seq=${anonymousSeq} WHERE org='authgw-system'`;
	ok("emergency-revocation-reserve-and-exhaustion");
	mode = "timeout-after-acceptance";
	const beforeTimeout = received.length;
	await assert.rejects(gw.exportAudit());
	assert.equal(received.length, beforeTimeout + 1);
	assert.equal((await owner`SELECT * FROM authgw_cursor`).length, 0);
	const timeoutAccepted = received.at(-1);
	mode = "ok";
	const timeoutRestart = gateway(sql, `http://127.0.0.1:${sink.port}/v1/logs`);
	try {
		const beforeReplay = received.length;
		assert.ok((await timeoutRestart.exportAudit()) > 0);
		assert.deepEqual(received[beforeReplay], timeoutAccepted);
	} finally {
		await timeoutRestart.dispose();
	}
	await owner`DELETE FROM authgw_cursor`;
	ok("timeout-after-receiver-acceptance-replays-stable-batch");
	for (const failure of ["fail", "partial", "malformed"]) {
		mode = failure;
		await assert.rejects(gw.exportAudit());
		assert.equal((await owner`SELECT * FROM authgw_cursor`).length, 0);
	}
	ok("export-failure-partial-malformed-retained");
	for (const failure of [
		"partial-null",
		"partial-array",
		"partial-number",
		"partial-unknown",
	]) {
		mode = failure;
		await assert.rejects(gw.exportAudit());
		assert.equal((await owner`SELECT * FROM authgw_cursor`).length, 0);
	}
	ok("invalid-partial-success-shapes-retained");
	mode = "accept-before-cursor-failure";
	await assert.rejects(gw.exportAudit());
	assert.equal((await owner`SELECT * FROM authgw_cursor`).length, 0);
	const acceptedBeforeRestart = received.at(-1);
	await owner`GRANT INSERT,UPDATE ON authgw_cursor TO authgw_runtime`;
	mode = "ok";
	const restarted = gateway(sql, `http://127.0.0.1:${sink.port}/v1/logs`);
	try {
		const beforeReplay = received.length;
		assert.ok((await restarted.exportAudit()) > 0);
		assert.deepEqual(received[beforeReplay], acceptedBeforeRestart);
	} finally {
		await restarted.dispose();
	}
	ok("receiver-accepted-cursor-failure-restart-replay");
	await owner`DELETE FROM authgw_cursor`;
	mode = "ok";
	assert.ok((await gw.exportAudit()) > 0);
	const again = await gw.exportAudit();
	if (again !== 0)
		console.log(
			"CURSOR_DIAGNOSTIC",
			JSON.stringify(
				await owner`SELECT c.org,c.seq::text AS counter,d.seq::text AS delivered FROM org_event_counter c LEFT JOIN authgw_cursor d USING(org)`,
			),
		);
	assert.equal(again, 0);
	ok("export-recovery-cursor-dedupe");
	const text = JSON.stringify(received);
	assert.ok(!text.includes(grant.raw));
	assert.ok(!text.includes("digest"));
	assert.ok(!text.includes("org=evil"));
	ok("audit-allowlist-no-bearer-or-baggage");
	await telemetry.logProcessor.forceFlush();
	await telemetry.reader.forceFlush();
	const spans = telemetry.spans.getFinishedSpans();
	assert.ok(
		spans.some(
			(s) =>
				s.name === "authgw.request" &&
				s.spanContext().traceId === "a".repeat(32),
		),
	);
	assert.ok(
		spans.some(
			(s) =>
				s.name === "authgw.provider.fixture" &&
				s.spanContext().traceId === "a".repeat(32),
		),
	);
	assert.ok(
		telemetry.logs
			.getFinishedLogRecords()
			.some((l) => l.spanContext?.traceId === "a".repeat(32)),
	);
	assert.ok(telemetry.metrics.getMetrics().length > 0);
	ok("three-signal-in-memory-correlation");
	const allTelemetry = JSON.stringify({
		audit: received,
		spans: spans.map((s) => ({
			name: s.name,
			attributes: s.attributes,
			events: s.events,
			status: s.status,
		})),
		logs: telemetry.logs
			.getFinishedLogRecords()
			.map((l) => ({ body: l.body, attributes: l.attributes })),
		metrics: telemetry.metrics.getMetrics(),
	});
	for (const marker of [
		grant.raw,
		"PRIVATE_PROMPT_SENTINEL",
		"data: fixture-1",
		"org=evil",
		"disposable-only",
	])
		assert.ok(
			!allTelemetry.includes(marker),
			"private marker leaked into telemetry",
		);
	ok("all-signals-private-markers-absent");
	if (process.env.SPIKE_LIVE_TELEMETRY === "1") {
		await gw.dispose();
		const live = gateway(
			sql,
			undefined,
			TelemetryLive("stellarc-authgw-spike"),
		);
		try {
			const g = await live.issue("alpha", "fixture-actor");
			const result = await live.handler(
				new Request("http://fixture/orgs/alpha/stream", {
					method: "POST",
					headers: { authorization: `Bearer ${g.raw}` },
				}),
			);
			assert.equal(result.status, 200);
			await result.text();
			console.log(
				JSON.stringify({
					kind: "fixture-stream-live-telemetry",
					requestId: result.headers.get("x-request-id"),
					traceId: result.headers.get("x-trace-id"),
				}),
			);
		} finally {
			await live.dispose();
		}
	}
	console.log(
		JSON.stringify({
			verdict: "PARTIAL",
			checks,
			provider: "LOCAL FIXTURE ONLY",
			liveOidc: false,
			liveMaple: false,
		}),
	);
} finally {
	await gw.dispose();
	sink.stop(true);
	await sql.end();
	await owner.end();
}
