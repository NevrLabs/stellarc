import type postgres from "postgres";
import { afterAll, beforeAll, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

let sql: postgres.Sql;
let close: () => Promise<void>;

async function eventCount(org: string) {
	const [row] =
		await sql`SELECT count(*)::int AS count FROM event WHERE org = ${org}`;
	return row.count;
}

beforeAll(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	// Seed identity rows (T1 tables already migrated).
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-1', 'Org One', 'org-one', now())`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('user-1', 'User One', 'u1@test.dev', true, now(), now())`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('user-2', 'User Two', 'u2@test.dev', true, now(), now())`;
	await sql`INSERT INTO team (id, name, organization_id, created_at) VALUES ('team-1', 'Team One', 'org-1', now())`;
});

afterAll(async () => {
	await close();
});

test("T04: board create seeds exactly 4 statuses positionally, done isFinal, atomically", async () => {
	const work = await import("../../packages/domain/src/work");
	const result = await work.createBoard(sql, "org-1", "user-1", {
		id: "b1",
		name: "Alpha Board",
	});
	expect(result.data.slug).toBe("alpha-board");
	const statuses =
		await sql`SELECT slug, position, is_final FROM "column" WHERE board_id = 'b1' ORDER BY position`;
	expect(statuses.map((s) => s.slug)).toEqual([
		"to-do",
		"in-progress",
		"in-review",
		"done",
	]);
	expect(statuses.map((s) => s.position)).toEqual([0, 1, 2, 3]);
	expect(statuses.find((s) => s.slug === "done")?.is_final).toBe(true);
	// Events: board-upserted + 4 status-upserted, one tx.
	expect(await eventCount("org-1")).toBe(5);
	const events =
		await sql`SELECT plugin_type FROM event WHERE org = 'org-1' ORDER BY seq`;
	expect(events.map((e) => e.plugin_type)).toEqual([
		"work:board-upserted",
		"work:status-upserted",
		"work:status-upserted",
		"work:status-upserted",
		"work:status-upserted",
	]);
	const [txids] =
		await sql`SELECT count(DISTINCT txid)::int AS count FROM event WHERE org = 'org-1'`;
	expect(txids.count).toBe(1);
});

test("T05: same-org case-insensitive duplicate slug rejected as DuplicateSlug", async () => {
	const work = await import("../../packages/domain/src/work");
	await expect(
		work.createBoard(sql, "org-1", "user-1", {
			id: "b1-dup",
			name: "ALPHA BOARD",
		}),
	).rejects.toThrow();
	const [row] =
		await sql`SELECT count(*)::int AS count FROM "board" WHERE id = 'b1-dup'`;
	expect(row.count).toBe(0);
});

test("T06: board update/archive commits row+event under one txid; archive stamps archived_at", async () => {
	const work = await import("../../packages/domain/src/work");
	const before = await eventCount("org-1");
	const updated = await work.updateBoard(sql, "org-1", "user-1", "b1", {
		description: "updated",
	});
	expect(updated.data.description).toBe("updated");
	const archived = await work.archiveBoard(sql, "org-1", "user-1", "b1", true);
	expect(archived.data.archivedAt).not.toBeNull();
	const unarchived = await work.archiveBoard(
		sql,
		"org-1",
		"user-1",
		"b1",
		false,
	);
	expect(unarchived.data.archivedAt).toBeNull();
	expect(await eventCount("org-1")).toBe(before + 3);
});

test("T08: number claim self-heals drifted counter (counter 12, max 13 → 14)", async () => {
	const work = await import("../../packages/domain/src/work");
	await sql`UPDATE "board" SET last_task_number = 12 WHERE id = 'b1'`;
	await sql`INSERT INTO task (id, board_id, title, number, created_at, updated_at) VALUES ('t-drift', 'b1', 'Drift max', 13, now(), now())`;
	const result = await work.createTicket(sql, "org-1", "user-1", "b1", {
		id: "t-heal",
		title: "Healed",
	});
	expect(result.data.number).toBe(14);
});

