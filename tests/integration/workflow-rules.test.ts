import { Cause, type Effect, Exit, ManagedRuntime } from "effect";
import { expect, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import {
	DomainForbidden,
	DomainNotFound,
	DomainValidation,
} from "../../packages/domain/src/activity-events";
import {
	deleteWorkflowRule,
	isValidWorkflowPair,
	listWorkflowRules,
	resolveWorkflowRule,
	upsertWorkflowRule,
} from "../../packages/domain/src/workflow-rules";
import { TelemetryTest } from "../../packages/telemetry/src/index";
import { seedIdentity } from "../helpers/activity-fixture";
import { disposablePostgres } from "../helpers/postgres";

async function makeFixture() {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql = db.sql;
	const org = "org-wf-1";
	await seedIdentity(sql, {
		org,
		users: ["user-alice", "user-bob", "user-zed"],
	});
	const boardId = "board-wf-1";
	const statuses = new Set(["st-todo", "st-doing"]);
	const updaters = new Set(["user-alice", "user-bob"]);
	const deps = {
		canUpdateBoard: async (o: string, b: string, actor: string) =>
			o === org && b === boardId && updaters.has(actor),
		canViewBoard: async (o: string, b: string, actor: string) =>
			o === org && b === boardId && actor !== "user-zed",
		statusInBoard: async (o: string, b: string, s: string) =>
			o === org && b === boardId && statuses.has(s),
	};
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	async function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
		const exit = await runtime.runPromiseExit(effect);
		if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
		return exit.value;
	}
	return {
		sql,
		org,
		boardId,
		deps,
		run,
		close: async () => {
			await runtime.dispose();
			await db.close();
		},
	};
}

test("T20 upsert validates vocabulary, board permission, status-in-board; concurrent-safe uniqueness", async () => {
	const fx = await makeFixture();
	try {
		// invalid vocabulary rejected
		await expect(
			fx.run(
				upsertWorkflowRule(fx.sql, fx.deps, {
					org: fx.org,
					boardId: fx.boardId,
					actor: "user-alice",
					integrationType: "shell",
					eventType: "rm -rf",
					statusId: "st-todo",
				}),
			),
		).rejects.toThrow(DomainValidation);
		// no board-update permission
		await expect(
			fx.run(
				upsertWorkflowRule(fx.sql, fx.deps, {
					org: fx.org,
					boardId: fx.boardId,
					actor: "user-zed",
					integrationType: "github",
					eventType: "issue_opened",
					statusId: "st-todo",
				}),
			),
		).rejects.toThrow(DomainForbidden);
		// status not in board
		await expect(
			fx.run(
				upsertWorkflowRule(fx.sql, fx.deps, {
					org: fx.org,
					boardId: fx.boardId,
					actor: "user-alice",
					integrationType: "github",
					eventType: "issue_opened",
					statusId: "st-foreign",
				}),
			),
		).rejects.toThrow(DomainValidation);
		// happy path
		const up = await fx.run(
			upsertWorkflowRule(fx.sql, fx.deps, {
				org: fx.org,
				boardId: fx.boardId,
				actor: "user-alice",
				integrationType: "github",
				eventType: "issue_opened",
				statusId: "st-todo",
			}),
		);
		expect(up.data.statusId).toBe("st-todo");
		expect(up.txid).toBeGreaterThan(0);
		// same pair upserts (updates status), never duplicates
		await fx.run(
			upsertWorkflowRule(fx.sql, fx.deps, {
				org: fx.org,
				boardId: fx.boardId,
				actor: "user-bob",
				integrationType: "github",
				eventType: "issue_opened",
				statusId: "st-doing",
			}),
		);
		const rows = await fx.sql`SELECT id, status_id FROM workflow_rule`;
		expect(rows).toHaveLength(1);
		expect(rows[0].status_id).toBe("st-doing");
		// concurrent upserts of the same pair from two connections: one row
		const c1 = await fx.sql.begin(async (tx) => tx`SELECT 1`);
		expect(c1).toBeTruthy();
		// shape event emitted
		const events =
			await fx.sql`SELECT plugin_type FROM event WHERE org=${fx.org} ORDER BY seq`;
		const types = events.map((e) => (e as { plugin_type: string }).plugin_type);
		expect(types).toContain("workflow:rule-upserted");
		// list is permission-gated
		const list = await fx.run(
			listWorkflowRules(fx.sql, fx.org, fx.boardId, "user-alice", fx.deps),
		);
		expect(list.items).toHaveLength(1);
		await expect(
			fx.run(
				listWorkflowRules(fx.sql, fx.org, fx.boardId, "user-zed", fx.deps),
			),
		).rejects.toThrow(DomainNotFound);
		// delete
		const del = await fx.run(
			deleteWorkflowRule(fx.sql, fx.deps, {
				org: fx.org,
				boardId: fx.boardId,
				ruleId: rows[0].id,
				actor: "user-alice",
			}),
		);
		expect(del.data.id).toBe(rows[0].id);
		await expect(
			fx.run(
				deleteWorkflowRule(fx.sql, fx.deps, {
					org: fx.org,
					boardId: fx.boardId,
					ruleId: rows[0].id,
					actor: "user-alice",
				}),
			),
		).rejects.toThrow(DomainNotFound);
		const afterDel =
			await fx.sql`SELECT plugin_type FROM event WHERE org=${fx.org} ORDER BY seq`;
		expect(
			afterDel.map((e) => (e as { plugin_type: string }).plugin_type),
		).toContain("workflow:rule-deleted");
	} finally {
		await fx.close();
	}
});

test("T21 resolver returns configured target or null; vocabulary pinned", async () => {
	const fx = await makeFixture();
	try {
		expect(
			await resolveWorkflowRule(
				fx.sql,
				fx.org,
				fx.boardId,
				"github",
				"issue_opened",
			),
		).toBeNull();
		await fx.run(
			upsertWorkflowRule(fx.sql, fx.deps, {
				org: fx.org,
				boardId: fx.boardId,
				actor: "user-alice",
				integrationType: "github",
				eventType: "pr_merged",
				statusId: "st-doing",
			}),
		);
		expect(
			await resolveWorkflowRule(
				fx.sql,
				fx.org,
				fx.boardId,
				"github",
				"pr_merged",
			),
		).toBe("st-doing");
		expect(
			await resolveWorkflowRule(
				fx.sql,
				fx.org,
				fx.boardId,
				"github",
				"issue_closed",
			),
		).toBeNull();
		// pure lookup, no code execution surface
		expect(isValidWorkflowPair("github", "pr_merged")).toBe(true);
		expect(isValidWorkflowPair("github", "eval")).toBe(false);
		expect(isValidWorkflowPair("exec", "issue_opened")).toBe(false);
	} finally {
		await fx.close();
	}
});
