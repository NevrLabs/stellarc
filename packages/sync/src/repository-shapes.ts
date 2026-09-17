import { RepositoryUpcasterRegistry } from "../../domain/src/repository-events";
import type { ShapeEngine, ShapeTableSpec } from "./index";

// STL-18 §4: authorized org collections for the repository resource.
// Repository lists are org-scoped; issue/PR shapes require repo scope and
// filter by repo_id. No raw grant/token collection is exposed; the
// integration shape carries safe metadata only (no config envelope).

const repositoryUpcasters = new RepositoryUpcasterRegistry();

type EventLike = {
	seq: string;
	txid: string;
	plugin_type: string;
	payload: unknown;
	schema_version: number;
};

/** Decode a repository event payload or throw (unsupported schema → 503). */
function decodeRepository(pluginType: string, event: EventLike) {
	return repositoryUpcasters.decode(
		pluginType,
		event.schema_version,
		event.payload,
	) as { id: string; row?: Record<string, unknown>; repoId?: string };
}

function tableMessage(
	event: EventLike,
	upsertType: string,
	deleteType: string,
	rowKey?: string,
): { id: string; value: Record<string, unknown>; deleted: boolean } | null {
	if (event.plugin_type === upsertType) {
		const payload = decodeRepository(upsertType, event);
		if (!payload.row) throw new Error("Unsupported event schema");
		return {
			id: payload.id,
			value: { ...payload.row, last_seq: event.seq },
			deleted: false,
		};
	}
	if (event.plugin_type === deleteType) {
		const payload = decodeRepository(deleteType, event);
		const id = rowKey
			? `${payload.repoId ?? payload.row?.repo_id}:${payload.id}`
			: payload.id;
		return { id, value: { id: payload.id }, deleted: true };
	}
	return null;
}

const ID = { type: "text", not_null: true, pk_index: 0 } as const;

const repoSpec: ShapeTableSpec = {
	schema: {
		id: ID,
		organization_id: { type: "text", not_null: true },
		provider: { type: "text", not_null: true },
		owner: { type: "text", not_null: true },
		name: { type: "text", not_null: true },
		external_id: { type: "text" },
		url: { type: "text", not_null: true },
		description: { type: "text" },
		default_branch: { type: "text" },
		is_private: { type: "bool", not_null: true },
		config: { type: "json" },
		is_active: { type: "bool", not_null: true },
		org_privilege: { type: "text" },
		last_synced_at: { type: "timestamp" },
		created_at: { type: "timestamp", not_null: true },
		updated_at: { type: "timestamp", not_null: true },
	},
	snapshot: async (tx, org) =>
		(await tx`SELECT * FROM repo WHERE organization_id=${org} ORDER BY id`) as Array<
			Record<string, unknown>
		>,
	eventMessage: (event) =>
		tableMessage(event, "repository:repo-upserted", "repository:repo-deleted"),
};

const issueSpec: ShapeTableSpec = {
	requireParams: ["repo"],
	extraParams: new Set(["repo"]),
	schema: {
		id: ID,
		repo_id: { type: "text", not_null: true },
		number: { type: "int4", not_null: true },
		external_id: { type: "text" },
		title: { type: "text", not_null: true },
		body: { type: "text" },
		state: { type: "text", not_null: true },
		author_login: { type: "text" },
		author_avatar_url: { type: "text" },
		assignee_logins: { type: "json" },
		labels: { type: "json" },
		comment_count: { type: "int4", not_null: true },
		url: { type: "text", not_null: true },
		external_created_at: { type: "timestamp" },
		external_updated_at: { type: "timestamp" },
		closed_at: { type: "timestamp" },
		created_at: { type: "timestamp", not_null: true },
		updated_at: { type: "timestamp", not_null: true },
	},
	snapshot: async (tx, org, params) => {
		const repoId = params.get("repo") ?? "";
		// Org predicate joins the repo scope: a valid repo id from another org
		// yields an empty snapshot, never another org's rows (T13).
		return (await tx`SELECT i.* FROM repo_issue i
      JOIN repo r ON r.id=i.repo_id
      WHERE i.repo_id=${repoId} AND r.organization_id=${org} ORDER BY i.id`) as Array<
			Record<string, unknown>
		>;
	},
	eventMessage: (event) =>
		tableMessage(
			event,
			"repository:issue-upserted",
			"repository:issue-deleted",
			"repo",
		),
};