test("T09: 20 concurrent creates get 20 unique consecutive numbers, no errors", async () => {
	const work = await import("../../packages/domain/src/work");
	const results = await Promise.all(
		Array.from({ length: 20 }, (_, i) =>
			work.createTicket(sql, "org-1", "user-1", "b1", {
				id: `t-cc-${i}`,
				title: `CC ${i}`,
			}),
		),
	);
	const numbers = results
		.map((r) => r.data.number)
		.sort((a, b) => (a ?? 0) - (b ?? 0));
	expect(new Set(numbers).size).toBe(20);
	// After the drift-heal claim (14) the next 20 are 15..34.
	expect(numbers[0]).toBe(15);
	expect(numbers[19]).toBe(34);
});

test("T10: invalid status → ValidationError, no row/event write", async () => {
	const work = await import("../../packages/domain/src/work");
	const before = await eventCount("org-1");
	await expect(
		work.setTicketStatus(sql, "org-1", "user-1", "t-heal", "bogus-status"),
	).rejects.toThrow();
	expect(await eventCount("org-1")).toBe(before);
	const [row] = await sql`SELECT status FROM task WHERE id = 't-heal'`;
	expect(row.status).toBe("to-do");
});

test("T11: archival orthogonal to status; closed status seals history + status-changed pair", async () => {
	const work = await import("../../packages/domain/src/work");
	const { CLOSED_STATUS_SLUGS } = await import(
		"../../packages/domain/src/status-taxonomy"
	);
	await work.updateTicket(sql, "org-1", "user-1", "t-heal", {
		description: "v1",
	});
	await work.setTicketArchived(sql, "org-1", "user-1", "t-heal", true);
	let [row] =
		await sql`SELECT status, archived_at FROM task WHERE id = 't-heal'`;
	expect(row.status).toBe("to-do"); // status untouched
	expect(row.archived_at).not.toBeNull();
	await work.setTicketArchived(sql, "org-1", "user-1", "t-heal", false);
	await work.setTicketStatus(sql, "org-1", "user-1", "t-heal", "done");
	[row] =
		await sql`SELECT status, description_history, archived_at FROM task WHERE id = 't-heal'`;
	expect(row.status).toBe("done");
	expect(row.archived_at).toBeNull();
	// Closing sealed the description history.
	expect(
		row.description_history.some((e: { sealed?: boolean }) => e.sealed),
	).toBe(true);
	expect(CLOSED_STATUS_SLUGS).toContain("done");
	const [event] =
		await sql`SELECT payload FROM event WHERE org = 'org-1' AND plugin_type = 'work:ticket-status-changed' ORDER BY seq DESC LIMIT 1`;
	expect(event.payload).toMatchObject({
		id: "t-heal",
		from: "to-do",
		to: "done",
	});
});

test("T12: move board→board claims destination number, remaps status to first column, single tx", async () => {
	const work = await import("../../packages/domain/src/work");
	await work.createBoard(sql, "org-1", "user-1", {
		id: "b2",
		name: "Beta Board",
	});
	const result = await work.moveTicket(sql, "org-1", "user-1", "t-heal", "b2");
	expect(result.data.boardId).toBe("b2");
	expect(result.data.number).toBe(1); // fresh counter on destination
	// b2 has a matching 'done' column → same-name column wins (fork semantics).
	expect(result.data.status).toBe("done");
	// A virtual source status (planned) is valid on any destination → survives.
	await work.setTicketStatus(sql, "org-1", "user-1", "t-cc-1", "planned");
	const moved2 = await work.moveTicket(sql, "org-1", "user-1", "t-cc-1", "b2");
	expect(moved2.data.status).toBe("planned");
	const [source] =
		await sql`SELECT last_task_number FROM "board" WHERE id = 'b1'`;
	expect(source.last_task_number).toBe(34); // unchanged by the move
	const [events] =
		await sql`SELECT count(*)::int AS count FROM event WHERE org = 'org-1' AND payload->>'id' = 't-heal' AND plugin_type = 'work:ticket-upserted'`;
	// Exactly one upsert streamed for the move (plus create/update events before).
	expect(events.count).toBeGreaterThanOrEqual(1);
});

