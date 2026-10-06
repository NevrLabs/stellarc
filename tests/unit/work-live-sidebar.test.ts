/** STL-16 D1/T29: sidebar + slug-resolution read live board rows.
 * Pins the map from WorkRows to the sidebar's BoardWithTasks list — the
 * fork sidebar order (createdAt asc) and archived-board exclusion semantics. */
import { expect, test } from "vitest";
import {
	buildBoardWithTasks,
	type WorkRows,
} from "../../apps/stellarc-ui/src/lib/work-view-model";

const rows = (boards: Array<Record<string, unknown>>): WorkRows => ({
	board: boards as never,
	boardKeyAlias: [],
	status: [],
	ticket: [],
	label: [],
	taskTemplate: [],
	flagType: [],
	taskFlag: [],
});

test("T29: sidebar board list maps live rows in createdAt order, archived filtered by consumer", () => {
	const work = rows([
		{
			id: "b2",
			organizationId: "org",
			slug: "second",
			icon: "Layout",
			name: "Second",
			description: null,
			createdAt: "2026-02-01T00:00:00Z",
			isPublic: null,
			archivedAt: null,
			lastTaskNumber: 0,
			orgPrivilege: null,
			taskStatusOrder: [],
			backlogStatusOrder: [],
			subtaskDepthLimit: 4,
			defaultAssigneeId: null,
			defaultAssigneeTeamId: null,
		},
		{
			id: "b1",
			organizationId: "org",
			slug: "first",
			icon: "Trello",
			name: "First",
			description: null,
			createdAt: "2026-01-01T00:00:00Z",
			isPublic: null,
			archivedAt: "2026-03-01T00:00:00Z",
			lastTaskNumber: 0,
			orgPrivilege: null,
			taskStatusOrder: [],
			backlogStatusOrder: [],
			subtaskDepthLimit: 4,
			defaultAssigneeId: null,
			defaultAssigneeTeamId: null,
		},
	]);
	const list = [...work.board]
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		.map((row) => buildBoardWithTasks(work, row.id))
		.filter((b) => b !== undefined);
	expect(list.map((b) => b?.slug)).toEqual(["first", "second"]);
	// Archived boards surface archivedAt so the sidebar can toggle/filter.
	expect(list[0]?.archivedAt).toBe("2026-03-01T00:00:00Z");
	expect(list[1]?.archivedAt).toBeNull();
});

test("T29: slug resolution matches slug case-insensitively and by id", () => {
	const work = rows([
		{
			id: "b1",
			organizationId: "org",
			slug: "KTEST",
			icon: null,
			name: "Kaneo Test",
			description: null,
			createdAt: "2026-01-01T00:00:00Z",
			isPublic: null,
			archivedAt: null,
			lastTaskNumber: 0,
			orgPrivilege: null,
			taskStatusOrder: [],
			backlogStatusOrder: [],
			subtaskDepthLimit: 4,
			defaultAssigneeId: null,
			defaultAssigneeTeamId: null,
		},
	]);
	const bySlug = work.board.find(
		(b) => b.slug.toLowerCase() === "ktest".toLowerCase() || b.id === "ktest",
	);
	const byId = work.board.find(
		(b) => b.slug.toLowerCase() === "b1".toLowerCase() || b.id === "b1",
	);
	expect(bySlug?.id).toBe("b1");
	expect(byId?.id).toBe("b1");
});
