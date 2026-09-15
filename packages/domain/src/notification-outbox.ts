import { Effect } from "effect";
import type { Sql } from "postgres";
import { appendEventInTx } from "./activity-events";
import { deliveryKey, notificationTypeFor } from "./notification-recipients";

/**
 * Durable inbox outbox consumer (§2): LISTEN before catch-up, drain pending
 * rows, transactional per job with FOR UPDATE SKIP LOCKED, bounded exponential
 * backoff (cap 5 min), dead after 10 failures, sanitized error codes only.
 * Notifications, their events and job completion commit in ONE transaction
 * (T05); delivery_key uniqueness makes replays no-ops (T06/T17).
 */
export interface OutboxJob {
	id: string;
	org_id: string;
	event_seq: string;
	consumer: string;
	traceparent: string | null;
	tracestate: string | null;
	state: string;
	attempts: number;
	available_at: Date;
	completed_at: Date | null;
	last_error_code: string | null;
}

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 5 * 60 * 1_000;
const MAX_ATTEMPTS = 10;
const OUTBOX_CHANNEL = "stellarc_outbox";

const backoffDelayMs = (attempts: number): number =>
	Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_CAP_MS);

/** Sanitized error code: never carries SQL text or content (§7 T29). */
function sanitizeErrorCode(error: unknown): string {
	if (typeof error === "object" && error !== null && "code" in error) {
		const code = String((error as { code: unknown }).code);
		if (/^[0-9A-Z_]{1,32}$/.test(code)) return code;
	}
	if (error instanceof Error && /^[0-9A-Z_]{1,32}$/.test(error.message))
		return error.message;
	return "UNKNOWN";
}

export interface ConsumerDeps {
	readonly sql: Sql;
	/** Delivery-time membership recheck (default: organization_member). */
	readonly isMember?: (org: string, userId: string) => Promise<boolean>;
}

/**
 * Process one job: claim (SKIP LOCKED) → decode → insert notifications +
 * notification:created events + complete, all in the claim transaction.
 * Returns true when the job was processed (either completed or moved to
 * error/dead bookkeeping), false when nothing was claimable.
 */
/** Span name is pinned for T28 (Worker.inbox.processJob). */
export const processOneJob = (
	deps: ConsumerDeps,
): Effect.Effect<boolean, unknown> =>
	Effect.fn("Worker.inbox.processJob")(function* () {
		const processed = yield* Effect.tryPromise({
			try: () =>
				deps.sql.begin(async (tx): Promise<boolean> => {
					const [job] = await tx<OutboxJob[]>`
          SELECT id, org_id, event_seq::text, consumer, traceparent, tracestate,
                 state, attempts, available_at, completed_at, last_error_code
          FROM notification_outbox
          WHERE state = 'pending' AND available_at <= now()
          ORDER BY available_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED`;
					if (!job) return false;
					const [event] = await tx<
						{
							plugin_type: string;
							payload: unknown;
							schema_version: number;
						}[]
					>`
          SELECT plugin_type, payload, schema_version
          FROM event WHERE org = ${job.org_id} AND seq = ${job.event_seq}`;
					if (!event || event.plugin_type !== "activity:comment-created") {
						// Unknown/corrupt payload → dead-letter immediately (fail closed).
						await tx`UPDATE notification_outbox
              SET state='dead', completed_at=now(), last_error_code=${event ? "UNSUPPORTED_EVENT" : "EVENT_MISSING"}
              WHERE id=${job.id}`;
						return true;
					}
					let payload: {
						id: string;
						ticketId: string;
						boardId: string;
						row: { content?: string | null };
						origin: string;
						mentionUserIds: string[];
						recipientUserIds: string[];
					};
					try {
						payload =
							typeof event.payload === "string"
								? JSON.parse(event.payload)
								: (event.payload as typeof payload);
						if (
							payload?.origin !== "live" ||
							typeof payload.id !== "string" ||
							!Array.isArray(payload.recipientUserIds)
						)
							throw new Error("MALFORMED_PAYLOAD");
					} catch {
						await tx`UPDATE notification_outbox
              SET state='dead', completed_at=now(), last_error_code='MALFORMED_PAYLOAD'
              WHERE id=${job.id}`;
						return true;
					}
					// Delivery-time membership recheck: revoked users get nothing (§2).
					const check = deps.isMember ?? defaultMembership(tx);
					const eligible: string[] = [];
					for (const userId of payload.recipientUserIds) {
						if (await check(job.org_id, userId)) eligible.push(userId);
					}
					const seq = BigInt(job.event_seq);
					for (const userId of eligible) {
						const key = deliveryKey(job.org_id, seq, userId);
						// delivery_key UNIQUE makes replayed jobs no-ops (T17).
						const inserted = await tx`
            INSERT INTO notification (id, org_id, user_id, title, content, type,
                                      event_data, is_read, resource_id, resource_type,
                                      source_org, source_seq, delivery_key)
            VALUES (${crypto.randomUUID()}, ${job.org_id}, ${userId},
                    NULL, ${(payload.row?.content ?? "").slice(0, 160)},
                    NULLIF(${notificationTypeFor(new Set(["participant"]))}, ''),
                    NULL, false, ${payload.ticketId}, 'task',
                    ${job.org_id}, ${seq.toString()}, ${key})
            ON CONFLICT (delivery_key) DO NOTHING
            RETURNING id`;
						if (inserted.length === 0) continue;
						const notificationId = inserted[0].id as string;
						await appendNotificationEvent(
							tx,
							job.org_id,
							job.traceparent,
							"notification:created",
							{
								id: notificationId,
								userId,
								orgId: job.org_id,
								row: { deliveryKey: key },
								origin: "live",
							},
						);
					}
					await tx`UPDATE notification_outbox
          SET state='complete', completed_at=now(), attempts=attempts+1
          WHERE id=${job.id}`;
					return true;
				}),
			catch: (cause) => cause,
		});
		return processed;
	})();

