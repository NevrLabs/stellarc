import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runMigration } from "../../packages/db/src/migrate";
import {
	apiKeyDigest,
	authenticateApiKey,
} from "../../packages/domain/src/identity/auth";
import { disposablePostgres } from "../helpers/postgres";

// STL-15 §7 T05 (partial): disabled/expired/rate-exhausted keys are denied and
// the rate counter increments atomically under concurrent calls.

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

interface SeedOptions {
	enabled?: boolean | null;
	expiresAt?: string | null;
	rateEnabled?: boolean | null;
	rateMax?: number | null;
	requestCount?: number | null;
	remaining?: number | null;
	timeWindow?: number | null;
}

async function seedKey(id: string, options: SeedOptions = {}) {
	await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES (${`owner-${id}`}, 'Owner', ${`owner-${id}@t05.test`}, true, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization (id, name, slug, repos_enabled, tables_enabled, work_enabled, default_resource_privilege, ai_enabled, ai_default_token_limit, ai_default_character_limit, created_at)
		VALUES (${`org-${id}`}, 'Org', ${`org-${id}`}, false, false, false, 'manage', false, 1, 1, '2026-01-01 00:00:00')`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES (${`m-${id}`}, ${`org-${id}`}, ${`owner-${id}`}, 'owner', '2026-01-01 00:00:00')`;
	await sql`INSERT INTO apikey (id, config_id, name, reference_id, "key", enabled, rate_limit_enabled, rate_limit_time_window, rate_limit_max, request_count, remaining, expires_at, created_at, updated_at)
		VALUES (${id}, ${`cfg-${id}`}, 'Key', ${`owner-${id}`}, ${apiKeyDigest(`raw-${id}`)}, ${options.enabled ?? true}, ${options.rateEnabled ?? true}, ${options.timeWindow ?? 86400000}, ${options.rateMax ?? 3}, ${options.requestCount ?? 0}, ${options.remaining ?? null}, ${options.expiresAt ?? null}, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`;
}

function auth(id: string) {
	return authenticateApiKey(sql, `raw-${id}`);
}

test("T05 disabled key is denied", async () => {
	await seedKey("k-disabled", { enabled: false });
	expect(await auth("k-disabled")).toBeNull();
});

test("T05 expired key is denied", async () => {
	await seedKey("k-expired", { expiresAt: "2020-01-01 00:00:00" });
	expect(await auth("k-expired")).toBeNull();
});

test("T05 rate-exhausted key is denied and not counted", async () => {
	await seedKey("k-exhausted", {
		requestCount: 3,
		rateMax: 3,
		remaining: 0,
	});
	expect(await auth("k-exhausted")).toBeNull();
	const [row] =
		await sql`SELECT request_count FROM apikey WHERE id = 'k-exhausted'`;
	expect(Number(row.request_count)).toBe(3);
});

test("T05 unlimited key (rate limiting disabled) authenticates", async () => {
	await seedKey("k-unlimited", { rateEnabled: false });
	const result = await auth("k-unlimited");
	expect(result?.key.id).toBe("k-unlimited");
});

test("T05 key within limit authenticates and increments the counter", async () => {
	await seedKey("k-counter", { requestCount: 1, rateMax: 3 });
	const result = await auth("k-counter");
	expect(result?.key.id).toBe("k-counter");
	const [row] =
		await sql`SELECT request_count FROM apikey WHERE id = 'k-counter'`;
	expect(Number(row.request_count)).toBe(2);
});

test("T05 remaining budget is honored and decremented when finite", async () => {
	await seedKey("k-remaining", {
		requestCount: 0,
		remaining: 2,
		rateMax: 100,
	});
	expect((await auth("k-remaining"))?.key.id).toBe("k-remaining");
	const [row] =
		await sql`SELECT remaining FROM apikey WHERE id = 'k-remaining'`;
	expect(Number(row.remaining)).toBe(1);
});

test("T05 concurrent calls cannot exceed the rate limit (atomic increment)", async () => {
	await seedKey("k-race", { requestCount: 0, rateMax: 3 });
	const results = await Promise.all(
		Array.from({ length: 8 }, () => auth("k-race")),
	);
	const admitted = results.filter((r) => r !== null).length;
	expect(admitted).toBe(3);
	const [row] = await sql`SELECT request_count FROM apikey WHERE id = 'k-race'`;
	expect(Number(row.request_count)).toBe(3);
});
