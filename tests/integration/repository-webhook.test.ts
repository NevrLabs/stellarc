import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

// STL-18 A4: T4 owns the GitHub webhook RECEIVER endpoint only —
// signature verify → event append (repo.webhook_received) → 200. No
// fan-out (that is T3's via the outbox). Invalid or missing signature is
// 401 and appends nothing. The payload body never carries secrets.

let sql: Sql;
let close: () => Promise<void>;
let orgId: string;

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	orgId = "org-hook-1";
	await sql`INSERT INTO organization (id, name, slug, created_at)
    VALUES (${orgId}, 'Hook Org', 'hook-org', now())`;
	await sql`INSERT INTO org_event_counter(org) VALUES (${orgId})`;
});

afterEach(async () => {
	await close();
});

const SECRET = "whsec_fixture";

async function sign(body: string, secret = SECRET) {
	const { createHmac } = await import("node:crypto");
	return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

const DELIVERY =
	"https://api.github.com/repos/foundation/probe/hooks/1/deliveries/1";

test("A4 valid signature appends exactly one repo.webhook_received event", async () => {
	const { githubWebhookEffect } = await import(
		"../../packages/domain/src/repository-webhook"
	);
	const { Effect } = await import("effect");
	const body = JSON.stringify({
		action: "opened",
		issue: { number: 7, title: "Hook opened" },
	});
	const result = await Effect.runPromise(
		githubWebhookEffect(sql, orgId, "actor-1", {
			event: "issues",
			deliveryId: DELIVERY,
			signature: await sign(body),
			body,
			secret: SECRET,
		}),
	);
	expect(result.status).toBe(200);
	const events =
		await sql`SELECT plugin_type, payload, schema_version FROM event
    WHERE org=${orgId} ORDER BY seq`;
	expect(events).toHaveLength(1);
	expect(events[0]?.plugin_type).toBe("repo.webhook_received");
	expect(events[0]?.schema_version).toBe(1);
	const payload = events[0]?.payload as Record<string, unknown>;
	expect(payload.event).toBe("issues");
	expect(payload.deliveryId).toBe(DELIVERY);
	expect(payload).not.toHaveProperty("body");
	expect(payload).not.toHaveProperty("signature");
});

test("A4 invalid signature is rejected with 401 and appends nothing", async () => {
	const { githubWebhookEffect } = await import(
		"../../packages/domain/src/repository-webhook"
	);
	const { Effect } = await import("effect");
	const body = JSON.stringify({ action: "opened" });
	const result = await Effect.runPromise(
		githubWebhookEffect(sql, orgId, "actor-1", {
			event: "issues",
			deliveryId: DELIVERY,
			signature: await sign(body, "whsec_wrong"),
			body,
			secret: SECRET,
		}),
	);
	expect(result.status).toBe(401);
	const events =
		await sql`SELECT count(*)::int AS n FROM event WHERE org=${orgId}`;
	expect(events[0]?.n).toBe(0);
});

test("A4 missing signature headers are rejected without writes", async () => {
	const { githubWebhookEffect } = await import(
		"../../packages/domain/src/repository-webhook"
	);
	const { Effect } = await import("effect");
	const result = await Effect.runPromise(
		githubWebhookEffect(sql, orgId, "actor-1", {
			event: "issues",
			deliveryId: DELIVERY,
			signature: null,
			body: "{}",
			secret: SECRET,
		}),
	);
	expect(result.status).toBe(401);
	const events =
		await sql`SELECT count(*)::int AS n FROM event WHERE org=${orgId}`;
	expect(events[0]?.n).toBe(0);
});

test("A4 duplicate delivery is idempotent (no second event)", async () => {
	const { githubWebhookEffect } = await import(
		"../../packages/domain/src/repository-webhook"
	);
	const { Effect } = await import("effect");
	const body = JSON.stringify({ action: "synchronize" });
	for (const _ of [1, 2]) {
		const result = await Effect.runPromise(
			githubWebhookEffect(sql, orgId, "actor-1", {
				event: "push",
				deliveryId: DELIVERY,
				signature: await sign(body),
				body,
				secret: SECRET,
			}),
		);
		expect(result.status).toBe(200);
	}
	const events =
		await sql`SELECT count(*)::int AS n FROM event WHERE org=${orgId}`;
	expect(events[0]?.n).toBe(1);
});
