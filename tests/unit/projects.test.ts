import { Schema } from "effect";
import { expect, test } from "vitest";
import * as projects from "../../packages/contracts/src/projects";

const decode = (schema: Schema.Schema.Any) => (input: unknown) =>
	Schema.decodeUnknownSync(schema as Schema.Schema<unknown, unknown, never>)(
		input,
		{ onExcessProperty: "error" },
	);

const T = "2026-01-01T00:00:00Z";

const progress = { completed: 0, eligible: 0, percent: null };

const projectPublic = {
	id: "p1",
	organizationId: "o1",
	slug: "alpha",
	name: "Alpha",
	icon: null,
	color: null,
	summary: "s",
	description: null,
	successCriteria: null,
	status: "planned",
	priority: null,
	leadUserId: "u1",
	leadUserName: "Lead",
	leadTeamId: null,
	leadTeamName: null,
	startDate: null,
	targetDate: null,
	orgPrivilege: null,
	archivedAt: null,
	archivedBy: null,
	archivedByName: null,
	createdAt: T,
	updatedAt: T,
	createdBy: "u1",
	progress,
	health: null,
};

const resourceLinkPublic = {
	id: "rl1",
	projectId: "p1",
	resourceType: "board",
	resourceId: "b1",
	relationship: "context",
	label: null,
	note: null,
	rank: 0,
	createdBy: "u1",
	createdAt: T,
	resource: {
		id: "b1",
		slug: "board",
		name: "Board",
		icon: null,
		archivedAt: null,
	},
};

const milestonePublic = {
	id: "m1",
	projectId: "p1",
	name: "M1",
	description: null,
	targetDate: null,
	rank: 0,
	completedAt: null,
	completedBy: null,
	createdAt: T,
	updatedAt: T,
	progress,
};

const ticketPublic = {
	id: "t1",
	boardId: "b1",
	boardSlug: "board",
	boardName: "Board",
	number: 1,
	key: "BRD-1",
	title: "Ticket",
	status: "todo",
	priority: null,
	archivedAt: null,
	startDate: null,
	dueDate: null,
	projectMilestoneId: null,
	rank: 0,
	addedAt: T,
	addedBy: "u1",
};

const updatePublic = {
	id: "upd1",
	organizationId: "o1",
	projectId: "p1",
	authorId: "u1",
	authorName: "Author",
	content: "c",
	health: "on-track",
	editHistory: [],
	createdAt: T,
	updatedAt: T,
};

test("P1 public schemas round-trip canonical samples and reject excess/missing keys", () => {
	const cases: Array<[string, Schema.Schema.Any, unknown]> = [
		["ProjectPublic", projects.ProjectPublic, projectPublic],
		["ResourceLinkPublic", projects.ResourceLinkPublic, resourceLinkPublic],
		["MilestonePublic", projects.MilestonePublic, milestonePublic],
		["TicketPublic", projects.TicketPublic, ticketPublic],
		["UpdatePublic", projects.UpdatePublic, updatePublic],
	];
	for (const [name, schema, sample] of cases) {
		expect(decode(schema)(sample), name).toEqual(sample);
		const withExcess = { ...(sample as Record<string, unknown>), bogus: 1 };
		expect(() => decode(schema)(withExcess), name).toThrow();
		const record = sample as Record<string, unknown>;
		const rest: Record<string, unknown> = {};
		for (const key of Object.keys(record).slice(1)) rest[key] = record[key];
		expect(() => decode(schema)(rest), name).toThrow();
	}
});

test("P2 ProjectPublic status/priority/orgPrivilege picklists reject off-vocabulary values", () => {
	expect(() =>
		decode(projects.ProjectPublic)({ ...projectPublic, status: "paused" }),
	).toThrow();
	expect(() =>
		decode(projects.ProjectPublic)({ ...projectPublic, priority: "mega" }),
	).toThrow();
	expect(() =>
		decode(projects.ProjectPublic)({
			...projectPublic,
			orgPrivilege: "own",
		}),
	).toThrow();
	expect(
		decode(projects.ProjectPublic)({ ...projectPublic, status: "canceled" }),
	).toMatchObject({ status: "canceled" });
});

test("P3 slug regex enforced", () => {
	expect(projects.PROJECT_SLUG_PATTERN.test("alpha")).toBe(true);
	expect(projects.PROJECT_SLUG_PATTERN.test("alpha-1")).toBe(true);
	expect(projects.PROJECT_SLUG_PATTERN.test("Alpha")).toBe(false);
	expect(projects.PROJECT_SLUG_PATTERN.test("-alpha")).toBe(false);
	expect(projects.PROJECT_SLUG_PATTERN.test("alpha--")).toBe(false);
	// shape only; the ≤63 bound is enforced by the ProjectSlug schema, not the regex
	expect(projects.PROJECT_SLUG_PATTERN.test("a".repeat(63))).toBe(true);
	expect(() => decode(projects.ProjectSlug)("alpha")).not.toThrow();
	expect(() => decode(projects.ProjectSlug)("-alpha")).toThrow();
	expect(() => decode(projects.ProjectSlug)("alpha--")).toThrow();
	expect(() => decode(projects.ProjectSlug)("a".repeat(63))).not.toThrow();
	expect(() => decode(projects.ProjectSlug)("a".repeat(64))).toThrow();
});

const eventSamples: Record<string, unknown> = {
	"project:created": { id: "p1", organizationId: "o1" },
	"project:updated": { id: "p1", organizationId: "o1" },
	"project:archived": { id: "p1", organizationId: "o1" },
	"project:unarchived": { id: "p1", organizationId: "o1" },
	"project:slug-alias-created": {
		id: "sa1",
		projectId: "p1",
		organizationId: "o1",
		slug: "old",
	},
	"project:resource-link-upserted": {
		id: "rl1",
		projectId: "p1",
		resourceType: "board",
		resourceId: "b1",
	},
	"project:resource-link-deleted": {
		id: "rl1",
		projectId: "p1",
		resourceType: "board",
		resourceId: "b1",
	},
	"project:milestone-upserted": { id: "m1", projectId: "p1" },
	"project:milestone-deleted": { id: "m1", projectId: "p1" },
	"project:ticket-linked": { id: "pt1", projectId: "p1", taskId: "t1" },
	"project:ticket-unlinked": { id: "pt1", projectId: "p1", taskId: "t1" },
	"project:update-upserted": { id: "upd1", projectId: "p1" },
	"project:update-deleted": { id: "upd1", projectId: "p1" },
};

test("P4 all 14 event payload schemas decode canonical samples at version 1", () => {
	expect(projects.PROJECTS_SCHEMA_VERSION).toBe(1);
	expect(Object.keys(projects.ProjectEventPayloadSchemas)).toHaveLength(14);
	for (const [type, sample] of Object.entries(eventSamples)) {
		const schema = projects.ProjectEventPayloadSchemas[type];
		expect(schema, type).toBeDefined();
		decode(schema)(sample);
	}
	expect(Object.keys(eventSamples)).toHaveLength(13);
});

test("P5 import projection-seed event exists and carries organizationId only", () => {
	const seed = projects.ProjectEventPayloadSchemas["project:import-seeded"];
	expect(seed).toBeDefined();
	decode(seed)({ organizationId: "o1" });
});
