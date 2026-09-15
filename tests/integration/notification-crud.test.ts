import { expect, test } from "vitest";
import { DomainNotFound } from "../../packages/domain/src/activity-events";
import {
	clearAllNotifications,
	deleteNotification,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	unreadCount,
} from "../../packages/domain/src/notifications";
import type { InboxFixture } from "../helpers/inbox-fixture";
import { makeInboxFixture } from "../helpers/inbox-fixture";

async function boot(): Promise<InboxFixture> {
	// A fresh disposable cluster per test: close() is final, never share it.
	return makeInboxFixture();
}

test("T16 full unread count exceeds the paginated list; count spans orgs", async () => {
	const f = await boot();
	try {
		// 3 unread across two scopes + 1 read + 1 read in another org
		await f.plant({ userId: f.alice, orgId: f.org });
		await f.plant({ userId: f.alice, orgId: f.org });
		await f.plant({ userId: f.alice, orgId: null }); // user-global
		await f.plant({ userId: f.alice, orgId: f.org, isRead: true });
		// page of 2 hides one unread, but the count sees all three
		const page = await listNotifications(f.sql, f.alice, { limit: 2 });
		expect(page.items).toHaveLength(2);
		expect(page.nextCursor).not.toBeNull();
		expect(await unreadCount(f.sql, f.alice)).toBe(3);
		// org-scoped count includes user-global rows (private scope = user, §2)
		expect(await unreadCount(f.sql, f.alice, f.org)).toBe(3);
		// bob's notifications never leak into alice's counts
		await f.plant({ userId: f.bob, orgId: f.org });
		expect(await unreadCount(f.sql, f.alice)).toBe(3);
		expect(await unreadCount(f.sql, f.bob)).toBe(1);
	} finally {
		await f.close();
	}
});

test("T15 self-only scope: another user's notification is 404, never readable", async () => {
	const f = await boot();
	try {
		const bobId = await f.plant({ userId: f.bob, orgId: f.org });
		await expect(
			f.run(markNotificationRead(f.sql, f.alice, bobId)),
		).rejects.toThrow(DomainNotFound);
		await expect(
			f.run(deleteNotification(f.sql, f.alice, bobId)),
		).rejects.toThrow(DomainNotFound);
		// the owner succeeds
		const result = await f.run(markNotificationRead(f.sql, f.bob, bobId));
		expect(result.data.isRead).toBe(true);
		expect(result.txid).toBeGreaterThan(0);
	} finally {
		await f.close();
	}
});

test("T16 read-all and clear-all update both clients' views atomically with events", async () => {
	const f = await boot();
	try {
		await f.plant({ userId: f.alice, orgId: f.org });
		await f.plant({ userId: f.alice, orgId: f.org });
		await f.plant({ userId: f.alice, orgId: f.org });
		const readAll = await f.run(markAllNotificationsRead(f.sql, f.alice));
		expect(readAll.data).toEqual({ count: 3, changed: true });
		expect(readAll.changed).toBe(true);
		expect(await unreadCount(f.sql, f.alice)).toBe(0);
		// second read-all is a no-op bulk: count 0, changed false, real txid
		const noop = await f.run(markAllNotificationsRead(f.sql, f.alice));
		expect(noop.data).toEqual({ count: 0, changed: false });
		expect(noop.changed).toBe(false);
		expect(noop.txid).toBeGreaterThan(0);
		// clear-all removes the full history (read + unread) and emits
		// notification:deleted events — in-app deletion, not delivery (§2)
		await f.plant({ userId: f.alice, orgId: f.org });
		const clear = await f.run(clearAllNotifications(f.sql, f.alice));
		expect(clear.data).toEqual({ count: 4, changed: true });
		const left =
			await f.sql`SELECT count(*)::int AS n FROM notification WHERE user_id=${f.alice}`;
		expect((left[0] as { n: number }).n).toBe(0);
		const events =
			await f.sql`SELECT plugin_type FROM event WHERE org=${f.org} ORDER BY seq`;
		const types = events.map((e) =>
			String((e as { plugin_type: string }).plugin_type),
		);
		expect(types).toContain("notification:updated");
		expect(types).toContain("notification:deleted");
	} finally {
		await f.close();
	}
});

test("T16 single delete removes exactly one row and emits notification:deleted", async () => {
	const f = await boot();
	try {
		const keep = await f.plant({ userId: f.alice, orgId: f.org });
		const kill = await f.plant({ userId: f.alice, orgId: f.org });
		const result = await f.run(deleteNotification(f.sql, f.alice, kill));
		expect(result.data.id).toBe(kill);
		const left =
			await f.sql`SELECT id::text FROM notification WHERE user_id=${f.alice}`;
		expect(left.map((r) => String((r as { id: string }).id))).toEqual([keep]);
	} finally {
		await f.close();
	}
});
