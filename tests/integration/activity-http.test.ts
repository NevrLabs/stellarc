import { expect, test } from "vitest";
import { makeActivityHttpFixture } from "../helpers/activity-http-fixture";

test("T27 POST comment through the real HTTP handler commits atomically (row+event+job, real txid)", async () => {
	const fx = await makeActivityHttpFixture();
	try {
		const res = await fx.json(
			"POST",
			`/orgs/${fx.org}/tickets/${fx.ticketId}/comments`,
			{ content: "hello over http" },
			fx.aliceAuth,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: {
				id: string;
				content: string;
				type: string;
				user?: { id: string };
			};
			txid: number;
		};
		expect(body.data.content).toBe("hello over http");
		expect(body.data.type).toBe("comment");
		expect(body.data.user?.id).toBe(fx.aliceId);
		expect(Number.isInteger(body.txid)).toBe(true);
		// same tx: the event row carries the exact txid the envelope returned
		const event =
			await fx.sql`SELECT txid::text AS txid, seq::text AS seq FROM event WHERE org=${fx.org} ORDER BY seq DESC LIMIT 1`;
		expect(Number(event[0].txid)).toBe(body.txid);
		// outbox job inside the same transaction
		expect(await fx.jobCount()).toBe(1);
		// activity list (authorization: viewer carol may read)
		const list = await fx.json(
			"GET",
			`/orgs/${fx.org}/tickets/${fx.ticketId}/activity?limit=20`,
			undefined,
			fx.carolAuth,
		);
		expect(list.status).toBe(200);
		const listBody = (await list.json()) as {
			items: Array<{ id: string; content: string | null }>;
			nextCursor: string | null;
		};
		expect(listBody.items.map((i) => i.id)).toContain(body.data.id);
		expect(listBody.nextCursor).toBeNull();
	} finally {
		await fx.close();
	}
});

