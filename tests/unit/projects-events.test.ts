import { expect, test } from "vitest";
import { registerProjectsUpcasters } from "../../packages/domain/src/projects-events";
import { UpcasterRegistry } from "../../packages/sync/src/upcasters";

const PROJECT_TYPES = [
	"project:created",
	"project:updated",
	"project:archived",
	"project:unarchived",
	"project:slug-alias-created",
	"project:resource-link-upserted",
	"project:resource-link-deleted",
	"project:milestone-upserted",
	"project:milestone-deleted",
	"project:ticket-linked",
	"project:ticket-unlinked",
	"project:update-upserted",
	"project:update-deleted",
	"project:import-seeded",
];

test("E1 registry rejects project event types before registration and decodes all 14 after", () => {
	const before = new UpcasterRegistry();
	expect(before.supports("project:created")).toBe(false);
	const registry = new UpcasterRegistry();
	registerProjectsUpcasters(registry);
	for (const type of PROJECT_TYPES) {
		expect(registry.supports(type), type).toBe(true);
	}
	expect(PROJECT_TYPES).toHaveLength(14);
});

test("E2 import-seeded decodes; unknown version fails closed", () => {
	const registry = new UpcasterRegistry();
	registerProjectsUpcasters(registry);
	expect(
		registry.decode("project:import-seeded", 1, { organizationId: "o1" }),
	).toEqual({ organizationId: "o1" });
	expect(() =>
		registry.decode("project:created", 2, { id: "p1", organizationId: "o1" }),
	).toThrow();
});

test("E3 live event decode passes payload through contract schemas", () => {
	const registry = new UpcasterRegistry();
	registerProjectsUpcasters(registry);
	expect(
		registry.decode("project:ticket-linked", 1, {
			id: "pt1",
			projectId: "p1",
			taskId: "t1",
		}),
	).toEqual({ id: "pt1", projectId: "p1", taskId: "t1" });
});