/** Bounded error bookkeeping in a SEPARATE transaction (§2): increments
 * attempts, schedules capped exponential backoff, dead after MAX_ATTEMPTS. */
export function recordJobError(
	sql: Sql,
	jobId: string,
	error: unknown,
): Promise<void> {
	return sql
		.begin(async (tx) => {
			const [row] = await tx<{ attempts: number }[]>`
      SELECT attempts FROM notification_outbox WHERE id=${jobId} FOR UPDATE`;
			const attempts = row ? Number(row.attempts) : 0;
			const next = attempts + 1;
			const dead = next >= MAX_ATTEMPTS;
			const delay = dead ? 0 : backoffDelayMs(next);
			// Guard the bookkeeping with the attempt floor so concurrent error
			// recordings can never push attempts past the dead threshold.
			await tx`UPDATE notification_outbox
      SET attempts = LEAST(attempts + 1, ${MAX_ATTEMPTS}),
          last_error_code = ${sanitizeErrorCode(error)},
          available_at = now() + make_interval(secs => ${delay / 1000.0}),
          state = ${dead ? "dead" : "pending"},
          completed_at = ${dead ? new Date() : null}
      WHERE id = ${jobId} AND state = 'pending'`;
		})
		.then(() => undefined);
}

/** pg_notify inside the producing transaction (§2): opaque org/job id only. */
export function notifyOutboxTx(
	tx: Sql,
	org: string,
	jobId: string,
): Promise<void> {
	return tx`SELECT pg_notify(${OUTBOX_CHANNEL}, ${`${org}:${jobId}`})`.then(
		() => undefined,
	);
}

export const OUTBOX_CHANNEL_NAME = OUTBOX_CHANNEL;

function defaultMembership(tx: Sql) {
	return async (org: string, userId: string): Promise<boolean> => {
		const rows = await tx`
      SELECT 1 FROM organization_member
      WHERE organization_id=${org} AND user_id=${userId} LIMIT 1`;
		return rows.length > 0;
	};
}

async function appendNotificationEvent(
	tx: Sql,
	org: string,
	traceparent: string | null,
	pluginType: string,
	payload: unknown,
): Promise<void> {
	void traceparent;
	// Same locked counter append as producers: the transaction already holds
	// the outbox job row lock, but the counter UPDATE needs the same ordering
	// discipline to serialize with concurrent producer transactions.
	await appendEventInTx(tx, org, "worker", pluginType, payload);
}