const pullRequestSpec: ShapeTableSpec = {
	requireParams: ["repo"],
	extraParams: new Set(["repo"]),
	schema: {
		id: ID,
		repo_id: { type: "text", not_null: true },
		number: { type: "int4", not_null: true },
		external_id: { type: "text" },
		title: { type: "text", not_null: true },
		body: { type: "text" },
		state: { type: "text", not_null: true },
		is_draft: { type: "bool", not_null: true },
		author_login: { type: "text" },
		author_avatar_url: { type: "text" },
		head_branch: { type: "text" },
		base_branch: { type: "text" },
		labels: { type: "json" },
		comment_count: { type: "int4", not_null: true },
		additions: { type: "int4" },
		deletions: { type: "int4" },
		changed_files: { type: "int4" },
		url: { type: "text", not_null: true },
		external_created_at: { type: "timestamp" },
		external_updated_at: { type: "timestamp" },
		merged_at: { type: "timestamp" },
		closed_at: { type: "timestamp" },
		created_at: { type: "timestamp", not_null: true },
		updated_at: { type: "timestamp", not_null: true },
	},
	snapshot: async (tx, org, params) => {
		const repoId = params.get("repo") ?? "";
		return (await tx`SELECT p.* FROM repo_pull_request p
      JOIN repo r ON r.id=p.repo_id
      WHERE p.repo_id=${repoId} AND r.organization_id=${org} ORDER BY p.id`) as Array<
			Record<string, unknown>
		>;
	},
	eventMessage: (event) =>
		tableMessage(
			event,
			"repository:pull-request-upserted",
			"repository:pull-request-deleted",
			"repo",
		),
};

const installationSpec: ShapeTableSpec = {
	schema: {
		id: ID,
		organization_id: { type: "text", not_null: true },
		installation_id: { type: "int4", not_null: true },
		account_id: { type: "int4", not_null: true },
		account_login: { type: "text", not_null: true },
		account_type: { type: "text", not_null: true },
		account_avatar_url: { type: "text" },
		repository_selection: { type: "text" },
		permissions: { type: "json" },
		created_at: { type: "timestamp", not_null: true },
		updated_at: { type: "timestamp", not_null: true },
	},
	snapshot: async (tx, org) =>
		(await tx`SELECT * FROM organization_github_installation WHERE organization_id=${org} ORDER BY id`) as Array<
			Record<string, unknown>
		>,
	eventMessage: (event) =>
		tableMessage(
			event,
			"repository:installation-upserted",
			"repository:installation-deleted",
		),
};

/**
 * Safe integration collection: board-owned connection metadata without the
 * config envelope (§4 "safe `integration`"; no raw grant/token/config-secret
 * collection). Snapshot projects the safe columns; upsert events carry the
 * same safe metadata the domain service emitted.
 */
const integrationSpec: ShapeTableSpec = {
	schema: {
		id: ID,
		board_id: { type: "text", not_null: true },
		type: { type: "text", not_null: true },
		is_active: { type: "bool" },
		created_at: { type: "timestamp", not_null: true },
		updated_at: { type: "timestamp", not_null: true },
	},
	snapshot: async (tx, _org) => {
		// The board table belongs to STL-16; until it exists, org scoping for
		// integrations is enforced through the event payload's safe metadata.
		return (await tx`SELECT id, board_id, type, is_active, created_at, updated_at
      FROM integration ORDER BY id`) as Array<Record<string, unknown>>;
	},
	eventMessage: (event) =>
		tableMessage(
			event,
			"repository:integration-upserted",
			"repository:integration-deleted",
		),
};

/** Register every §4 repository collection on the engine. */
export function registerRepositoryShapes(engine: ShapeEngine) {
	engine.registerTable("repo", repoSpec);
	engine.registerTable("repo_issue", issueSpec);
	engine.registerTable("repo_pull_request", pullRequestSpec);
	engine.registerTable("organization_github_installation", installationSpec);
	engine.registerTable("integration", integrationSpec);
}
export const REPOSITORY_SHAPE_TABLES = [
	"repo",
	"repo_issue",
	"repo_pull_request",
	"organization_github_installation",
	"integration",
] as const;
