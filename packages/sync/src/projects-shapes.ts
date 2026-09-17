import type { Sql } from "postgres";
import { registerProjectsUpcasters } from "../../domain/src/projects-events";
import type { ShapeEngine, ShapeTableSpec } from "./index";
import { UpcasterRegistry } from "./upcasters";

// STL-21 §4: org-scoped project collections for the sync engine. The four
// dependency-free tables ship now. Event payloads are id-only public
// projections (§2), so upsert messages hydrate the committed row through the
// same org predicate as the snapshot. The satellite link tables
// (project_board/project_repo/project_table_link/project_ticket) are
// wave-2-gated on STL-16/18 FK targets: their keys stay unregistered and the
// engine answers 404 rather than silently resolving another table's spec.
// Caller-privilege predicates (resolved project privilege, revocation drops
// cached rows) land with the STL-20 chokepoint this slice extends.

/** Shared v1 upcaster registry for the 14 project event types. */
export const projectUpcasters = new UpcasterRegistry();
registerProjectsUpcasters(projectUpcasters);

type EventLike = {
	seq: string;
	txid: string;
	plugin_type: string;
	payload: unknown;
	schema_version: number;
};

function decodeProject(pluginType: string, event: EventLike) {
	return projectUpcasters.decode(
		pluginType,
		event.schema_version,
		event.payload,
	) as Record<string, string>;
}

type Row = Record<string, unknown>;
type Mapped = { id: string; value: Row; deleted: boolean } | null;

/** Upsert → hydrated committed row (org predicate); delete → id-only value;
 * other tables' events → null (the offset still advances). */
function hydratingSpec(config: {
	upsertTypes: readonly string[];
	deleteTypes?: readonly string[];
	hydrate: (sql: Sql, id: string, org: string) => Promise<Row | null>;
}): (event: EventLike, org: string, sql: Sql) => Promise<Mapped> {
	const { upsertTypes, deleteTypes = [], hydrate } = config;
	return async (event, org, sql) => {
		if (upsertTypes.includes(event.plugin_type)) {
			const payload = decodeProject(event.plugin_type, event);
			const row = await hydrate(sql, payload.id, org);
			if (!row) return null; // cross-org or deleted since commit
			return {
				id: payload.id,
				value: { ...row, last_seq: event.seq },
				deleted: false,
			};
		}
		if (deleteTypes.includes(event.plugin_type)) {
			const payload = decodeProject(event.plugin_type, event);
			return { id: payload.id, value: { id: payload.id }, deleted: true };
		}
		return null;
	};
}

const ID = { type: "text", not_null: true, pk_index: 0 } as const;

// --- project -------------------------------------------------------------------
const projectEvents = hydratingSpec({
	upsertTypes: [
		"project:created",
		"project:updated",
		"project:archived",
		"project:unarchived",
	],
	hydrate: async (sql, id, org) => {
		const rows = await sql`SELECT * FROM project
			WHERE id = ${id} AND organization_id = ${org}`;
		return (rows[0] as Row) ?? null;
	},
});

const projectSpec: ShapeTableSpec = {
	schema: {
		id: ID,
		organization_id: { type: "text", not_null: true },
		slug: { type: "text", not_null: true },
		name: { type: "text", not_null: true },
		icon: { type: "text" },
		color: { type: "text" },
		summary: { type: "text", not_null: true },
		description: { type: "text" },
		success_criteria: { type: "text" },
		status: { type: "text", not_null: true },
		priority: { type: "text" },
		lead_user_id: { type: "text", not_null: true },
		lead_team_id: { type: "text" },
		start_date: { type: "text" },
		target_date: { type: "text" },
		org_privilege: { type: "text" },
		archived_at: { type: "timestamp" },
		archived_by: { type: "text" },
		created_at: { type: "timestamp", not_null: true },
		updated_at: { type: "timestamp", not_null: true },
		created_by: { type: "text", not_null: true },
	},
	snapshot: async (tx, org) =>
		(await tx`SELECT * FROM project WHERE organization_id=${org} ORDER BY id`) as Row[],
	eventMessage: (event, org, _params, sql) => projectEvents(event, org, sql),
};

