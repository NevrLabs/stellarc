import { expect, test } from "vitest";
import { runConsumerLoop } from "../../packages/domain/src/notification-consumer";
import {
	processOneJob,
	recordJobError,
} from "../../packages/domain/src/notification-outbox";
import {
	assignmentRecipients,
	deliveryKey,
	mergeRecipients,
	notificationTypeFor,
} from "../../packages/domain/src/notification-recipients";
import { makeWorkerFixture } from "../helpers/worker-fixture";

test("T05 crash before worker commit → restart → exactly one notification/event/completion", async () => {
	const fx = await makeWorkerFixture();
	try {
		const jobId = await fx.enqueueCommentCreatedJob({
			recipients: ["user-bob"],
		});
		// Crash: the claim transaction is aborted mid-flight (simulated by a
		// connection kill inside the claim). No notification/completion survives.
		await fx.simulateCrashDuringProcessing(jobId);
		expect(await fx.countNotifications()).toBe(0);
		expect(await fx.jobState(jobId)).toBe("pending");
		// Restart: the worker drains the durable row exactly once.
		const processed = await fx.run(processOneJob({ sql: fx.sql }));
		expect(processed).toBe(true);
		expect(await fx.countNotifications()).toBe(1);
		expect(await fx.jobState(jobId)).toBe("complete");
		// second drain finds nothing
		expect(await fx.run(processOneJob({ sql: fx.sql }))).toBe(false);
		expect(await fx.countNotifications()).toBe(1);
	} finally {
		await fx.close();
	}
});

test("T06 two concurrent consumers claim the same pending job without duplicate delivery", async () => {
	const fx = await makeWorkerFixture();
	try {
		const jobId = await fx.enqueueCommentCreatedJob({
			recipients: ["user-bob", "user-carol"],
		});
		const results = await Promise.all([
			fx.run(processOneJob({ sql: fx.sqlA })),
			fx.run(processOneJob({ sql: fx.sqlB })),
		]);
		// exactly one claim succeeded; the other found nothing
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(await fx.countNotifications()).toBe(2);
		expect(await fx.jobState(jobId)).toBe("complete");
	} finally {
		await fx.close();
	}
});

test("T08 poison job retries bounded then dead; healthy org drains alongside", async () => {
	const fx = await makeWorkerFixture();
	try {
		const poison = await fx.enqueueCorruptJob();
		// one combined drain: poison is dead-lettered immediately (fail closed)
		await fx.run(processOneJob({ sql: fx.sql }));
		expect(await fx.jobState(poison)).toBe("dead");
		expect(await fx.lastErrorCode(poison)).toBe("MALFORMED_PAYLOAD");
		// a healthy job enqueued afterwards still processes
		const healthy = await fx.enqueueCommentCreatedJob({
			recipients: ["user-bob"],
		});
		await fx.run(processOneJob({ sql: fx.sql }));
		expect(await fx.jobState(healthy)).toBe("complete");
	} finally {
		await fx.close();
	}
});

test("T08 recordJobError: bounded attempts, capped backoff, dead after MAX", async () => {
	const fx = await makeWorkerFixture();
	try {
		const job = await fx.enqueueCommentCreatedJob({
			recipients: ["user-bob"],
		});
		// Pure retry bookkeeping: transient failure twelve times — the job must
		// die at the 10th attempt with attempts=10, not loop forever.
		for (let i = 1; i <= 12; i++) {
			await recordJobError(fx.sql, job, new Error("TRANSIENT"));
		}
		expect(await fx.jobState(job)).toBe("dead");
		expect(await fx.attempts(job)).toBe(10);
		// further error records cannot push past the dead threshold
		await recordJobError(fx.sql, job, new Error("TRANSIENT"));
		expect(await fx.attempts(job)).toBe(10);
		// error code is the sanitized message only
		expect(await fx.lastErrorCode(job)).toBe("TRANSIENT");
	} finally {
		await fx.close();
	}
});