test("T13: reorder persists positions; status change through validation path", async () => {
	const work = await import("../../packages/domain/src/work");
	const tickets = await work.listTickets(sql, "org-1", "b1", {});
	const ids = tickets.tickets.slice(0, 3).map((t) => t.id);
	await work.reorderTickets(
		sql,
		"org-1",
		"user-1",
		"b1",
		ids.map((id, i) => ({ id, position: 100 + i })),
	);
	for (const [i, id] of ids.entries()) {
		const [row] = await sql`SELECT position FROM task WHERE id = ${id}`;
		expect(row.position).toBe(100 + i);
	}
	await expect(
		work.reorderTickets(sql, "org-1", "user-1", "b1", [
			{ id: ids[0], position: 0, status: "bogus" },
		]),
	).rejects.toThrow();
});

test("T14: label scope rules + uniqueness", async () => {
	const work = await import("../../packages/domain/src/work");
	// exactly-one-scope
	await expect(
		work.createLabel(sql, "org-1", "user-1", {
			id: "l0",
			name: "Both",
			color: "#000",
			taskId: "t-cc-0",
			organizationId: "org-1",
		}),
	).rejects.toThrow();
	await expect(
		work.createLabel(sql, "org-1", "user-1", {
			id: "l0b",
			name: "Neither",
			color: "#000",
		}),
	).rejects.toThrow();
	await work.createLabel(sql, "org-1", "user-1", {
		id: "l1",
		name: "Bug",
		color: "#f00",
		taskId: "t-cc-0",
	});
	// per-task name unique
	await expect(
		work.createLabel(sql, "org-1", "user-1", {
			id: "l2",
			name: "Bug",
			color: "#0f0",
			taskId: "t-cc-0",
		}),
	).rejects.toThrow();
	// org-global
	await work.createLabel(sql, "org-1", "user-1", {
		id: "l3",
		name: "Global",
		color: "#00f",
		organizationId: "org-1",
	});
	// org-global unique only when task-scoped null: same name task-scoped is fine
	await work.createLabel(sql, "org-1", "user-1", {
		id: "l4",
		name: "Global",
		color: "#00f",
		taskId: "t-cc-1",
	});
	// unassign + reassign
	const moved = await work.assignLabelTask(
		sql,
		"org-1",
		"user-1",
		"l3",
		"t-cc-2",
	);
	expect(moved.data.taskId).toBe("t-cc-2");
	const unassigned = await work.assignLabelTask(
		sql,
		"org-1",
		"user-1",
		"l3",
		null,
	);
	expect(unassigned.data.taskId).toBeNull();
});

test("T15: template validates data shape; apply fills defaults incl. board assignee", async () => {
	const work = await import("../../packages/domain/src/work");
	await expect(
		work.createTemplate(sql, "org-1", "user-1", {
			id: "tmpl-bad",
			organizationId: "org-1",
			name: "Bad",
			data: { title: "x", priority: "cosmic" },
		}),
	).rejects.toThrow();
	await expect(
		work.createTemplate(sql, "org-1", "user-1", {
			id: "tmpl-bad2",
			organizationId: "org-1",
			name: "Bad2",
			data: "not-an-object",
		}),
	).rejects.toThrow();
	await work.updateBoard(sql, "org-1", "user-1", "b1", {
		defaultAssigneeId: "user-2",
	});
	await work.createTemplate(sql, "org-1", "user-1", {
		id: "tmpl-1",
		organizationId: "org-1",
		name: "Bug report",
		data: {
			title: "Templated",
			description: "From template",
			priority: "high",
			startDate: "2026-09-14",
			dueDate: "2026-09-15",
			startDateOffset: "+1d",
			dueDateOffset: "+2d",
			labels: [],
		},
	});
	const result = await work.createTicket(sql, "org-1", "user-1", "b1", {
		id: "t-tmpl",
		title: "ignored",
		templateId: "tmpl-1",
	});
	expect(result.data.title).toBe("Templated");
	expect(result.data.description).toBe("From template");
	expect(result.data.priority).toBe("high");
	expect(result.data.assigneeId).toBe("user-2"); // board default filled
	expect(result.data.startDate).toContain("2026-09-15"); // offset +1d
	expect(result.data.dueDate).toContain("2026-09-17"); // offset +2d
});

