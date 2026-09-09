import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

export async function disposablePostgres() {
	const root = await mkdtemp(join(tmpdir(), "stellarc-test-"));
	const data = join(root, "data");
	const bin = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";
	execFileSync(
		join(bin, "initdb"),
		["-D", data, "-A", "trust", "--no-locale", "-U", "stellarc_owner"],
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
		max: 8,
		onnotice: () => {},
	});
	return {
		sql,
		async close() {
			await sql.end();
			execFileSync(
				join(bin, "pg_ctl"),
				["-D", data, "-m", "immediate", "-w", "stop"],
				{ stdio: "pipe" },
			);
			await rm(root, { recursive: true });
		},
	};
}