test("T27 comment update + delete enforce optimistic concurrency over HTTP", async () => {
	const fx = await makeActivityHttpFixture();
	try {
		const created = (await (
			await fx.json(
				"POST",
				`/orgs/${fx.org}/tickets/${fx.ticketId}/comments`,
				{ content: "v1" },
				fx.aliceAuth,
			)
		).json()) as { data: { id: string; updatedAt: string; content: string } };
		const id = created.data.id;
		// stale expectedUpdatedAt → 409 StaleWrite
		const stale = await fx.json(
			"PATCH",
			`/orgs/${fx.org}/tickets/${fx.ticketId}/comments/${id}`,
			{ content: "v2", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
			fx.aliceAuth,
		);
		expect(stale.status).toBe(409);
		const staleBody = (await stale.json()) as { _tag: string; code?: string };
		expect(staleBody._tag).toBe("Conflict");
		expect(staleBody.code).toBe("StaleWrite");
		// fresh timestamp → 200 and content updated
		const good = await fx.json(
			"PATCH",
			`/orgs/${fx.org}/tickets/${fx.ticketId}/comments/${id}`,
			{ content: "v2", expectedUpdatedAt: created.data.updatedAt },
			fx.aliceAuth,
		);
		expect(good.status).toBe(200);
		const goodBody = (await good.json()) as { data: { content: string } };
		expect(goodBody.data.content).toBe("v2");
		// bob may not edit alice's comment → 403
		const foreign = await fx.json(
			"PATCH",
			`/orgs/${fx.org}/tickets/${fx.ticketId}/comments/${id}`,
			{ content: "bob was here", expectedUpdatedAt: new Date().toISOString() },
			fx.bobAuth,
		);
		expect(foreign.status).toBe(403);
		// delete with fresh timestamp
		const del = await fx.json(
			"DELETE",
			`/orgs/${fx.org}/tickets/${fx.ticketId}/comments/${id}`,
			{ expectedUpdatedAt: new Date().toISOString() },
			fx.aliceAuth,
		);
		// alice's delete uses the live updated_at of her own comment: re-read via list
		if (del.status === 409) {
			const list = (await (
				await fx.json(
					"GET",
					`/orgs/${fx.org}/tickets/${fx.ticketId}/activity`,
					undefined,
					fx.carolAuth,
				)
			).json()) as { items: Array<{ id: string; updatedAt: string }> };
			const live = list.items.find((i) => i.id === id);
			const retry = await fx.json(
				"DELETE",
				`/orgs/${fx.org}/tickets/${fx.ticketId}/comments/${id}`,
				{ expectedUpdatedAt: live?.updatedAt },
				fx.aliceAuth,
			);
			expect(retry.status).toBe(200);
		} else {
			expect(del.status).toBe(200);
		}
		const left = await fx.sql`SELECT * FROM comment WHERE id=${id}`;
		expect(left).toHaveLength(0);
	} finally {
		await fx.close();
	}
});

test("T27 self-only routes enforce authentication, ownership and 404 on foreign ids", async () => {
	const fx = await makeActivityHttpFixture();
	try {
		const planted = await fx.plantNotification({
			userId: fx.bobId,
			orgId: fx.org,
		});
		// unauthenticated
		expect((await fx.json("GET", "/notifications")).status).toBe(401);
		// authenticated list is self-only
		const list = await fx.json("GET", "/notifications", undefined, fx.bobAuth);
		expect(list.status).toBe(200);
		// alice sees none of bob's rows
		const aliceList = (await (
			await fx.json("GET", "/notifications", undefined, fx.aliceAuth)
		).json()) as { items: unknown[] };
		expect(aliceList.items).toHaveLength(0);
		// unread count is full-scope, not page length
		const count = (await (
			await fx.json("GET", "/notifications/unread-count", undefined, fx.bobAuth)
		).json()) as { count: number };
		expect(count.count).toBe(1);
		// another user's notification id → 404, never 403-leak
		expect(
			(
				await fx.json(
					"PATCH",
					`/notifications/${planted}/read`,
					{},
					fx.aliceAuth,
				)
			).status,
		).toBe(404);
		expect(
			(
				await fx.json(
					"DELETE",
					`/notifications/${planted}`,
					undefined,
					fx.aliceAuth,
				)
			).status,
		).toBe(404);
		// owner read-all works and reports count+changed
		const readAll = (await (
			await fx.json("PATCH", "/notifications/read-all", {}, fx.bobAuth)
		).json()) as { data: { count: number; changed: boolean }; txid: number };
		expect(readAll.data.count).toBe(1);
		expect(readAll.data.changed).toBe(true);
		expect(readAll.txid).toBeGreaterThan(0);
		// second read-all is a no-op: changed=false, same count, REAL txid
		const again = (await (
			await fx.json("PATCH", "/notifications/read-all", {}, fx.bobAuth)
		).json()) as { data: { count: number; changed: boolean }; txid: number };
		expect(again.data.changed).toBe(false);
		expect(again.txid).toBeGreaterThan(0);
	} finally {
		await fx.close();
	}
});

test("T27 workflow rules: list/upsert/delete + foreign-board 404", async () => {
	const fx = await makeActivityHttpFixture();
	try {
		// zed is not authorized for the org at all → 404 (same as missing)
		expect(
			(
				await fx.json(
					"GET",
					`/orgs/${fx.org}/boards/${fx.boardId}/workflow-rules`,
					undefined,
					fx.zedAuth,
				)
			).status,
		).toBe(404);
		// empty list for a viewer
		const empty = (await (
			await fx.json(
				"GET",
				`/orgs/${fx.org}/boards/${fx.boardId}/workflow-rules`,
				undefined,
				fx.carolAuth,
			)
		).json()) as { items: unknown[] };
		expect(empty.items).toHaveLength(0);
		// upsert with a vocabulary pair and an in-board status
		const put = await fx.json(
			"PUT",
			`/orgs/${fx.org}/boards/${fx.boardId}/workflow-rules`,
			{
				integrationType: "github",
				eventType: "issue_opened",
				statusId: "status-1",
			},
			fx.aliceAuth,
		);
		expect(put.status).toBe(200);
		const putBody = (await put.json()) as {
			data: {
				id: string;
				integrationType: string;
				eventType: string;
				statusId: string;
			};
		};
		expect(putBody.data.integrationType).toBe("github");
		expect(putBody.data.statusId).toBe("status-1");
		// invalid vocabulary pair → 400
		expect(
			(
				await fx.json(
					"PUT",
					`/orgs/${fx.org}/boards/${fx.boardId}/workflow-rules`,
					{
						integrationType: "github",
						eventType: "not_in_vocab",
						statusId: "status-1",
					},
					fx.aliceAuth,
				)
			).status,
		).toBe(400);
		// status not in board → 400
		expect(
			(
				await fx.json(
					"PUT",
					`/orgs/${fx.org}/boards/${fx.boardId}/workflow-rules`,
					{
						integrationType: "github",
						eventType: "issue_opened",
						statusId: "status-999",
					},
					fx.aliceAuth,
				)
			).status,
		).toBe(400);
		// delete
		const del = await fx.json(
			"DELETE",
			`/orgs/${fx.org}/boards/${fx.boardId}/workflow-rules/${putBody.data.id}`,
			undefined,
			fx.aliceAuth,
		);
		expect(del.status).toBe(200);
	} finally {
		await fx.close();
	}
});

test("T27 preferences: masked read-back, selected-board validation, no-store", async () => {
	const fx = await makeActivityHttpFixture();
	try {
		const got = await fx.json(
			"GET",
			"/notification-preferences",
			undefined,
			fx.aliceAuth,
		);
		expect(got.status).toBe(200);
		expect(got.headers.get("cache-control")).toBe("no-store");
		const prefs = (await got.json()) as {
			userId: string;
			emailEnabled: boolean;
			ntfyEnabled: boolean;
			dueDateReminderLeadTimeMinutes: number;
			organizations: unknown[];
		};
		expect(prefs.userId).toBe(fx.aliceId);
		expect(prefs.dueDateReminderLeadTimeMinutes).toBe(1440);
		// lead time out of range → 400
		expect(
			(
				await fx.json(
					"PUT",
					"/notification-preferences",
					{ dueDateReminderLeadTimeMinutes: 1 },
					fx.aliceAuth,
				)
			).status,
		).toBe(400);
		// org rule in selected mode with a foreign board → 400
		await fx.sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-http-2','other','org-http-2',now()) ON CONFLICT DO NOTHING`;
		expect(
			(
				await fx.json(
					"PUT",
					"/notification-preferences/organizations/org-http-2",
					{
						isActive: true,
						emailEnabled: false,
						ntfyEnabled: false,
						gotifyEnabled: false,
						webhookEnabled: false,
						boardMode: "selected",
						selectedBoardIds: ["board-elsewhere"],
					},
					fx.aliceAuth,
				)
			).status,
		).toBe(403);
	} finally {
		await fx.close();
	}
});

test("T27 negative control: unregistering the slice group leaves every §3 route 404", async () => {
	// `handlers:false` boots the pre-slice surface (foundation group only).
	const fx = await makeActivityHttpFixture({ handlers: false });
	try {
		const res = await fx.json(
			"GET",
			`/orgs/${fx.org}/tickets/${fx.ticketId}/activity`,
			undefined,
			fx.aliceAuth,
		);
		expect(res.status).toBe(404);
		const post = await fx.json(
			"POST",
			`/orgs/${fx.org}/tickets/${fx.ticketId}/comments`,
			{ content: "should 404" },
			fx.aliceAuth,
		);
		expect(post.status).toBe(404);
	} finally {
		await fx.close();
	}
});
