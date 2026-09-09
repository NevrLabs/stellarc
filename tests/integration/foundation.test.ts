import { createCollection } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { afterAll, expect, test } from "vitest";
import { startTestServer } from "./test-server";

const resources: Array<() => Promise<void>> = [];

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
