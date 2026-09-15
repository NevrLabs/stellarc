import { Effect } from "effect";
import type { Sql } from "postgres";
import type { WorkflowRow } from "../../contracts/src/activity-notifications";
import {
	appendEventInTx,
	DomainConflict,
	DomainForbidden,
	DomainNotFound,
	DomainValidation,
	newId,
	WORKFLOW_EVENT_TYPES,
} from "./activity-events";
import { safeTxid } from "./activity";

/**
 * T20/T21: workflow rules are integration event→status mappings (§1), CRUD
 * here; GitHub ingestion and invoking the resolver belong to STL-18, which
 * consumes resolveWorkflowRule. Vocabulary is pinned (§3), never arbitrary
 * code/expressions.
 */

/** Pinned integration/event pairs (fork workflow-editor vocabulary). */
export const WORKFLOW_VOCABULARY: ReadonlySet<string> = new Set([
	"github:issue_opened",
	"github:issue_closed",
	"github:issue_reopened",
	"github:pr_opened",
	"github:pr_merged",
	"github:pr_closed",
]);

export interface WorkflowDeps {
	/** Can the actor update the board? (STL-16 seam) */
	readonly canUpdateBoard: (org: string, boardId: string, actor: string) => Promise<boolean>;
	/** Does the status belong to the board? (STL-16 seam) */
	readonly statusInBoard: (org: string, boardId: string, statusId: string) => Promise<boolean>;
	/** Can the actor view the board? (STL-16 seam) */
	readonly canViewBoard: (org: string, boardId: string, actor: string) => Promise<boolean>;
}

interface RuleRowDb {
	id: string;
	org_id: string;
	board_id: string;
	integration_type: string;
	event_type: string;
	status_id: string;
	created_at: Date | string;
	updated_at: Date | string;
}

function toRow(r: RuleRowDb): WorkflowRow {
	return {
		id: r.id,
		orgId: r.org_id,
		boardId: r.board_id,
		integrationType: r.integration_type,
		eventType: r.event_type,
		statusId: r.status_id,
		createdAt: new Date(r.created_at),
		updatedAt: new Date(r.updated_at),
	};
}

export const listWorkflowRules = (
	sql: Sql,
	org: string,
	boardId: string,
	actor: string,
	deps: WorkflowDeps,
): Effect.Effect<{ items: WorkflowRow[] }, unknown> =>
	Effect.fn("Domain.workflowRules.list")(function* () {
		if (
			!(yield* Effect.tryPromise(() =>
				deps.canViewBoard(org, boardId, actor),
			))
		)
			throw new DomainNotFound();
		const rows = yield* Effect.tryPromise(() =>
			sql<RuleRowDb[]>`
      SELECT * FROM workflow_rule
      WHERE org_id=${org} AND board_id=${boardId}
      ORDER BY created_at, id`,
		);
		return { items: rows.map(toRow) };
	})();

export const upsertWorkflowRule = (
	sql: Sql,
	deps: WorkflowDeps,
	args: {
		org: string;
		boardId: string;
		actor: string;
		integrationType: string;
		eventType: string;
		statusId: string;
	},
): Effect.Effect<{ data: WorkflowRow; txid: number }, unknown> =>
	Effect.fn("Domain.workflowRules.upsert")(function* () {
		const pair = `${args.integrationType}:${args.eventType}`;
		if (!WORKFLOW_VOCABULARY.has(pair))
			throw new DomainValidation(pair);
		if (
			!(yield* Effect.tryPromise(() =>
				deps.canUpdateBoard(args.org, args.boardId, args.actor),
			))
		)
			throw new DomainForbidden();
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (
						tx,
					): Promise<{ data: WorkflowRow; txid: number }> => {
						if (
							!(await deps.statusInBoard(args.org, args.boardId, args.statusId))
						)
							throw new DomainValidation("status not in board");
						const now = new Date();
						const rows = await tx<RuleRowDb[]>`
              INSERT INTO workflow_rule
                (id, org_id, board_id, integration_type, event_type, status_id, created_at, updated_at)
              VALUES (${newId()}, ${args.org}, ${args.boardId},
                ${args.integrationType}, ${args.eventType}, ${args.statusId}, ${now}, ${now})
              ON CONFLICT (board_id, integration_type, event_type) DO UPDATE SET
                status_id=EXCLUDED.status_id, updated_at=EXCLUDED.updated_at
              RETURNING *`;
						if (!rows[0]) throw new DomainConflict("Duplicate");
						const { txidText } = await appendEventInTx(
							tx,
							args.org,
							args.actor,
							WORKFLOW_EVENT_TYPES.ruleUpserted,
							JSON.stringify({
								id: rows[0].id,
								boardId: args.boardId,
							}),
						);
						return { data: toRow(rows[0]), txid: safeTxid(txidText) };
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();

export const deleteWorkflowRule = (
	sql: Sql,
	deps: WorkflowDeps,
	args: { org: string; boardId: string; ruleId: string; actor: string },
): Effect.Effect<{ data: { id: string }; txid: number }, unknown> =>
	Effect.fn("Domain.workflowRules.delete")(function* () {
		if (
			!(yield* Effect.tryPromise(() =>
				deps.canUpdateBoard(args.org, args.boardId, args.actor),
			))
		)
			throw new DomainForbidden();
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (
						tx,
					): Promise<{ data: { id: string }; txid: number }> => {
						const rows = await tx<{ id: string }[]>`
              DELETE FROM workflow_rule
              WHERE id=${args.ruleId} AND org_id=${args.org} AND board_id=${args.boardId}
              RETURNING id`;
						if (!rows[0]) throw new DomainNotFound();
						const { txidText } = await appendEventInTx(
							tx,
							args.org,
							args.actor,
							WORKFLOW_EVENT_TYPES.ruleDeleted,
							JSON.stringify({ id: rows[0].id, boardId: args.boardId }),
						);
						return { data: { id: rows[0].id }, txid: safeTxid(txidText) };
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();

/**
 * T21 resolver: returns the configured target status for an integration
 * event, or null when the board has no mapping. STL-18 invokes this; it is
 * pure lookup — no code execution.
 */
export async function resolveWorkflowRule(
	sql: Sql,
	org: string,
	boardId: string,
	integrationType: string,
	eventType: string,
): Promise<string | null> {
	const rows = await sql<{ status_id: string }[]>`
    SELECT status_id FROM workflow_rule
    WHERE org_id=${org} AND board_id=${boardId}
      AND integration_type=${integrationType} AND event_type=${eventType}`;
	return rows[0]?.status_id ?? null;
}

/** T21: validate a candidate pair against the pinned vocabulary. */
export function isValidWorkflowPair(
	integrationType: string,
	eventType: string,
): boolean {
	return WORKFLOW_VOCABULARY.has(`${integrationType}:${eventType}`);
}
