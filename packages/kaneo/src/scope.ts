/**
 * NEVR-603 — scope roots for the Kaneo-compatible native surface (20
 * endpoints) and the MCP tool registry. Same law as
 * packages/contracts/src/scope.ts (taxonomy, parent provenance, credential
 * and secret flags); kept beside the groups it pins so the strangler
 * migration — a legacy route going native — is a move into THIS table.
 *
 * Kaneo wire compatibility means some parents arrive from `query` or
 * `payload` (board list/create, label create) instead of the path; they are
 * recorded as such so the audit keeps that set from growing, and the
 * handlers still gate them through Access membership checks (proven by the
 * cross-scope denial tests in tests/bun/scope-denial.test.ts).
 */

import type { RouteScope } from "../../contracts/src/scope";
import type { KaneoApi } from "./api";

type KaneoEndpoints = {
	[K in keyof typeof KaneoApi.groups]: Record<
		keyof (typeof KaneoApi.groups)[K]["endpoints"],
		RouteScope
	>;
};

export const kaneoScopeRoots: KaneoEndpoints = {
	boards: {
		list: {
			scope: "org",
			parent: {
				resource: "org",
				from: "query",
				param: "organizationId",
			},
			note: "Kaneo wire compat: org from query; requireMember gates it (line c: one org's boards only).",
		},
		create: {
			scope: "org",
			parent: {
				resource: "org",
				from: "payload",
				param: "organizationId",
			},
			note: "Kaneo wire compat: org from payload; requireMember + board:create.",
		},
		get: {
			scope: "board",
			parent: {
				resource: "board",
				from: "resolved",
				note: "guardBoard: :id → board → org; 400 when unresolvable, membership + view privilege required.",
			},
		},
		update: {
			scope: "board",
			parent: {
				resource: "board",
				from: "resolved",
				note: "guardBoard: :id → board → org; edit privilege + board:update.",
			},
		},
		delete: {
			scope: "board",
			parent: {
				resource: "board",
				from: "resolved",
				note: "guardBoard: :id → board → org; edit privilege + board:delete.",
			},
		},
		archive: {
			scope: "board",
			parent: {
				resource: "board",
				from: "resolved",
				note: "guardBoard: :id → board → org; edit privilege + board:delete (archive).",
			},
		},
		unarchive: {
			scope: "board",
			parent: {
				resource: "board",
				from: "resolved",
				note: "guardBoard: :id → board → org; edit privilege + board:update.",
			},
		},
	},
	columns: {
		list: {
			scope: "board",
			parent: { resource: "board", from: "path", param: "boardId" },
			note: "Line d: nested read guarded, not just the parent board.",
		},
		create: {
			scope: "board",
			parent: { resource: "board", from: "path", param: "boardId" },
		},
		reorder: {
			scope: "board",
			parent: { resource: "board", from: "path", param: "boardId" },
		},
		update: {
			scope: "board",
			parent: {
				resource: "column",
				from: "resolved",
				note: "guardColumn: column :id → board → org; edit privilege + board:update.",
			},
		},
		delete: {
			scope: "board",
			parent: {
				resource: "column",
				from: "resolved",
				note: "guardColumn: column :id → board → org; edit privilege + board:update.",
			},
		},
	},
	labels: {
		byTask: {
			scope: "task",
			parent: { resource: "task", from: "path", param: "taskId" },
			note: "Line d: guardTask covers the nested label read.",
		},
		byOrganization: {
			scope: "org",
			parent: { resource: "org", from: "path", param: "organizationId" },
			note: "Line c: labels of this org only.",
		},
		create: {
			scope: "org",
			parent: {
				resource: "org",
				from: "payload",
				param: "organizationId",
			},
			note: "Kaneo wire compat: org from payload; a taskId from another org is rejected by the handler.",
		},
		get: {
			scope: "org",
			parent: {
				resource: "label",
				from: "resolved",
				note: "label :id → organizationId; guardOrg membership.",
			},
		},
		assign: {
			scope: "org",
			parent: {
				resource: "label",
				from: "resolved",
				note: "label :id → organizationId AND payload taskId's org — handler refuses cross-org pairs.",
			},
		},
		unassign: {
			scope: "org",
			parent: {
				resource: "label",
				from: "resolved",
				note: "label :id → organizationId; guardOrg membership.",
			},
		},
		update: {
			scope: "org",
			parent: {
				resource: "label",
				from: "resolved",
				note: "label :id → organizationId; guardOrg membership.",
			},
		},
		delete: {
			scope: "org",
			parent: {
				resource: "label",
				from: "resolved",
				note: "label :id → organizationId; guardOrg membership.",
			},
		},
	},
};
