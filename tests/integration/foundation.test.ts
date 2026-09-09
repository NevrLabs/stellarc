import { createCollection } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { afterAll, expect, test } from "vitest";
import { startTestServer } from "./test-server";

const resources: Array<() => Promise<void>> = [];

test("T05 multi-event mutation reserves contiguous sequences with one committed txid", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbes } = await import("../../packages/domain/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	const result = await mutateProbes(db.sql, "batch-org", "actor", [
		{ operation: "upsert", id: "a", value: "first" },
		{ operation: "upsert", id: "b", value: "second" },
	]);
	const events =
		await db.sql`SELECT seq::text, txid::text FROM event WHERE org='batch-org' ORDER BY seq`;
	expect(events.map((event) => event.seq)).toEqual(["1", "2"]);
	const physical =
		await db.sql`SELECT xmin::text AS txid FROM event WHERE org='batch-org'`;
	expect(physical.map((event) => event.txid)).toEqual([
		String(result.txid),
		String(result.txid),
	]);
	expect(events.map((event) => event.txid)).toEqual([
		String(result.txid),
		String(result.txid),
	]);
	expect(
		await db.sql`SELECT id FROM sync_probe WHERE org='batch-org' ORDER BY id`,
	).toEqual([{ id: "a" }, { id: "b" }]);
});

test("T04 failed batch rolls back appended events, counter and projection; T10 missing delete is inert", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbes, writeProbe } = await import(
		"../../packages/domain/src/index"
	);
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await writeProbe(db.sql, "rollback-org", "actor", "a", "original");
	await expect(
		mutateProbes(db.sql, "rollback-org", "actor", [
			{ operation: "upsert", id: "a", value: "uncommitted" },
			{ operation: "delete", id: "absent" },
		]),
	).rejects.toThrow("Probe not found");
	expect(
		await db.sql`SELECT seq::text FROM org_event_counter WHERE org='rollback-org'`,
	).toEqual([{ seq: "1" }]);
	expect(
		await db.sql`SELECT seq::text FROM event WHERE org='rollback-org'`,
	).toEqual([{ seq: "1" }]);
	expect(
		await db.sql`SELECT value, last_seq::text FROM sync_probe WHERE org='rollback-org'`,
	).toEqual([{ value: "original", last_seq: "1" }]);
	const result = await mutateProbes(db.sql, "rollback-org", "actor", [
		{ operation: "delete", id: "a" },
	]);
	expect(
		await db.sql`SELECT id FROM sync_probe WHERE org='rollback-org'`,
	).toHaveLength(0);
	expect(
		await db.sql`SELECT seq::text, plugin_type, txid::text FROM event WHERE org='rollback-org' AND seq=2`,
	).toEqual([
		{
			seq: "2",
			plugin_type: "foundation:probe-deleted",
			txid: String(result.txid),
		},
	]);
});

test("T06 migrations serialize, repeat safely, and reject checksum drift", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await Promise.all([migrate(db.sql), migrate(db.sql)]);
	expect((await db.sql`SELECT version FROM stellarc_migration`).length).toBe(1);
	await db.sql`UPDATE stellarc_migration SET checksum='invalid'`;
	await expect(migrate(db.sql)).rejects.toThrow("Migration checksum mismatch");
});
afterAll(async () => {
	for (const close of resources.reverse()) await close();
});

