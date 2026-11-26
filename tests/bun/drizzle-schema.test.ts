import { expect, setDefaultTimeout, test } from "bun:test";
import { sql } from "drizzle-orm";
import { pgSchema, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { disposablePostgres } from "../helpers/postgres";

setDefaultTimeout(60_000);

test("Drizzle typed writes and PostgreSQL DDL commit and roll back together", async () => {
	const fixture = await disposablePostgres();
	try {
		// This client belongs only to the probe. Drizzle changes its parsers.
		const db = drizzle(fixture.sql);
		const schema = pgSchema("managed_app_fixture");
		const items = schema.table("item", {
			id: text().primaryKey(),
			note: text(),
		});
		await db.transaction(async (tx) => {
			await tx.execute(sql`CREATE SCHEMA ${schema}`);
			await tx.execute(sql`CREATE TABLE ${items} (id text PRIMARY KEY)`);
			await tx.execute(sql`ALTER TABLE ${items} ADD COLUMN note text`);
			await tx.insert(items).values({ id: "committed", note: "kept" });
		});

		const abort = new Error("abort fixture transaction");
		await expect(
			db.transaction(async (tx) => {
				await tx.execute(sql`ALTER TABLE ${items} ADD COLUMN discarded text`);
				await tx.insert(items).values({ id: "rolled-back" });
				throw abort;
			}),
		).rejects.toBe(abort);

		expect(await db.select().from(items)).toEqual([
			{ id: "committed", note: "kept" },
		]);
		const [row] = await db.execute<{ present: boolean }>(sql`
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = 'managed_app_fixture' AND table_name = 'item'
				  AND column_name = 'discarded'
			) AS present`);
		expect(row?.present).toBe(false);
	} finally {
		await fixture.close();
	}
});
