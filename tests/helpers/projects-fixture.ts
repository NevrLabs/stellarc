// STL-21 §5 manifest: tests/helpers/projects-fixture.ts
// Live parity harness (T0 pattern: tests/helpers/postgres.ts). Boots a
// disposable Postgres, migrates, seeds the frozen-e2e dataset through the
// domain services (never raw SQL bypassing events), and serves the REAL
// projects API (engine + handlers) on an ephemeral port. Project traffic in
// e2e hits this server through the vite preview proxy — intercepting project
// requests invalidates parity evidence (§6), so nothing here stubs them.

import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, ManagedRuntime } from "effect";
import postgres from "postgres";
import { migrate } from "../../packages/db/src/migrate";

export type ProjectsFixtureServer = {
	url: string;
	sql: postgres.Sql;
	close: () => Promise<void>;
};

const FIXTURE_ORG = {
	id: "fixture-org",
	name: "Foundation Lab",
	slug: "foundation",
};

const CREATED_AT = "2026-01-01T00:00:00.000Z";

async function disposablePostgres() {
	const root = await mkdtemp(join(tmpdir(), "stellarc-e2e-"));
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
	const port = 40000 + (process.pid % 20000);
	execFileSync(
		join(bin, "pg_ctl"),
		[
			"-D",
			data,
			"-o",
			`-p ${port} -k ${root} -c listen_addresses=127.0.0.1`,
			"-l",
			join(root, "postgres.log"),
			"start",
			"-w",
		],
		{ stdio: "pipe" },
	);
	const sql = postgres(`postgres://stellarc_owner@127.0.0.1:${port}/postgres`, {
		max: 4,
		onnotice: () => {},
	});
	return {
		sql,
		async close() {
			await sql.end();
			try {
				execFileSync(
					join(bin, "pg_ctl"),
					["-D", data, "stop", "-m", "immediate"],
					{
						stdio: "ignore",
					},
				);
			} catch {}
			await rm(root, { recursive: true, force: true });
		},
	};
}

/** Boot the live projects API over a disposable Postgres with the frozen
 * dataset seeded through the domain services. The authorize/principal seams
 * are permissive: this server is ephemeral and isolated (same pattern as
 * tests/integration/test-server.ts), and identity is STL-15 scope. */
export async function startProjectsFixtureServer(): Promise<ProjectsFixtureServer> {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const { ShapeEngine } = await import("../../packages/sync/src/index");
	const { registerProjectCollections } = await import(
		"../../packages/sync/src/projects-shapes"
	);
	const { TelemetryTest } = await import("../../packages/telemetry/src/index");
	const telemetry = TelemetryTest();
	const memoMap = await Effect.runPromise(Layer.makeMemoMap);
	const runtime = ManagedRuntime.make(telemetry.layer, memoMap);
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const engine = new ShapeEngine(db.sql);
	registerProjectCollections(engine);
	const http = foundationHandler(
		db.sql,
		engine,
		() => "ok",
		undefined,
		telemetry.layer,
		memoMap,
		() => "fixture-user-0",
	);

	// Seed identity + org + one project (+ update) through domain services.
	const sql = db.sql;
	await sql`INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES
		('fixture-user-0', 'Ada', 'ada@example.test', ${CREATED_AT}, ${CREATED_AT}),
		('fixture-user-1', 'Lin', 'lin@example.test', ${CREATED_AT}, ${CREATED_AT})`;
	await sql`INSERT INTO organization (id, name, slug, created_at) VALUES
		(${FIXTURE_ORG.id}, ${FIXTURE_ORG.name}, ${FIXTURE_ORG.slug}, ${CREATED_AT})`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, joined_at) VALUES
		('fixture-member-0', ${FIXTURE_ORG.id}, 'fixture-user-0', ${CREATED_AT}),
		('fixture-member-1', ${FIXTURE_ORG.id}, 'fixture-user-1', ${CREATED_AT})`;
	const { createProject } = await import("../../packages/domain/src/projects");
	const project = await createProject(sql, {
		organizationId: FIXTURE_ORG.id,
		name: "Sync Foundation",
		summary: "Ship the transactional event log and sync engine.",
		leadUserId: "fixture-user-0",
		createdBy: "fixture-user-0",
		slug: "foundation-lab",
		status: "started",
		priority: "high",
		description:
			"T0 foundation slice: Effect HttpApi, event log, shape server.",
		successCriteria: "Stock adapter round-trips with awaitTxId.",
		startDate: CREATED_AT,
		targetDate: "2026-12-31",
	});
	const { createProjectUpdate } = await import(
		"../../packages/domain/src/project-updates"
	);
	await createProjectUpdate(sql, {
		organizationId: FIXTURE_ORG.id,
		projectId: project.id,
		authorId: "fixture-user-0",
		content: "Snapshot/tail boundary proven deterministic.",
		health: "on-track",
	});

	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 30,
		fetch: (request) => http.handler(request),
	});
	return {
		url: server.url.origin,
		sql: db.sql,
		async close() {
			server.stop(true);
			await http.dispose();
			await runtime.dispose();
			await db.close();
		},
	};
}