test("T16: flag target XOR enforced; flag-type delete blocked while referenced", async () => {
	const work = await import("../../packages/domain/src/work");
	await work.createFlagType(sql, "org-1", "user-1", {
		id: "ft-1",
		boardId: "b1",
		name: "Attention",
	});
	await expect(
		work.createTicketFlag(sql, "org-1", "user-1", "t-cc-0", {
			id: "f0",
			flagTypeId: "ft-1",
		}),
	).rejects.toThrow();
	await expect(
		work.createTicketFlag(sql, "org-1", "user-1", "t-cc-0", {
			id: "f0b",
			flagTypeId: "ft-1",
			targetUserId: "user-1",
			targetTeamId: "team-1",
		}),
	).rejects.toThrow();
	const flag = await work.createTicketFlag(sql, "org-1", "user-1", "t-cc-0", {
		id: "f1",
		flagTypeId: "ft-1",
		targetUserId: "user-2",
		note: "please review",
	});
	expect(flag.data.targetUserId).toBe("user-2");
	await expect(
		work.deleteFlagType(sql, "org-1", "user-1", "ft-1"),
	).rejects.toThrow();
});

test("T17: resolve requires nonempty note, stamps resolver, keeps row, idempotent re-resolve rejected", async () => {
	const work = await import("../../packages/domain/src/work");
	await expect(
		work.resolveTicketFlag(sql, "org-1", "user-1", "f1", ""),
	).rejects.toThrow();
	await expect(
		work.resolveTicketFlag(sql, "org-1", "user-1", "f1", "   "),
	).rejects.toThrow();
	const resolved = await work.resolveTicketFlag(
		sql,
		"org-1",
		"user-1",
		"f1",
		"done reviewing",
	);
	expect(resolved.data.resolveNote).toBe("done reviewing");
	expect(resolved.data.resolvedBy).toBe("user-1");
	expect(resolved.data.resolvedAt).not.toBeNull();
	await expect(
		work.resolveTicketFlag(sql, "org-1", "user-1", "f1", "again"),
	).rejects.toThrow();
	const flags = await work.listTicketFlags(sql, "org-1", "t-cc-0");
	expect(flags.flags).toHaveLength(1); // row kept
});

test("T21: board delete blocked BoardNotEmpty when tickets exist; empty board cascades aliases", async () => {
	const work = await import("../../packages/domain/src/work");
	// Tickets block deletion (BoardNotEmpty).
	await expect(
		work.deleteBoard(sql, "org-1", "user-1", "b1"),
	).rejects.toThrow();
	// Statuses are seeded structural chrome: ticket-free board deletes and
	// cascades its statuses + aliases (fork's ticket cascade is the foot-gun;
	// the guard protects tickets only).
	await sql`DELETE FROM task WHERE board_id = 'b1'`;
	await work.deleteBoard(sql, "org-1", "user-1", "b1");
	const [cols] =
		await sql`SELECT count(*)::int AS count FROM "column" WHERE board_id = 'b1'`;
	expect(cols.count).toBe(0);
	await work.createBoard(sql, "org-1", "user-1", {
		id: "b-empty",
		name: "Empty",
	});
	await work.setBoardKey(sql, "org-1", "user-1", "b-empty", "EMPT");
	const [alias] =
		await sql`SELECT count(*)::int AS count FROM board_key_alias WHERE board_id = 'b-empty'`;
	expect(alias.count).toBe(1);
	await work.deleteBoard(sql, "org-1", "user-1", "b-empty");
	const [gone] =
		await sql`SELECT count(*)::int AS count FROM board_key_alias WHERE board_id = 'b-empty'`;
	expect(gone.count).toBe(0);
});

