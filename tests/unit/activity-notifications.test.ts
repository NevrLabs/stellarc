import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, test } from "vitest";
import { migrate } from "../../packages/db/src/migrate";
import {
	assertCatalog,
	assertCompositeSelectionFk,
	assertConstraints,
} from "../helpers/activity-fixture";

// T01 runs against a real cluster: information_schema/pg_constraint cannot be
// faked without testing the fake. One cluster for the whole file.
const root = await mkdtemp(join(tmpdir(), "stellarc-t01-"));
const data = join(root, "data");
const bin = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
execFileSync(
	join(bin, "initdb"),
	[
		"-D",
		data,
		"-A",
		"trust",
		"--no-locale",
		"--no-sync",
		"-U",
		"stellarc_owner",
	],
	{ stdio: "pipe" },
);
execFileSync(
	join(bin, "pg_ctl"),
	[
		"-D",
		data,
		"-l",
		join(root, "postgres.log"),
		"-o",
		`-k ${root} -h ''`,
		"-w",
		"start",
	],
	{ stdio: "pipe" },
);
const sql = postgres({
	host: root,
	username: "stellarc_owner",
	database: "postgres",
	max: 4,
	onnotice: () => {},
});

afterAll(async () => {
	await sql.end();
	try {
		execFileSync(
			join(bin, "pg_ctl"),
			["-D", data, "-m", "immediate", "-w", "stop"],
			{
				stdio: "pipe",
			},
		);
	} catch {}
	await rm(root, { recursive: true, force: true });
});

test("T01 schema catalog: every §2 table exists with exact columns/types/nullability", async () => {
	// RED condition: the 0004 store does not exist yet — migrate must fail the
	// catalog assertions until the migration lands.
	await migrate(sql);
	await assertCatalog(sql);
});

test("T01 schema constraints: unique/FK/check contracts are registered", async () => {
	await assertConstraints(sql);
});

test("T01 composite selection FK (organization_id, org_rule_id) targets the rule identity", async () => {
	await assertCompositeSelectionFk(sql);
});
