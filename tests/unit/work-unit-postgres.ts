import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

// Shared disposable PG fixture for unit work tests (real binaries, trust auth,
// no socket; same shape as tests/helpers/postgres.ts but lean for unit scope).
const roots = new Set<string>();
const BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
const openPools = new Set<{ end: (opts: { timeout: number }) => Promise<void> }>();

export function trackPool(pool: { end: (opts: { timeout: number }) => Promise<void> }) {
	openPools.add(pool);
}

export async function startUnitPostgres() {
	const root = mkdtempSync(join(tmpdir(), "stellarc-unit-"));
	roots.add(root);
	const data = join(root, "data");
	execFileSync(join(BIN, "initdb"), [
		"-D",
		data,
		"-A",
		"trust",
		"--no-locale",
		"--no-sync",
		"-U",
		"stellarc_owner",
	]);
	execFileSync(join(BIN, "pg_ctl"), [
		"-D",
		data,
		"-l",
		join(root, "pg.log"),
		"-o",
		`-k ${root} -h ''`,
		"-w",
		"start",
	]);
	const { migrate } = await import("../../packages/db/src/migrate");
	const postgres = (await import("postgres")).default;
	const sql = postgres({
		host: root,
		username: "stellarc_owner",
		database: "postgres",
		max: 8,
		onnotice: () => {},
	});
	trackPool(sql as never);
	await migrate(sql);
	return { sql, root, data };
}

afterAll(async () => {
	for (const root of roots) {
		try {
			execFileSync(join(BIN, "pg_ctl"), [
				"-D",
				join(root, "data"),
				"-m",
				"immediate",
				"-w",
				"stop",
			]);
		} catch {}
		try {
			rmSync(root, { recursive: true, force: true });
		} catch {}
	}
	for (const pool of openPools)
		try {
			await pool.end({ timeout: 1 });
		} catch {}
	openPools.clear();
	roots.clear();
});