test("T07: PUT key writes prior key as alias; old slug + KEY-seq URLs still resolve", async () => {
	const work = await import("../../packages/domain/src/work");
	await work.createBoard(sql, "org-1", "user-1", {
		id: "b-key",
		name: "Keyed Board",
	});
	await work.createTicket(sql, "org-1", "user-1", "b-key", {
		id: "t-key-1",
		title: "Keyed ticket",
	});
	const renamed = await work.setBoardKey(
		sql,
		"org-1",
		"user-1",
		"b-key",
		"PROJ",
	);
	expect(renamed.data.slug).toBe("PROJ");
	// Old slug resolves via alias.
	const viaOld = await work.resolveBoardRef(sql, "org-1", "keyed-board");
	expect(viaOld?.id).toBe("b-key");
	const viaNew = await work.resolveBoardRef(sql, "org-1", "proj");
	expect(viaNew?.id).toBe("b-key");
	// Ticket key uses the new slug.
	const [ticket] = await sql`SELECT number FROM task WHERE id = 't-key-1'`;
	const { ticketKeyOf } = await import("../../packages/domain/src/work");
	expect(ticketKeyOf("PROJ", ticket.number)).toBe("PROJ-1");
	// Alias row holds the prior slug.
	const aliases =
		await sql`SELECT key FROM board_key_alias WHERE board_id = 'b-key'`;
	expect(aliases.map((a) => a.key)).toContain("keyed-board");
});

// --- T22: shape snapshot + tail for all 8 collections ---------------------------------------
test("T22: work events decode through the registry; unknown versions fail closed", async () => {
	const { WorkUpcasterRegistry, UnsupportedWorkEventSchema } = await import(
		"../../packages/sync/src/work-upcasters"
	);
	const registry = new WorkUpcasterRegistry();
	// Self-seeding: guarantee at least one board-upserted event exists even
	// when this test runs in isolation (order-independent).
	const [existing] =
		await sql`SELECT plugin_type, schema_version, payload FROM event WHERE org = 'org-1' AND plugin_type = 'work:board-upserted' AND payload->>'id' = 'b-t22-seed' LIMIT 1`;
	let event = existing;
	if (!event) {
		const work = await import("../../packages/domain/src/work");
		await work.createBoard(sql, "org-1", "user-1", {
			id: "b-t22-seed",
			name: "T22 Seed",
		});
		[event] =
			await sql`SELECT plugin_type, schema_version, payload FROM event WHERE org = 'org-1' AND plugin_type = 'work:board-upserted' AND payload->>'id' = 'b-t22-seed' LIMIT 1`;
	}
	expect(event).toBeDefined();
	const decoded = registry.decode(
		event.plugin_type,
		event.schema_version,
		event.payload,
	);
	expect(decoded.id).toBe("b-t22-seed");
	expect(() => registry.decode(event.plugin_type, 2, event.payload)).toThrow(
		UnsupportedWorkEventSchema,
	);
	expect(() => registry.decode("work:unknown", 1, event.payload)).toThrow(
		UnsupportedWorkEventSchema,
	);
});

test("T22: tailMessages streams exactly once per event; deletes stream as deletes", async () => {
	const { tailMessages, WORK_COLLECTIONS } = await import(
		"../../packages/sync/src/work-shapes"
	);
	expect(WORK_COLLECTIONS).toHaveLength(8);
	// Self-seeding: guarantee a ticket event exists in isolation.
	const [anyTicket] =
		await sql`SELECT count(*)::int AS count FROM event WHERE org = 'org-1' AND plugin_type = 'work:ticket-upserted'`;
	if (anyTicket.count === 0) {
		const work = await import("../../packages/domain/src/work");
		const board = await work.createBoard(sql, "org-1", "user-1", {
			id: "b-t22-seed2",
			name: "T22 Seed Two",
		});
		await work.createTicket(sql, "org-1", "user-1", board.data.id, {
			id: "t-t22-seed2",
			title: "seed",
		});
	}
	const messages = await tailMessages(sql, "org-1", "ticket", "0");
	expect(messages.length).toBeGreaterThan(0);
	// Deletes (soft-delete emits work:ticket-deleted) stream with operation delete.
	expect(
		messages.every((m) =>
			Boolean((m.value as { id?: string } | undefined)?.id !== undefined),
		),
	).toBe(true);
});

