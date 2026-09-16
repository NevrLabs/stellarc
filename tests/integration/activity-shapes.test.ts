import type { Sql } from "postgres";
import { expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import { appendEventInTx } from "../../packages/domain/src/activity-events";
import { createComment } from "../../packages/domain/src/activity";
import { seedIdentity } from "../helpers/activity-fixture";
import { makeCommentFixture } from "../helpers/comment-fixture";
import { disposablePostgres } from "../helpers/postgres";
import { ActivityNotificationShapes } from "../../packages/sync/src/activity-notification-shapes";

type Message = {
	headers: Record<string, unknown>;
	key?: string;
	value?: Record<string, unknown>;
};

const rowsOf = (messages: Message[]) =>
	messages.filter((m) => m.headers.operation);

test("T15 private notification snapshot is self-only: another user's rows never appear", async () => {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql: Sql = db.sql;
	await seedIdentity(sql, { org: "org-sh-1", users: ["user-a", "user-b"] });
	await sql`INSERT INTO notification (id, org_id, user_id, title, content, type, is_read)
    VALUES ('n-a','org-sh-1','user-a','t','c','info',false)`;
	await sql`INSERT INTO notification (id, org_id, user_id, title, content, type, is_read)
    VALUES ('n-b','org-sh-1','user-b','t','c','info',false)`;

	const shapes = new ActivityNotificationShapes(sql);
	const res = await shapes.privateShape(
		"user-a",
		new URL("http://x/users/me/v1/shape?table=notification"),
	);
	expect(res.status).toBe(200);
	const messages = (await res.json()) as Message[];
	const rows = rowsOf(messages);
	expect(rows).toHaveLength(1);
	expect(rows[0].value?.userId).toBe("user-a");
	expect(rows[0].value?.id).toBe("n-a");
	await db.close();
});

test("T15 private preference snapshot is self-only; non-private tables are 404", async () => {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql: Sql = db.sql;
	await seedIdentity(sql, { org: "org-sh-1", users: ["user-a", "user-b"] });
	await sql`INSERT INTO user_notification_preference (id, user_id)
    VALUES ('pref-a','user-a')`;
	await sql`INSERT INTO user_notification_preference (id, user_id)
    VALUES ('pref-b','user-b')`;

	const shapes = new ActivityNotificationShapes(sql);
	const res = await shapes.privateShape(
		"user-a",
		new URL("http://x/users/me/v1/shape?table=notification_preference"),
	);
	expect(res.status).toBe(200);
	const rows = rowsOf((await res.json()) as Message[]);
	expect(rows).toHaveLength(1);
	expect(rows[0].value?.userId).toBe("user-a");

	const foreign = await shapes.privateShape(
		"user-a",
		new URL("http://x/users/me/v1/shape?table=comment"),
	);
	expect(foreign.status).toBe(404);
	await db.close();
});

test("T14 activity org snapshot+tail: real comment mutation projects, txid travels, delete deletes", async () => {
	const fx = await makeCommentFixture();
	const shapes = new ActivityNotificationShapes(fx.sql);
	const create = () =>
		fx.run(
			createComment(fx.sql, {
				org: fx.org,
				ticketId: fx.ticketId,
				actor: fx.alice,
				content: "hello thread",
				tickets: fx.tickets,
				parseMentions: fx.parseMentions,
				resolveRecipients: fx.resolveRecipients,
				outbox: fx.outbox,
				origin: "live",
			}),
		);
	const first = await create();

	const snap = await shapes.orgShape(
		fx.org,
		new URL(
			`http://x/orgs/${fx.org}/v1/shape?table=activity&ticket=${fx.ticketId}`,
		),
	);
	expect(snap.status).toBe(200);
	const snapRows = rowsOf((await snap.json()) as Message[]);
	expect(snapRows).toHaveLength(1);
	expect(snapRows[0].value?.id).toBe(first.row.id);
	expect(snapRows[0].value?.content).toBe("hello thread");
	const boundary = snap.headers.get("x-stellarc-boundary");
	expect(boundary).toMatch(/^\d+$/);

	const second = await create();
	const tail = await shapes.orgShape(
		fx.org,
		new URL(
			`http://x/orgs/${fx.org}/v1/shape?table=activity&ticket=${fx.ticketId}&offset=${boundary}_0&handle=h`,
		),
	);
	expect(tail.status).toBe(200);
	const tailRows = rowsOf((await tail.json()) as Message[]);
	expect(tailRows.map((r) => r.value?.id)).toContain(second.row.id);
	const [eventTx] = await fx.sql`SELECT txid::text FROM event
    WHERE org=${fx.org} ORDER BY seq DESC LIMIT 1`;
	expect(Number(eventTx.txid)).toBe(second.txid);

	const { deleteComment } = await import("../../packages/domain/src/activity");
	await fx.run(
		deleteComment(fx.sql, {
			org: fx.org,
			ticketId: fx.ticketId,
			commentId: second.row.id,
			actor: fx.alice,
			expectedUpdatedAt: second.row.updatedAt,
			tickets: fx.tickets,
		}),
	);
	const tail2 = await shapes.orgShape(
		fx.org,
		new URL(
			`http://x/orgs/${fx.org}/v1/shape?table=activity&ticket=${fx.ticketId}&offset=${boundary}_0&handle=h`,
		),
	);
	const tail2Rows = rowsOf((await tail2.json()) as Message[]);
	expect(tail2Rows.some((r) => r.headers.operation === "delete")).toBe(true);
	await fx.close();
});

test("T14 private tail rides the user counter: worker insert reaches the inbox stream, foreign events never do", async () => {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql: Sql = db.sql;
	await seedIdentity(sql, { org: "org-sh-1", users: ["user-a", "user-b"] });
	const shapes = new ActivityNotificationShapes(sql);

	const ns = "user:user-a";
	const first = await appendEventInTx(sql, ns, "worker", "noop", {});
	const boundary = first.seq - 1n;

	await sql.begin(async (tx) => {
		await tx`INSERT INTO notification (id, org_id, user_id, title, content, type, is_read, delivery_key)
      VALUES ('n-live','org-sh-1','user-a','t','c','comment',false,'dk-1')`;
		await appendEventInTx(tx, ns, "worker", "notification:created", {
			id: "n-live",
			userId: "user-a",
			orgId: "org-sh-1",
			origin: "live",
		});
	});

	await sql.begin(async (tx) => {
		await tx`INSERT INTO notification (id, org_id, user_id, title, content, type, is_read, delivery_key)
      VALUES ('n-other','org-sh-1','user-b','t','c','comment',false,'dk-2')`;
		await appendEventInTx(tx, "user:user-b", "worker", "notification:created", {
			id: "n-other",
			userId: "user-b",
			orgId: "org-sh-1",
			origin: "live",
		});
	});

	const tail = await shapes.privateShape(
		"user-a",
		new URL(
			`http://x/users/me/v1/shape?table=notification&offset=${boundary}_0&handle=h`,
		),
	);
	expect(tail.status).toBe(200);
	const tailRows = rowsOf((await tail.json()) as Message[]);
	expect(tailRows.map((r) => r.value?.id)).toEqual(["n-live"]);
	await db.close();
});