// --- project_slug_alias ----------------------------------------------------------
const aliasSpec: ShapeTableSpec = {
	schema: {
		id: ID,
		organization_id: { type: "text", not_null: true },
		project_id: { type: "text", not_null: true },
		slug: { type: "text", not_null: true },
		created_at: { type: "timestamp", not_null: true },
	},
	snapshot: async (tx, org) =>
		(await tx`SELECT * FROM project_slug_alias WHERE organization_id=${org} ORDER BY id`) as Row[],
	eventMessage: async (event, org, _params, sql) => {
		if (event.plugin_type !== "project:slug-alias-created") return null;
		const payload = decodeProject(event.plugin_type, event);
		const rows = await sql`SELECT * FROM project_slug_alias
			WHERE id = ${payload.id} AND organization_id = ${org}`;
		const row = (rows[0] as Row) ?? null;
		if (!row) return null;
		return {
			id: payload.id,
			value: { ...row, last_seq: event.seq },
			deleted: false,
		};
	},
};

// --- project_milestone -----------------------------------------------------------
const milestoneEvents = hydratingSpec({
	upsertTypes: ["project:milestone-upserted"],
	deleteTypes: ["project:milestone-deleted"],
	hydrate: async (sql, id, org) => {
		const rows = await sql`SELECT m.* FROM project_milestone m
			JOIN project p ON p.id = m.project_id
			WHERE m.id = ${id} AND p.organization_id = ${org}`;
		return (rows[0] as Row) ?? null;
	},
});

const milestoneSpec: ShapeTableSpec = {
	schema: {
		id: ID,
		project_id: { type: "text", not_null: true },
		name: { type: "text", not_null: true },
		description: { type: "text" },
		target_date: { type: "text" },
		rank: { type: "int4", not_null: true },
		completed_at: { type: "timestamp" },
		completed_by: { type: "text" },
		created_at: { type: "timestamp", not_null: true },
		updated_at: { type: "timestamp", not_null: true },
	},
	snapshot: async (tx, org) =>
		(await tx`SELECT m.* FROM project_milestone m
			JOIN project p ON p.id = m.project_id
			WHERE p.organization_id=${org} ORDER BY m.id`) as Row[],
	eventMessage: (event, org, _params, sql) => milestoneEvents(event, org, sql),
};

// --- project_update --------------------------------------------------------------
const updateEvents = hydratingSpec({
	upsertTypes: ["project:update-upserted"],
	deleteTypes: ["project:update-deleted"],
	hydrate: async (sql, id, org) => {
		const rows = await sql`SELECT u.* FROM project_update u
			JOIN project p ON p.id = u.project_id
			WHERE u.id = ${id} AND p.organization_id = ${org}`;
		return (rows[0] as Row) ?? null;
	},
});

const updateSpec: ShapeTableSpec = {
	schema: {
		id: ID,
		organization_id: { type: "text", not_null: true },
		project_id: { type: "text", not_null: true },
		author_id: { type: "text", not_null: true },
		content: { type: "text", not_null: true },
		health: { type: "text", not_null: true },
		edit_history: { type: "json", not_null: true },
		created_at: { type: "timestamp", not_null: true },
		updated_at: { type: "timestamp", not_null: true },
	},
	snapshot: async (tx, org) =>
		(await tx`SELECT u.* FROM project_update u
			JOIN project p ON p.id = u.project_id
			WHERE p.organization_id=${org} ORDER BY u.id`) as Row[],
	eventMessage: (event, org, _params, sql) => updateEvents(event, org, sql),
};

/** Register the four dependency-free project collections on an engine. */
export function registerProjectCollections(engine: ShapeEngine): void {
	engine.registerTable("project", projectSpec);
	engine.registerTable("project_slug_alias", aliasSpec);
	engine.registerTable("project_milestone", milestoneSpec);
	engine.registerTable("project_update", updateSpec);
}
