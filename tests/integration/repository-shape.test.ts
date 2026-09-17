import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

// STL-18 T03/T07: repository shapes serve authorized org snapshots with
// cursor-anchored exact-once tails; issue/PR shapes are repo-scoped via the
// required `repo` parameter; deletes are emitted explicitly for cascaded
// mirror rows.

let sql: Sql;
let close: () => Promise<void>;
let orgId: string;

async function seedRepo() {
	orgId = "org-shape-1";
	await sql`INSERT INTO organization (id, name, slug, created_at)
    VALUES (${orgId}, 'Shape Org', 'shape-org', now())`;
	await sql`INSERT INTO repo (id, organization_id, provider, owner, name, url)
    VALUES ('repo-1', ${orgId}, 'github', 'foundation', 'probe', 'https://example.test/foundation/probe')`;
	await sql`INSERT INTO repo_issue (id, repo_id, number, title, state, url)
    VALUES ('issue-1', 'repo-1', 7, 'Gateway timeouts', 'open', 'https://example.test/issues/7')`;
	await sql`INSERT INTO repo_issue (id, repo_id, number, title, state, url)
    VALUES ('issue-2', 'repo-1', 8, 'Cursor overflow', 'closed', 'https://example.test/issues/8')`;
	await sql`INSERT INTO org_event_counter(org) VALUES (${orgId})`;
}

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	await seedRepo();
});

afterEach(async () => {
	await close();
});

async function engineWithShapes() {
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { registerRepositoryShapes } = await import(
		"../../packages/sync/src/repository-shapes"
	);
	const engine = new ShapeEngine(sql);
	registerRepositoryShapes(engine);
	return engine;
}

function shapeUrl(
	_org: string,
	table: string,
	params: Record<string, string> = {},
) {
	const url = new URL("http://localhost/v1/shape");
	url.searchParams.set("table", table);
	for (const [key, value] of Object.entries(params))
		url.searchParams.set(key, value);
	return url;
}

test("T03 repo shape snapshots org rows with correct schema header", async () => {
	const engine = await engineWithShapes();
	const response = await engine.shape(
		orgId,
		shapeUrl(orgId, "repo", { offset: "-1" }),
	);
	expect(response.status).toBe(200);
	const messages = (await response.json()) as Array<{
		key?: string;
		value?: Record<string, unknown>;
		headers: { operation?: string; relation?: string[] };
	}>;
	const inserts = messages.filter((m) => m.headers.operation === "insert");
	expect(inserts).toHaveLength(1);
	expect(inserts[0]?.value?.id).toBe("repo-1");
	expect(inserts[0]?.headers.relation?.[1]).toBe("repo");
	const schema = JSON.parse(
		response.headers.get("electric-schema") ?? "{}",
	) as Record<string, unknown>;
	expect(Object.keys(schema)).toContain("organization_id");
	// Foreign org sees nothing.
	const foreign = await engine.shape(
		"org-other",
		shapeUrl("org-other", "repo", { offset: "-1" }),
	);
	const foreignMessages = (await foreign.json()) as unknown[];
	expect(
		foreignMessages.filter(
			(m) => (m as { headers?: { operation?: string } }).headers?.operation,
		),
	).toHaveLength(0);
});

test("T03 issue shape requires repo param and filters by it", async () => {
	const engine = await engineWithShapes();
	await expect(
		engine.shape(orgId, shapeUrl(orgId, "repo_issue", { offset: "-1" })),
	).resolves.toMatchObject({ status: 400 });
	const response = await engine.shape(
		orgId,
		shapeUrl(orgId, "repo_issue", { offset: "-1", repo: "repo-1" }),
	);
	expect(response.status).toBe(200);
	const messages = (await response.json()) as Array<{
		value?: Record<string, unknown>;
		headers: { operation?: string };
	}>;
	const inserts = messages.filter((m) => m.headers.operation === "insert");
	expect(inserts.map((m) => m.value?.id).sort()).toEqual([
		"issue-1",
		"issue-2",
	]);
	// Foreign repo id is filtered out even for the authorized org.
	const other = await engine.shape(
		orgId,
		shapeUrl(orgId, "repo_issue", { offset: "-1", repo: "repo-foreign" }),
	);
	const otherMessages = (await other.json()) as Array<{
		headers: { operation?: string };
	}>;
	expect(otherMessages.filter((m) => m.headers.operation)).toHaveLength(0);
});

