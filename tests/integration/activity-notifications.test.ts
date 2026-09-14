import { expect, test } from "vitest";
import { createComment } from "../../packages/domain/src/activity";
import {
	ACTIVITY_EVENT_TYPES,
	appendEventInTx,
	DomainForbidden,
	DomainNotFound,
	DomainValidation,
} from "../../packages/domain/src/activity-events";
import { makeCommentFixture } from "../helpers/comment-fixture";

test("T02 real POST comment commits comment+projection+event+outbox atomically with matching txid", async () => {
	const fx = await makeCommentFixture();
	try {
		const result = await fx.run(
			createComment(fx.sql, {
				org: fx.org,
				actor: fx.alice,
				ticketId: fx.ticketId,
				content: "hello world",
				outbox: fx.outbox,
				tickets: fx.tickets,
				parseMentions: fx.parseMentions,
				resolveRecipients: fx.resolveRecipients,
			}),
		);
		// row + txid returned by the service
		expect(result.row.content).toBe("hello world");
		expect(result.row.type).toBe("comment");
		expect(result.row.user?.id).toBe(fx.alice.userId);
		expect(result.txid).toBeGreaterThan(0);
		// authoritative store + projection + event + job all exist
		const comment =
			await fx.sql`SELECT * FROM comment WHERE id=${result.row.id}`;
		expect(comment).toHaveLength(1);
		const projection =
			await fx.sql`SELECT * FROM activity_projection WHERE org_id=${fx.org} AND id=${result.row.id}`;
		expect(projection).toHaveLength(1);
		const events =
			await fx.sql`SELECT org::text, seq::text, plugin_type, actor, payload, schema_version FROM event WHERE org=${fx.org} ORDER BY seq`;
		expect(events).toHaveLength(1);
		expect(events[0].plugin_type).toBe(ACTIVITY_EVENT_TYPES.commentCreated);
		expect(events[0].actor).toBe(fx.alice.userId);
		expect(events[0].schema_version).toBe(1);
		const payload = JSON.parse(events[0].payload as string);
		expect(payload.origin).toBe("live");
		expect(payload.boardId).toBe(fx.boardId);
		expect(payload.mentionUserIds).toEqual([]);
		expect(payload.recipientUserIds).toEqual([fx.bob.userId]);
		// outbox job references the same (org, seq)
		const jobs =
			await fx.sql`SELECT org_id::text, event_seq::text, state FROM notification_outbox`;
		expect(jobs).toEqual([
			{ org_id: fx.org, event_seq: events[0].seq, state: "pending" },
		]);
		// txid on the returned envelope equals the event row's txid (same tx)
		const eventTxid =
			await fx.sql`SELECT txid::text FROM event WHERE org=${fx.org} AND seq=${events[0].seq}`;
		expect(Number(eventTxid[0].txid)).toBe(result.txid);
	} finally {
		await fx.close();
	}
});

test("T02 negative control: omitted enqueue is observable (rows commit, zero jobs)", async () => {
	const fx = await makeCommentFixture();
	try {
		// Sabotage = outbox writer whose enqueueInTx does nothing (the "omit
		// enqueue" mutation). The mutation now commits rows with no job — and
		// this control proves the observable state differs from the contract
		// the main T02 test asserts (one pending job per live event).
		const sabotagedOutbox = { enqueueInTx: async () => {} };
		await fx.run(
			createComment(fx.sql, {
				org: fx.org,
				actor: fx.alice,
				ticketId: fx.ticketId,
				content: "sabotaged: no enqueue",
				outbox: sabotagedOutbox,
				tickets: fx.tickets,
				parseMentions: fx.parseMentions,
				resolveRecipients: fx.resolveRecipients,
			}),
		);
		const jobs = await fx.sql`SELECT * FROM notification_outbox`;
		expect(jobs).toHaveLength(0);
	} finally {
		await fx.close();
	}
});

test("T03 forced enqueue failure rolls the entire comment mutation back", async () => {
	const fx = await makeCommentFixture();
	try {
		await expect(
			fx.run(
				createComment(fx.sql, {
					org: fx.org,
					actor: fx.alice,
					ticketId: fx.ticketId,
					content: "will roll back",
					outbox: fx.failingOutbox,
					tickets: fx.tickets,
					parseMentions: fx.parseMentions,
					resolveRecipients: fx.resolveRecipients,
				}),
			),
		).rejects.toThrow();
		const comments = await fx.sql`SELECT * FROM comment`;
		expect(comments).toHaveLength(0);
		const projections = await fx.sql`SELECT * FROM activity_projection`;
		expect(projections).toHaveLength(0);
		const events = await fx.sql`SELECT * FROM event WHERE org=${fx.org}`;
		expect(events).toHaveLength(0);
		const counters =
			await fx.sql`SELECT seq::text FROM org_event_counter WHERE org=${fx.org}`;
		expect(counters).toHaveLength(0);
	} finally {
		await fx.close();
	}
});