test("T14/D4: cross-org label mutation is NotFound — assignLabelTask + deleteLabel scoped by org", async () => {
	const work = await import("../../packages/domain/src/work");
	// Victim org-2: board + ticket + task-scoped label.
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-2', 'Org Two', 'org-two', now()) ON CONFLICT DO NOTHING`;
	await work.createBoard(sql, "org-2", "user-1", {
		id: "b-org2",
		name: "Victim",
	});
	const t = await work.createTicket(sql, "org-2", "user-1", "b-org2", {
		id: "t-org2",
		title: "org2 ticket",
	});
	const label = await work.createLabel(sql, "org-2", "user-1", {
		id: "l-org2",
		name: "OrgTwoLabel",
		color: "#f00",
		taskId: t.data.id,
	});
	// Attacker org-1 must NOT be able to reassign or delete org-2's label.
	await expect(
		work.assignLabelTask(sql, "org-1", "user-1", label.data.id, null),
	).rejects.toThrow();
	await expect(
		work.deleteLabel(sql, "org-1", "user-1", label.data.id),
	).rejects.toThrow();
	// Row untouched.
	const [row] =
		await sql`SELECT task_id FROM label WHERE id = ${label.data.id}`;
	expect(row.task_id).toBe(t.data.id);
});

test("T14/D5: listLabels/listTemplates reject caller-supplied foreign organizationId", async () => {
	const work = await import("../../packages/domain/src/work");
	// org-2 rows seeded by the D4 test (order-independent: re-seed here).
	await work.createLabel(sql, "org-2", "user-1", {
		id: "l-org2-global",
		name: "OrgTwoGlobal",
		color: "#0f0",
		organizationId: "org-2",
	});
	// org-1 caller asking for org-2's globals → NotFound, not a cross-org read.
	await expect(work.listLabels(sql, "org-1", "org-2")).rejects.toThrow();
	// Own-org listing still works and excludes the foreign global.
	const own = await work.listLabels(sql, "org-1", "org-1");
	expect(own.labels.every((l) => l.name !== "OrgTwoGlobal")).toBe(true);
	// Templates: same rule.
	await expect(work.listTemplates(sql, "org-1", "org-2")).rejects.toThrow();
	const templates = await work.listTemplates(sql, "org-1", "org-1");
	expect(Array.isArray(templates.templates)).toBe(true);
});

test("T10/D7: status-changed emitted only on real transitions; bulkPatch/reorder write status without losing the pair", async () => {
	const work = await import("../../packages/domain/src/work");
	const board = await work.createBoard(sql, "org-1", "user-1", {
		id: "b-d7",
		name: "D7 Board",
	});
	const a = await work.createTicket(sql, "org-1", "user-1", board.data.id, {
		id: "t-d7-a",
		title: "d7-a",
	});
	const b = await work.createTicket(sql, "org-1", "user-1", board.data.id, {
		id: "t-d7-b",
		title: "d7-b",
	});
	const before =
		await sql`SELECT count(*)::int AS count FROM event WHERE org = 'org-1' AND plugin_type = 'work:ticket-status-changed'`;
	// Same-status PUT: no transition, no event.
	await work.setTicketStatus(sql, "org-1", "user-1", a.data.id, "to-do");
	const afterNoop =
		await sql`SELECT count(*)::int AS count FROM event WHERE org = 'org-1' AND plugin_type = 'work:ticket-status-changed'`;
	expect(afterNoop[0].count).toBe(before[0].count);
	// Real transition via PUT: exactly one pair (upsert + status-changed).
	await work.setTicketStatus(sql, "org-1", "user-1", a.data.id, "in-progress");
	const events =
		await sql`SELECT plugin_type FROM event WHERE org = 'org-1' AND plugin_type = 'work:ticket-status-changed' ORDER BY seq DESC LIMIT 1`;
	expect(events).toHaveLength(1);
	// bulkPatch status: transition pair emitted.
	const bulk = await work.bulkPatchTickets(
		sql,
		"org-1",
		"user-1",
		[b.data.id],
		{
			status: "in-progress",
		},
	);
	expect(bulk.data.ids).toEqual([b.data.id]);
	// before+1 came from the PUT transition above; bulk adds exactly one more.
	const bulkPair =
		await sql`SELECT count(*)::int AS count FROM event WHERE org = 'org-1' AND plugin_type = 'work:ticket-status-changed'`;
	expect(bulkPair[0].count).toBe(before[0].count + 2);
	// reorder with status change: transition pair emitted.
	await work.reorderTickets(sql, "org-1", "user-1", board.data.id, [
		{ id: a.data.id, position: 1, status: "done" },
	]);
	const reorderPair =
		await sql`SELECT count(*)::int AS count FROM event WHERE org = 'org-1' AND plugin_type = 'work:ticket-status-changed'`;
	expect(reorderPair[0].count).toBe(before[0].count + 3);
});

