import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import { removeMember } from "../../packages/domain/src/identity/mutations";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 c3 unit A: the actor-less removeMember call must surface the
// §3 error union's Unauthenticated tag — not a Conflict carrying the word
// "Unauthenticated" as its code (c2 remnant of review c1 defect 1).

let sql: Sql;
const resources: Array<() => Promise<void>> = [];

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	resources.push(db.close);
	await runMigration(sql);
});

afterEach(async () => {
	while (resources.length > 0) await resources.pop()?.();
});

test("removeMember without actor throws Unauthenticated (§3 error union), not Conflict", async () => {
	let caught: unknown;
	try {
		await removeMember(sql, "org_x", "member_x", "");
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeDefined();
	expect(caught).toMatchObject({ _tag: "Unauthenticated" });
	expect(caught).not.toMatchObject({ _tag: "Conflict" });
});