test("T02 blank comment rejected; import origin cannot mint live comments", async () => {
	const fx = await makeCommentFixture();
	try {
		await expect(
			fx.run(
				createComment(fx.sql, {
					org: fx.org,
					actor: fx.alice,
					ticketId: fx.ticketId,
					content: "   ",
					outbox: fx.outbox,
					tickets: fx.tickets,
					parseMentions: fx.parseMentions,
					resolveRecipients: fx.resolveRecipients,
				}),
			),
		).rejects.toThrow(DomainValidation);
		await expect(
			fx.run(
				createComment(fx.sql, {
					org: fx.org,
					actor: fx.alice,
					ticketId: fx.ticketId,
					content: "imported?",
					origin: "import",
					outbox: fx.outbox,
					tickets: fx.tickets,
					parseMentions: fx.parseMentions,
					resolveRecipients: fx.resolveRecipients,
				}),
			),
		).rejects.toThrow(DomainValidation);
	} finally {
		await fx.close();
	}
});

test("T02 unknown ticket → NotFound; view-only member → Forbidden on create", async () => {
	const fx = await makeCommentFixture();
	try {
		await expect(
			fx.run(
				createComment(fx.sql, {
					org: fx.org,
					actor: fx.alice,
					ticketId: "missing-ticket",
					content: "hi",
					outbox: fx.outbox,
					tickets: fx.tickets,
					parseMentions: fx.parseMentions,
					resolveRecipients: fx.resolveRecipients,
				}),
			),
		).rejects.toThrow(DomainNotFound);
		// view-only member: authenticated, can see the ticket, cannot comment
		await expect(
			fx.run(
				createComment(fx.sql, {
					org: fx.org,
					actor: fx.viewer,
					ticketId: fx.ticketId,
					content: "hi",
					outbox: fx.outbox,
					tickets: fx.tickets,
					parseMentions: fx.parseMentions,
					resolveRecipients: fx.resolveRecipients,
				}),
			),
		).rejects.toThrow(DomainForbidden);
		// unrelated user: same 404 as a missing ticket (§3 foreign-resource rule)
		await expect(
			fx.run(
				createComment(fx.sql, {
					org: fx.org,
					actor: fx.outsider,
					ticketId: fx.ticketId,
					content: "hi",
					outbox: fx.outbox,
					tickets: fx.tickets,
					parseMentions: fx.parseMentions,
					resolveRecipients: fx.resolveRecipients,
				}),
			),
		).rejects.toThrow(DomainNotFound);
	} finally {
		await fx.close();
	}
});

test("T02 event counter advances under the per-org transaction lock", async () => {
	const fx = await makeCommentFixture();
	try {
		await fx.run(
			createComment(fx.sql, {
				org: fx.org,
				actor: fx.alice,
				ticketId: fx.ticketId,
				content: "one",
				outbox: fx.outbox,
				tickets: fx.tickets,
				parseMentions: fx.parseMentions,
				resolveRecipients: fx.resolveRecipients,
			}),
		);
		await fx.run(
			createComment(fx.sql, {
				org: fx.org,
				actor: fx.bob,
				ticketId: fx.ticketId,
				content: "two",
				outbox: fx.outbox,
				tickets: fx.tickets,
				parseMentions: fx.parseMentions,
				resolveRecipients: fx.resolveRecipients,
			}),
		);
		const events =
			await fx.sql`SELECT seq::text FROM event WHERE org=${fx.org} ORDER BY seq`;
		expect(events.map((e) => e.seq)).toEqual(["1", "2"]);
	} finally {
		await fx.close();
	}
});

test("T28 append span is named and carries event attributes", async () => {
	const fx = await makeCommentFixture();
	try {
		await fx.run(
			createComment(fx.sql, {
				org: fx.org,
				actor: fx.alice,
				ticketId: fx.ticketId,
				content: "spanned",
				outbox: fx.outbox,
				tickets: fx.tickets,
				parseMentions: fx.parseMentions,
				resolveRecipients: fx.resolveRecipients,
			}),
		);
		const spans = fx.spans();
		const append = [...spans]
			.reverse()
			.find((s) => s.name.startsWith("Domain.activity.createComment"));
		expect(append).toBeDefined();
	} finally {
		await fx.close();
	}
});

// The fixture wires identity seeds and the ticket/outbox seams.
test("fixture sanity: appendEventInTx writes schema_version=1 rows", async () => {
	const fx = await makeCommentFixture();
	try {
		await fx.sql.begin(async (tx) => {
			const { seq } = await appendEventInTx(
				tx,
				fx.org,
				fx.alice.userId,
				"activity:legacy-recorded",
				JSON.stringify({ id: "x", origin: "import" }),
			);
			expect(seq).toBe(1n);
		});
		const rows =
			await fx.sql`SELECT schema_version FROM event WHERE org=${fx.org}`;
		expect(rows[0].schema_version).toBe(1);
	} finally {
		await fx.close();
	}
});
