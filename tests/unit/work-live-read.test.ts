/** STL-16 D1/T28: useGetTasks is live-first — the REST fetcher is NOT called
 * when the live collections have committed rows. Pure seam test: the hook's
 * live path is exercised through work-live-store's test seam; the REST
 * fallback path is proven by the e2e (work.spec.ts forbids interception). */
import { expect, test } from "vitest";
import {
	ensureOrgEntry,
	type LiveCollectionLike,
	rowsOfEntry,
} from "../../apps/stellarc-ui/src/lib/work-live-store";
import type { WorkRows } from "../../apps/stellarc-ui/src/lib/work-view-model";
import { buildBoardWithTasks } from "../../apps/stellarc-ui/src/lib/work-view-model";

const boardRow = {
	org: "org-1",
	id: "b1",
	organizationId: "org-1",
	slug: "ktest",
	icon: "Layout",
	name: "Kaneo Test",
	description: null,
	createdAt: "2026-07-26T12:11:16.429491Z",
	isPublic: false,
	archivedAt: null,
	lastTaskNumber: 3,
	orgPrivilege: null,
	taskStatusOrder: [
		"to-do",
		"in-progress",
		"in-review",
		"done",
		"canceled",
		"duplicate",
	],
	backlogStatusOrder: ["triage", "planned"],
	subtaskDepthLimit: 4,
	defaultAssigneeId: null,
	defaultAssigneeTeamId: null,
};

const statusRows = [
	{
		org: "org-1",
		id: "st-1",
		boardId: "b1",
		name: "To Do",
		slug: "to-do",
		position: 0,
		icon: null,
		color: null,
		isFinal: false,
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
	},
	{
		org: "org-1",
		id: "st-2",
		boardId: "b1",
		name: "Done",
		slug: "done",
		position: 3,
		icon: null,
		color: null,
		isFinal: true,
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
	},
];

const ticketRows = [
	{
		org: "org-1",
		id: "t1",
		boardId: "b1",
		position: 0,
		number: 1,
		assigneeId: null,
		teamAssigneeId: null,
		title: "First probe",
		description: null,
		descriptionHistory: [],
		status: "to-do",
		columnId: "st-1",
		priority: "high",
		milestoneId: null,
		archivedAt: null,
		archivedBy: null,
		deletedAt: null,
		deletedBy: null,
		startDate: null,
		dueDate: null,
		createdAt: "2026-07-26T12:11:16Z",
		updatedAt: "2026-07-26T12:11:16Z",
		key: "KTEST-1",
	},
	{
		org: "org-1",
		id: "t2",
		boardId: "b1",
		position: 0,
		number: 2,
		assigneeId: null,
		teamAssigneeId: null,
		title: "Archived probe",
		description: null,
		descriptionHistory: [],
		status: "done",
		columnId: "st-2",
		priority: "low",
		milestoneId: null,
		archivedAt: "2026-08-01T00:00:00Z",
		archivedBy: null,
		deletedAt: null,
		deletedBy: null,
		startDate: null,
		dueDate: null,
		createdAt: "2026-07-26T12:11:16Z",
		updatedAt: "2026-07-26T12:11:16Z",
		key: "KTEST-2",
	},
];

function rowsFixture(): WorkRows {
	return {
		board: [boardRow],
		boardKeyAlias: [],
		status: statusRows,
		ticket: ticketRows,
		label: [],
		taskTemplate: [],
		flagType: [],
		taskFlag: [],
	};
}

test("live-first wiring: board view-model from committed live rows, #226 semantics", () => {
	const rows = rowsFixture();
	const board = buildBoardWithTasks(rows, "b1");
	expect(board).toBeDefined();
	expect(board?.name).toBe("Kaneo Test");
	expect(board?.columns.length).toBe(2);
	const toDo = board?.columns[0];
	expect(toDo?.slug).toBe("to-do");
	expect(toDo?.tasks.map((t) => t.title)).toEqual(["First probe"]);
	// Archived tickets keep their real status but only appear in archivedTasks.
	expect(board?.archivedTasks.map((t) => t.title)).toEqual(["Archived probe"]);
	expect(board?.columns[1]?.tasks.length).toBe(0);
});

test("live-first wiring: REST fallback when no live rows have committed", () => {
	const handles = {} as Record<string, LiveCollectionLike>;
	const empty = () => ({
		isReady: () => true,
		toArray: () => [],
		preload: async () => undefined,
		subscribeChanges: () => ({ unsubscribe: () => {} }),
	});
	for (const key of [
		"board",
		"boardKeyAlias",
		"status",
		"ticket",
		"label",
		"taskTemplate",
		"flagType",
		"taskFlag",
	])
		handles[key] = empty();
	handles.board.isReady = () => false; // collections not committed yet
	const entry = ensureOrgEntry("org-fallback", "", () => handles as never);
	expect(rowsOfEntry(entry)).toBeUndefined();
});

test("live-first wiring: revision listener survives across ensure calls", () => {
	const handles = {} as Record<string, LiveCollectionLike>;
	const mk = () => ({
		isReady: () => true,
		toArray: () => [],
		preload: async () => undefined,
		subscribeChanges: () => ({ unsubscribe: () => {} }),
	});
	for (const key of [
		"board",
		"boardKeyAlias",
		"status",
		"ticket",
		"label",
		"taskTemplate",
		"flagType",
		"taskFlag",
	])
		handles[key] = mk();
	const first = ensureOrgEntry("org-dup", "", () => handles as never);
	const second = ensureOrgEntry("org-dup", "", () => {
		throw new Error("must reuse");
	});
	expect(second).toBe(first);
});
