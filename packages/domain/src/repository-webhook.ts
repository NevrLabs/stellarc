import { createHmac, timingSafeEqual } from "node:crypto";
import { Effect } from "effect";
import type { Sql } from "postgres";

// STL-18 A4: T4 owns the GitHub webhook RECEIVER only — verify the
// sha256 HMAC signature over the raw body, then append exactly one
// `repo.webhook_received` event (schema_version 1) and stop. Fan-out to
// notifications/activity is T3's via the outbox; this module never
// delivers anything. The event payload carries identifying metadata
// (event name, delivery id) — never the raw body or signature material.

export type WebhookDelivery = {
	/** x-github-event */
	event: string;
	/** x-github-delivery */
	deliveryId: string;
	/** x-hub-signature-256 (sha256=<hex>) or null when absent */
	signature: string | null;
	/** Raw request body bytes as text — the exact bytes that were signed. */
	body: string;
	/** The webhook secret used to verify (from the org's integration). */
	secret: string;
};

export type WebhookResult = { status: number; duplicate: boolean };

/** Constant-time sha256=<hex> comparison; absent header never verifies. */
export function verifyGithubSignature(
	secret: string,
	body: string,
	signature: string | null,
): boolean {
	if (!signature?.startsWith("sha256=")) return false;
	const expected = createHmac("sha256", secret).update(body).digest();
	let received: Buffer;
	try {
		received = Buffer.from(signature.slice(7), "hex");
	} catch {
		return false;
	}
	if (received.length !== expected.length) return false;
	return timingSafeEqual(received, expected);
}

const DELIVERY_EVENT = "repo.webhook_received";

export const githubWebhookEffect = Effect.fn("Domain.githubWebhook")(function* (
	sql: Sql,
	org: string,
	actor: string,
	delivery: WebhookDelivery,
) {
	if (
		!verifyGithubSignature(delivery.secret, delivery.body, delivery.signature)
	)
		return { status: 401, duplicate: false } satisfies WebhookResult;
	// Idempotency by delivery id: GitHub redelivers; the second delivery
	// must not append a second event.
	const seen = yield* Effect.tryPromise({
		try: () =>
			sql`SELECT 1 FROM event
				    WHERE org=${org} AND plugin_type=${DELIVERY_EVENT}
				      AND payload->>'deliveryId'=${delivery.deliveryId}` as unknown as Promise<
				unknown[]
			>,
		catch: (cause) => cause,
	});
	if (Array.isArray(seen) && seen.length > 0)
		return { status: 200, duplicate: true } satisfies WebhookResult;
	yield* Effect.tryPromise({
		try: async () => {
			await sql.begin(async (tx) => {
				await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
				const [counter] =
					await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org=${org} RETURNING seq::text`;
				const [transaction] =
					await tx`SELECT pg_current_xact_id()::text AS txid`;
				const seq = BigInt(counter.seq);
				await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
				        VALUES (${org},${seq.toString()},${DELIVERY_EVENT},${actor},
				          ${tx.json({
										event: delivery.event,
										deliveryId: delivery.deliveryId,
									} as never)},1,${transaction.txid})`;
			});
		},
		catch: (cause) => cause,
	});
	return { status: 200, duplicate: false } satisfies WebhookResult;
});