test("T01 snapshot/reconnect retains the mutation committed between projection and counter reads", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "first", "before");
	let resume!: () => void;
	let observed!: () => void;
	const paused = new Promise<void>((resolve) => {
		observed = resolve;
	});
	const released = new Promise<void>((resolve) => {
		resume = resolve;
	});
	server.afterProjectionRead = async () => {
		observed();
		await released;
	};
	const initial = fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&offset=-1`,
		{
			headers: { authorization: "Bearer org-a" },
		},
	);
	await paused;
	const mutation = await server.write("org-a", "first", "after");
	resume();
	const snapshot = await initial;
	expect(snapshot.status).toBe(200);
	const snapshotMessages = await snapshot.json();
	expect(snapshotMessages[0].value.value).toBe("before");
	const handle = snapshot.headers.get("electric-handle") ?? "";
	const offset = snapshot.headers.get("electric-offset") ?? "";
	const continuation = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&handle=${handle}&offset=${offset}`,
		{
			headers: { authorization: "Bearer org-a" },
		},
	);
	const tail = await continuation.json();
	const changes = tail.filter(
		(message: { headers: { operation?: string } }) => message.headers.operation,
	);
	expect(changes).toHaveLength(1);
	expect(changes[0].headers.txids).toEqual([mutation.txid]);
	expect(changes[0].value.last_seq).toBe("2");
	expect(changes[0].value.value).toBe("after");
	server.afterProjectionRead = undefined;
	const collection = createCollection(
		electricCollectionOptions({
			id: "sync_probe:org-a",
			shapeOptions: {
				url: `${server.url}/orgs/org-a/v1/shape`,
				params: { table: "sync_probe" },
				headers: { authorization: "Bearer org-a" },
			},
			getKey: (row: {
				org: string;
				id: string;
				value: string;
				last_seq: bigint;
			}) => JSON.stringify([row.org, row.id]),
		}),
	);
	resources.push(async () => {
		await collection.cleanup();
	});
	await collection.preload();
	expect(collection.get(JSON.stringify(["org-a", "first"]))?.value).toBe(
		"after",
	);
}, 30_000);

test("T10 delete emits a stable-key delete and missing delete leaves the log unchanged", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "probe", "present");
	const initial = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&offset=-1`,
		{ headers: { authorization: "Bearer org-a" } },
	);
	const handle = initial.headers.get("electric-handle") ?? "";
	const offset = initial.headers.get("electric-offset") ?? "";
	const deleted = await server.delete("org-a", "probe");
	const tail = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&handle=${handle}&offset=${offset}`,
		{ headers: { authorization: "Bearer org-a" } },
	);
	const messages = await tail.json();
	expect(messages[0]).toEqual({
		key: JSON.stringify(["org-a", "probe"]),
		value: { org: "org-a", id: "probe" },
		headers: {
			operation: "delete",
			relation: ["public", "sync_probe"],
			txids: [deleted.txid],
		},
	});
	const before = await server.eventCount("org-a");
	await expect(server.delete("org-a", "missing")).rejects.toThrow("NotFound");
	expect(await server.eventCount("org-a")).toBe(before);
});

test("T13 missing auth is 401 and wrong-org capability is 403 with no data leakage", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "secret", "value");
	const noAuth = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&offset=-1`,
	);
	expect(noAuth.status).toBe(401);
	expect(await noAuth.text()).toBe("");
	const wrongOrg = await fetch(
		`${server.url}/orgs/org-a/v1/shape?table=sync_probe&offset=-1`,
		{ headers: { authorization: "Bearer org-b" } },
	);
	expect(wrongOrg.status).toBe(403);
	expect(await wrongOrg.text()).toBe("");
});

test("T04 exception after event append rolls back counter, event and projection together", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await expect(
		db.sql.begin(async (tx) => {
			await tx`INSERT INTO org_event_counter(org) VALUES ('org-a') ON CONFLICT DO NOTHING`;
			const [counter] =
				await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org='org-a' RETURNING seq::text`;
			const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
			await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
        VALUES ('org-a',${counter.seq},'foundation:probe-upserted','test-actor',${tx.json({ id: "x", value: "y" })},1,${transaction.txid})`;
			await tx`INSERT INTO sync_probe(org,id,value,last_seq) VALUES ('org-a','x','y',${counter.seq})`;
			throw new Error("forced rollback");
		}),
	).rejects.toThrow("forced rollback");
	const [counterRow] =
		await db.sql`SELECT seq FROM org_event_counter WHERE org='org-a'`;
	expect(counterRow).toBeUndefined();
	const [eventRow] = await db.sql`SELECT 1 FROM event WHERE org='org-a'`;
	expect(eventRow).toBeUndefined();
	const [probeRow] =
		await db.sql`SELECT 1 FROM sync_probe WHERE org='org-a' AND id='x'`;
	expect(probeRow).toBeUndefined();
	// Next write on the same org still succeeds, proving no partial lock/state leaked.
	const { writeProbe } = await import("../../packages/domain/src/index");
	const result = await writeProbe(db.sql, "org-a", "test-actor", "x", "y");
	expect(result.txid).toBeGreaterThan(0);
});