test("T17 completed job is never reclaimed; duplicate enqueue is blocked", async () => {
	const fx = await makeWorkerFixture();
	try {
		const jobId = await fx.enqueueCommentCreatedJob({
			recipients: ["user-bob"],
		});
		await fx.run(processOneJob({ sql: fx.sql }));
		expect(await fx.countNotifications()).toBe(1);
		// user clears the notification (history deletion)
		await fx.sql`DELETE FROM notification`;
		// A completed job is never picked up again by the drain (state filter).
		await fx.run(processOneJob({ sql: fx.sql }));
		expect(await fx.countNotifications()).toBe(0);
		// Even a malformed "replay" that resets the row to pending cannot
		// resurrect content: the notification row is gone and the delivery_key
		// INSERT ... ON CONFLICT DO NOTHING would re-add it — so the durable
		// guard is the UNIQUE(job) enqueue contract: a second job for the same
		// (org, event_seq, consumer) is rejected outright.
		await expect(fx.enqueueSameEventAgain(jobId)).rejects.toThrow();
	} finally {
		await fx.close();
	}
});

test("T10 revoked (non-member) recipient gets no content at delivery time", async () => {
	const fx = await makeWorkerFixture();
	try {
		// user-zed is NOT a member of the fixture org
		await fx.enqueueCommentCreatedJob({
			recipients: ["user-bob", "user-zed"],
		});
		await fx.run(processOneJob({ sql: fx.sql }));
		const recipients = await fx.sql`SELECT user_id::text FROM notification`;
		expect(recipients.map((r) => r.user_id)).toEqual(["user-bob"]);
	} finally {
		await fx.close();
	}
});

test("T07 LISTEN-before-catch-up, lost wakeup and retry deadline all drain durable jobs", async () => {
	const fx = await makeWorkerFixture();
	try {
		// Enqueued BEFORE the loop starts: only startup catch-up can drain it.
		const j1 = await fx.enqueueCommentCreatedJob({ recipients: ["user-bob"] });
		const fiber = await fx.runFork(
			runConsumerLoop({ sql: fx.sql, idleWaitMs: 50 }),
		);
		await fx.waitFor(async () => (await fx.jobState(j1)) === "complete", 5000);
		// Enqueued while running: the loop's notify wakeup drains it.
		const j2 = await fx.enqueueCommentCreatedJob({
			recipients: ["user-carol"],
		});
		await fx.sql`SELECT pg_notify('stellarc_outbox', 'wakeup')`;
		await fx.waitFor(async () => (await fx.jobState(j2)) === "complete", 5000);
		// Retry deadline: a future job is not run early, then drains on the
		// deadline wake (no pg_notify is involved in this transition).
		const j3 = await fx.enqueueCommentCreatedJob({ recipients: ["user-bob"] });
		await fx.sql`UPDATE notification_outbox SET available_at = now() + interval '300 milliseconds' WHERE id=${j3}`;
		await fx.sleep(60);
		expect(await fx.jobState(j3)).toBe("pending");
		await fx.waitFor(async () => (await fx.jobState(j3)) === "complete", 5000);
		await fiber.interrupt();
	} finally {
		await fx.close();
	}
});

test("T09 assignment semantics: only the new assignee, actor excluded", () => {
	expect(assignmentRecipients("user-alice", "user-bob")).toEqual(["user-bob"]);
	expect(assignmentRecipients("user-alice", "user-alice")).toEqual([]);
	expect(assignmentRecipients("user-alice", null)).toEqual([]);
});

test("T10 mention supersedes ordinary comment for the same recipient", () => {
	const merged = mergeRecipients("user-alice", [
		{ userId: "user-bob", kind: "assignee" },
		{ userId: "user-bob", kind: "mention" },
		{ userId: "user-bob", kind: "participant" },
		{ userId: "user-carol", kind: "participant" },
		{ userId: "user-alice", kind: "mention" }, // actor excluded
	]);
	const bobKinds = merged.byUser.get("user-bob");
	const carolKinds = merged.byUser.get("user-carol");
	expect(bobKinds).toEqual(new Set(["assignee", "mention", "participant"]));
	if (!bobKinds || !carolKinds) throw new Error("recipients missing");
	expect(notificationTypeFor(bobKinds)).toBe("task_mention");
	expect(notificationTypeFor(carolKinds)).toBe("task_comment");
	expect(merged.byUser.has("user-alice")).toBe(false);
});

test("delivery key canonical tuple encoding is stable", () => {
	expect(deliveryKey("org", 42n, "user-bob")).toBe("inbox:org:42:user-bob");
});