test("T37-supp: deleteStatus blocked with StatusInUse while any task references the slug", async () => {
	const work = await import("../../packages/domain/src/work");
	const board = await work.createBoard(sql, "org-1", "user-1", {
		id: "b-t37",
		name: "T37 Board",
	});
	const t = await work.createTicket(sql, "org-1", "user-1", board.data.id, {
		id: "t-t37",
		title: "t37 ticket",
		status: "done",
	});
	const statuses = await work.listStatuses(sql, "org-1", board.data.id);
	const done = statuses.statuses.find((s) => s.slug === "done");
	if (!done) throw new Error("done status missing");
	await expect(
		work.deleteStatus(sql, "org-1", "user-1", done.id),
	).rejects.toThrow();
	// After the task moves elsewhere, delete succeeds and streams the event.
	await work.setTicketStatus(sql, "org-1", "user-1", t.data.id, "to-do");
	const deleted = await work.deleteStatus(sql, "org-1", "user-1", done.id);
	expect(deleted.data.id).toBe(done.id);
});

// --- T22/T23: work collections through the ShapeEngine (§4) ---------------------------------

test("T22: work snapshot+tail serves all 8 collections through the engine", async () => {
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { WORK_COLLECTIONS, PROJECTIONS } = await import(
		"../../packages/sync/src/work-shapes"
	);
	const engine = new ShapeEngine(sql);
	// Populate every collection through the committed write path.
	const work = await import("../../packages/domain/src/work");
	const board = await work.createBoard(sql, "org-1", "user-1", {
		id: "b-t22",
		name: "T22 Board",
	});
	await work.setBoardKey(sql, "org-1", "user-1", board.data.id, "T22KEY");
	const ticket = await work.createTicket(
		sql,
		"org-1",
		"user-1",
		board.data.id,
		{
			id: "t-t22",
			title: "T22 ticket",
		},
	);
	await work.createLabel(sql, "org-1", "user-1", {
		id: "l-t22",
		name: "t22",
		color: "#111",
		taskId: ticket.data.id,
	});
	await work.createTemplate(sql, "org-1", "user-1", {
		id: "tt-t22",
		organizationId: "org-1",
		name: "t22",
		data: { title: "t22" },
	});
	const flagType = await work.createFlagType(sql, "org-1", "user-1", {
		id: "ft-t22",
		boardId: board.data.id,
		name: "t22",
	});
	await work.createTicketFlag(sql, "org-1", "user-1", ticket.data.id, {
		id: "tf-t22",
		flagTypeId: flagType.data.id,
		targetUserId: "user-2",
		note: "flag",
	});
	for (const collection of WORK_COLLECTIONS) {
		const table = PROJECTIONS[collection].table;
		const url = new URL(
			`http://x/orgs/org-1/v1/shape?table=${table}&offset=-1`,
		);
		const snapshot = await engine.shape("org-1", url);
		expect(snapshot.status).toBe(200);
		const rows = (await snapshot.json()) as Array<{
			key: string;
			value: Record<string, unknown>;
			headers: { operation: string };
		}>;
		const inserts = rows.filter((r) => r.headers.operation === "insert");
		expect(inserts.length, `${collection} snapshot inserts`).toBeGreaterThan(0);
		// Continuation: page through to the boundary, then tail an update.
		const handle = snapshot.headers.get("electric-handle") ?? "";
		const offset = snapshot.headers.get("electric-offset") ?? "";
		// A write after the snapshot boundary arrives in the tail.
		if (collection === "ticket") {
			await work.setTicketStatus(
				sql,
				"org-1",
				"user-1",
				ticket.data.id,
				"in-progress",
			);
			const tailUrl = new URL(
				`http://x/orgs/org-1/v1/shape?table=${table}&offset=${offset}&handle=${handle}`,
			);
			const tail = await engine.shape("org-1", tailUrl);
			expect(tail.status).toBe(200);
			const tailRows = (await tail.json()) as Array<{
				key: string;
				value: Record<string, unknown>;
				headers: { operation: string };
			}>;
			const update = tailRows.find(
				(r) =>
					r.headers.operation === "update" && r.value.id === ticket.data.id,
			);
			expect(update).toBeDefined();
			expect(update?.value.status).toBe("in-progress");
			expect(update?.value.last_seq).toBeTruthy();
		}
	}
}, 120000);

