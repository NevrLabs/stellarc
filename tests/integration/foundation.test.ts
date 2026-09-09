import { createCollection } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { afterAll, expect, test } from "vitest";
import { startTestServer } from "./test-server";

const resources: Array<() => Promise<void>> = [];

test("T12 cursors are issued per handle and reject forged or cross-handle continuations", async () => {
	const server = await startTestServer();
	resources.push(server.close);
	await server.write("org-a", "probe", "initial");
	const base = `${server.url}/orgs/org-a/v1/shape?table=sync_probe`;
	const headers = { authorization: "Bearer org-a" };
	const first = await fetch(`${base}&offset=-1`, { headers });
	const second = await fetch(`${base}&offset=-1`, { headers });
	const handle = first.headers.get("electric-handle");
	const other = second.headers.get("electric-handle");
	const offset = first.headers.get("electric-offset");
	expect(offset).not.toBe(second.headers.get("electric-offset"));
	const crossed = await fetch(`${base}&handle=${other}&offset=${offset}`, {
		headers,
	});
	expect(crossed.status).toBe(409);
	expect(await crossed.json()).toEqual([
		{ headers: { control: "must-refetch" } },
	]);
	const forged = await fetch(`${base}&handle=${handle}&offset=999999_0`, {
		headers,
	});
	expect(forged.status).toBe(409);
	for (const invalid of ["s:-100", "s:NaN", "1e3_0", "-2"]) {
		const response = await fetch(`${base}&handle=${handle}&offset=${invalid}`, {
			headers,
		});
		expect(response.status).toBe(400);
	}
	const resumed = await fetch(`${base}&handle=${handle}&offset=${offset}`, {
		headers,
	});
	expect(resumed.status).toBe(200);
});

test("T23 retries preserve identities, unrelated events advance and bigint boundaries stay exact", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbes } = await import("../../packages/domain/src/index");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await db.sql`INSERT INTO org_event_counter(org,seq) VALUES ('big','9007199254740992')`;
	const engine = new ShapeEngine(db.sql);
	const shape = (offset: string, handle = "") =>
		engine.shape(
			"big",
			new URL(
				`http://test/?table=sync_probe&offset=${offset}&handle=${handle}`,
			),
		);
	const initial = await shape("-1");
	const handle = initial.headers.get("electric-handle") ?? "";
	const cursor = initial.headers.get("electric-offset") ?? "";
	await mutateProbes(db.sql, "big", "actor", [
		{ operation: "upsert", id: "same", value: "one" },
		{ operation: "upsert", id: "same", value: "two" },
	]);
	await db.sql.begin(async (tx) => {
		const [row] =
			await tx`UPDATE org_event_counter SET seq=seq+1 WHERE org='big' RETURNING seq::text`;
		await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid) VALUES ('big',${row.seq},'other:changed','actor','{}',1,pg_current_xact_id()::text::bigint)`;
	});
	const first = await shape(cursor, handle);
	const replay = await shape(cursor, handle);
	const messages = await first.json();
	expect(await replay.json()).toEqual(messages);
	expect(replay.headers.get("electric-offset")).toBe(
		first.headers.get("electric-offset"),
	);
	const changes = messages.filter(
		(message: { headers: { operation?: string } }) => message.headers.operation,
	);
	expect(
		changes.map(
			(message: { value: { last_seq: string } }) => message.value.last_seq,
		),
	).toEqual(["9007199254740993", "9007199254740994"]);
	const applied = new Map<string, string>();
	const identities = new Set<string>();
	for (const message of [...changes, ...changes]) {
		const identity = `${message.value.org}:${message.value.last_seq}`;
		if (identities.has(identity)) continue;
		identities.add(identity);
		applied.set(message.key, message.value.value);
	}
	expect([...identities]).toEqual([
		"big:9007199254740993",
		"big:9007199254740994",
	]);
	expect([...applied]).toEqual([[JSON.stringify(["big", "same"]), "two"]]);
	const next = first.headers.get("electric-offset") ?? "";
	const drained = await shape(next, handle);
	expect(await drained.json()).toEqual([
		{ headers: { control: "up-to-date" } },
	]);
	expect(drained.headers.get("electric-offset")).toBe(next);
	await mutateProbes(db.sql, "big", "actor", [
		{ operation: "upsert", id: "same", value: "three" },
	]);
	const final = await shape(next, handle);
	const finalMessages = await final.json();
	expect(finalMessages[0].value.last_seq).toBe("9007199254740996");
});

test("T07 immutable snapshot pages survive updates and deletes; tail only declares caught-up at its boundary", async () => {
	const { disposablePostgres } = await import("../helpers/postgres");
	const { migrate } = await import("../../packages/db/src/migrate");
	const { mutateProbes } = await import("../../packages/domain/src/index");
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const db = await disposablePostgres();
	resources.push(db.close);
	await migrate(db.sql);
	await mutateProbes(
		db.sql,
		"pages",
		"actor",
		Array.from({ length: 205 }, (_, i) => ({
			operation: "upsert" as const,
			id: `row-${String(i).padStart(3, "0")}`,
			value: "before",
		})),
	);
	const engine = new ShapeEngine(db.sql);
	const shape = (offset: string, handle = "") =>
		engine.shape(
			"pages",
			new URL(
				`http://test/?table=sync_probe&offset=${offset}&handle=${handle}`,
			),
		);
	const initial = await shape("-1");
	const handle = initial.headers.get("electric-handle") ?? "";
	const rows = await initial.json();
	expect(rows).toHaveLength(100);
	expect(initial.headers.has("electric-up-to-date")).toBe(false);
	await mutateProbes(db.sql, "pages", "actor", [
		{ operation: "delete", id: "row-150" },
		...Array.from({ length: 104 }, (_, i) => ({
			operation: "upsert" as const,
			id: `row-${String(i + 100).padStart(3, "0")}`,
			value: "after",
		})),
	]);
	let offset = initial.headers.get("electric-offset") ?? "";
	for (let page = 0; page < 2; page++) {
		const response = await shape(offset, handle);
		rows.push(
			...(await response.json()).filter(
				(message: { value?: unknown }) => message.value,
			),
		);
		offset = response.headers.get("electric-offset") ?? "";
	}
	expect(rows).toHaveLength(205);
	expect(new Set(rows.map((row: { key: string }) => row.key)).size).toBe(205);
	expect(
		rows.every(
			(row: { value: { value: string } }) => row.value.value === "before",
		),
	).toBe(true);
	const tail = await shape(offset, handle);
	const events = await tail.json();
	expect(events).toHaveLength(100);
	expect(tail.headers.has("electric-up-to-date")).toBe(false);
	const rest = await shape(tail.headers.get("electric-offset") ?? "", handle);
	const remaining = await rest.json();
	expect(remaining).toHaveLength(6);
	expect(rest.headers.get("electric-up-to-date")).toBe("true");
	const projection = new Map<
		string,
		{ id: string; value: string; last_seq: string }
	>(
		rows.map(
			(row: {
				key: string;
				value: { id: string; value: string; last_seq: string };
			}) => [row.key, row.value],
		),
	);
	for (const message of [...events, ...remaining]) {
		if (message.headers.operation === "delete") projection.delete(message.key);
		else if (message.value) projection.set(message.key, message.value);
	}
	const persisted =
		await db.sql`SELECT id,value,last_seq::text FROM sync_probe WHERE org='pages' ORDER BY id`;
	expect(
		[...projection.values()]
			.map(({ id, value, last_seq }) => ({ id, value, last_seq }))
			.sort((a, b) => a.id.localeCompare(b.id)),
	).toEqual([...persisted]);
});

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