test("T07 upsert events tail into shape messages exactly once", async () => {
	const engine = await engineWithShapes();
	const first = await engine.shape(
		orgId,
		shapeUrl(orgId, "repo", { offset: "-1" }),
	);
	const body = (await first.json()) as Array<{
		headers: { operation?: string; control?: string };
	}>;
	// First page: snapshot only, boundary-anchored offset.
	expect(body.filter((m) => m.headers.operation === "insert")).toHaveLength(1);
	expect(body.some((m) => m.headers.control === "up-to-date")).toBe(true);
	const offset = first.headers.get("electric-offset");
	const handle = first.headers.get("electric-handle");
	expect(offset).toBeTruthy();
	expect(handle).toBeTruthy();
	// One new event after the snapshot boundary, written transactionally.
	await sql.begin(async (tx) => {
		await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org=${orgId}`;
		const [counter] =
			await tx`SELECT seq::text FROM org_event_counter WHERE org=${orgId}`;
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
    VALUES (${orgId},${counter.seq},'repository:repo-upserted','actor',${tx.json({ id: "repo-1", row: { id: "repo-1" }, origin: "live" })},1,'0'::bigint)`;
	});
	// Tail from the boundary offset with the issued handle: the one committed
	// upsert arrives exactly once, followed by up-to-date.
	const second = await engine.shape(
		orgId,
		shapeUrl(orgId, "repo", { offset: offset ?? "", handle: handle ?? "" }),
	);
	expect(second.status).toBe(200);
	const secondBody = (await second.json()) as Array<{
		value?: Record<string, unknown>;
		headers: { operation?: string; control?: string };
	}>;
	const updates = secondBody.filter((m) => m.headers.operation === "update");
	expect(updates).toHaveLength(1);
	expect(updates[0]?.value?.id).toBe("repo-1");
	expect(secondBody.at(-1)?.headers.control).toBe("up-to-date");
	// Replaying the same offset must not re-deliver the event (exact-once).
	const third = await engine.shape(
		orgId,
		shapeUrl(orgId, "repo", {
			offset: second.headers.get("electric-offset") ?? "",
			handle: handle ?? "",
		}),
	);
	const thirdBody = (await third.json()) as Array<{
		headers: { operation?: string };
	}>;
	expect(thirdBody.filter((m) => m.headers.operation)).toHaveLength(0);
});

test("T07 cascade delete emits child deletes so shapes converge", async () => {
	const { repoUpsertEffect, repoDeleteEffect } = await import(
		"../../packages/domain/src/repository"
	);
	const { Effect } = await import("effect");
	await Effect.runPromise(
		repoUpsertEffect(sql, orgId, "actor-1", {
			id: "repo-1",
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
			origin: "import",
		}),
	);
	await sql`INSERT INTO org_event_counter(org) VALUES (${orgId}) ON CONFLICT DO NOTHING`;
	await Effect.runPromise(repoDeleteEffect(sql, orgId, "actor-1", "repo-1"));
	const events = (await sql`
    SELECT plugin_type FROM event WHERE org=${orgId} AND plugin_type LIKE 'repository:%' ORDER BY seq`) as Array<{
		plugin_type: string;
	}>;
	const types = events.map((e) => e.plugin_type);
	expect(types).toContain("repository:issue-deleted");
	expect(types).toContain("repository:repo-deleted");
	expect(types.indexOf("repository:issue-deleted")).toBeLessThan(
		types.indexOf("repository:repo-deleted"),
	);
});