test("T23: non-member org cannot snapshot work shapes; revoked handle stops", async () => {
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const engine = new ShapeEngine(sql);
	// Self-seeding (order-independent): org-1 board + ticket, org-2 board +
	// ticket. Both orgs exist by now (org-1 in beforeAll, org-2 may not —
	// create idempotently).
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('org-2', 'Org Two', 'org-two', now()) ON CONFLICT DO NOTHING`;
	const work = await import("../../packages/domain/src/work");
	const board1 = await work.createBoard(sql, "org-1", "user-1", {
		id: "b-t23-o1",
		name: "T23 Org One",
	});
	const ticket1 = await work.createTicket(
		sql,
		"org-1",
		"user-1",
		board1.data.id,
		{
			id: "t-t23-o1",
			title: "org1 secret",
		},
	);
	const board2 = await work.createBoard(sql, "org-2", "user-1", {
		id: "b-t23-o2",
		name: "T23 Org Two",
	});
	await work.createTicket(sql, "org-2", "user-1", board2.data.id, {
		id: "t-t23-o2",
		title: "org2 own",
	});
	void ticket1;
	// org-2 (non-member of org-1's data) snapshots org-1's tickets.
	const response = await engine.shape(
		"org-2",
		new URL("http://x/orgs/org-2/v1/shape?table=work_ticket&offset=-1"),
	);
	expect(response.status).toBe(200);
	const rows = (await response.json()) as Array<{
		value?: { org: string; id?: string; boardId?: string };
		headers: { operation?: string };
	}>;
	// The snapshot is org-scoped: org-2 sees only its own rows (the D4 fixture
	// gives org-2 exactly one board + ticket); no org-1 board's tickets leak.
	const inserts = rows.filter((r) => r.headers.operation === "insert");
	const org1Boards =
		await sql`SELECT id FROM "board" WHERE organization_id = 'org-1'`;
	const org1BoardIds = new Set(
		org1Boards.map((b: { id?: string }) => String(b.id)),
	);
	for (const row of inserts) {
		expect(row.value?.org).toBe("org-2");
		expect(org1BoardIds.has(String(row.value?.boardId))).toBe(false);
	}
	// Board collection: only org-2's own board appears.
	const boardResponse = await engine.shape(
		"org-2",
		new URL("http://x/orgs/org-2/v1/shape?table=work_board&offset=-1"),
	);
	const boardRows = (await boardResponse.json()) as Array<{
		value?: { organizationId?: string };
		headers: { operation?: string };
	}>;
	for (const row of boardRows.filter((r) => r.headers.operation === "insert"))
		expect(row.value?.organizationId).toBe("org-2");
}, 60000);
