/**
 * STL-16 §5/§7: real-API e2e environment (T28–T34) — Playwright globalSetup.
 *
 * Owns the whole stack, in order: disposable Postgres → REAL work/foundation
 * API handlers (composed exactly as main.ts does; the injected authorize
 * implements T1's membership rule) → fixture seed through the committed
 * domain services → production UI build → `vite preview` serving the built
 * bundle with /api and /orgs proxied same-origin to the real API.
 *
 * work.spec.ts mocks ONLY auth/config chrome — work requests are never
 * intercepted (§6). teardown() stops the preview server, the API handlers
 * and reaps the PG cluster; a process-exit hook covers crashed runs.
 */
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import postgres from "postgres";
import { migrate } from "../../../../packages/db/src/migrate";
import {
	createBoard,
	createLabel,
	createTicket,
} from "../../../../packages/domain/src/work";
import { disposablePostgres } from "../../../../tests/helpers/postgres";
import { ORG, UI_PORT, USER } from "./work-e2e-constants";
import { startWorkE2eServer } from "./work-e2e-server";

type WorkE2eHandle = {
	port: number;
	uiPort: number;
	boardSlug: string;
	firstTicketId: string;
	close: () => Promise<void>;
};

let handle: WorkE2eHandle | undefined;

export default async function setup(): Promise<WorkE2eHandle> {
	if (handle) return handle;
	// A preview squatter from a crashed earlier run would serve static but
	// 500 every /api proxy request; clear the port before anything binds.
	try {
		execFileSync("fuser", ["-k", `${UI_PORT}/tcp`], { stdio: "ignore" });
		await new Promise((resolve) => setTimeout(resolve, 500));
	} catch {}
	// Resolve the repo root from the module file location; some evaluators
	// virtualize import.meta.dir (undefined), so guard the fallback chain.
	const moduleDir = import.meta.dir as string | undefined;
	const repoRoot =
		moduleDir && moduleDir.includes("/e2e/tools")
			? join(moduleDir, "../../../..")
			: process.cwd();
	const db = await disposablePostgres();
	const sql = db.sql;
	await migrate(sql);
	// Identity seed (same shape as tests/helpers/work-fixture.ts).
	// Pinned seed timestamps: screenshot baselines must not drift with wall time.
	const seededAt = new Date("2026-01-01T00:00:00.000Z");
	await sql`INSERT INTO organization (id, name, slug, created_at)
		VALUES (${ORG}, 'Foundation Lab', ${ORG}, ${seededAt})
		ON CONFLICT (id) DO NOTHING`;
	for (const [id, name, email] of [
		[USER, "Ada", "ada@fixture.test"],
		["fixture-user-2", "Lin", "lin@fixture.test"],
	] as const) {
		await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
			VALUES (${id}, ${name}, ${email}, true, ${seededAt}, ${seededAt})
			ON CONFLICT (id) DO NOTHING`;
	}
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('fixture-member-1', ${ORG}, ${USER}, 'owner', ${seededAt})
		ON CONFLICT (id) DO NOTHING`;
	await sql`INSERT INTO organization_member (id, organization_id, user_id, role, joined_at)
		VALUES ('fixture-member-2', ${ORG}, 'fixture-user-2', 'member', ${seededAt})
		ON CONFLICT (id) DO NOTHING`;
	// Work seed through the committed domain path (board seeds 4 statuses).
	const board = await createBoard(sql, ORG, USER, {
		id: "fixture-board",
		name: "Foundation Board",
		slug: "foundation-board",
	});
	const ticketIds: string[] = [];
	for (const title of ["First probe", "Second probe", "Third probe"]) {
		const result = await createTicket(sql, ORG, USER, board.data.id, {
			id: `fixture-ticket-${ticketIds.length}`,
			title,
			priority: "medium",
		});
		ticketIds.push(result.data.id);
	}
	await createLabel(sql, ORG, USER, {
		id: "fixture-label-1",
		name: "sync",
		color: "#2563eb",
		organizationId: ORG,
	});
	// Backdate domain-created rows to the pinned seed instant (created_at
	// drives sidebar order and relative dates; services stamp wall time).
	await sql`UPDATE "board" SET created_at = ${seededAt} WHERE organization_id = ${ORG}`;
	await sql`UPDATE "column" SET created_at = ${seededAt}, updated_at = ${seededAt} WHERE board_id IN (SELECT id FROM "board" WHERE organization_id = ${ORG})`;
	await sql`UPDATE task SET created_at = ${seededAt}, updated_at = ${seededAt} WHERE board_id IN (SELECT id FROM "board" WHERE organization_id = ${ORG})`;
	await sql`UPDATE label SET created_at = ${seededAt}, updated_at = ${seededAt} WHERE organization_id = ${ORG}`;
	const server = await startWorkE2eServer(sql, {
		org: ORG,
		userIds: [USER, "fixture-user-2"],
	});
	// Production build once; the preview server serves dist with proxies.
	const build = spawn(
		"bun",
		["run", "--cwd", "apps/stellarc-ui", "build"],
		{ cwd: repoRoot, stdio: "inherit" },
	);
	await new Promise<void>((resolve, reject) => {
		build.on("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(`UI build failed: ${code}`)),
		);
	});
	const proxyTarget = `http://127.0.0.1:${server.port}`;
	const preview = spawn(
		"bun",
		[
			"run",
			"--cwd",
			"apps/stellarc-ui",
			"preview",
			"--",
			"--host",
			"127.0.0.1",
			"--port",
			String(UI_PORT),
			"--strictPort",
		],
		{
			cwd: repoRoot,
			stdio: "ignore",
			env: { ...process.env, STELLARC_PROXY_API: proxyTarget },
		},
	);
	const uiReady = async () => {
		// Readiness = static UI AND the API proxy actually reaching the live
		// API (an orphan preview from a crashed run serves / fine but 500s /api).
		for (let attempt = 0; attempt < 120; attempt++) {
			try {
				const probe = await fetch(
					`http://127.0.0.1:${UI_PORT}/api/work/boards`,
					{ headers: { authorization: `Bearer ${ORG} ${USER}` } },
				);
				if (probe.ok) return;
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		throw new Error("vite preview did not become ready (or proxy is dead)");
	};
	await uiReady();
	const close = async () => {
		preview.kill("SIGTERM");
		await new Promise((resolve) => setTimeout(resolve, 500));
		preview.kill("SIGKILL");
		// `bun run preview` wraps a node grandchild that can outlive the group
		// kill; refuse to leave a squatter on the port (a stale preview serves
		// static fine but 500s every /api proxy request).
		for (let attempt = 0; attempt < 10; attempt++) {
			try {
				await fetch(`http://127.0.0.1:${UI_PORT}/`);
				await new Promise((resolve) => setTimeout(resolve, 300));
			} catch {
				break;
			}
		}
		try {
			execFileSync("fuser", ["-k", `${UI_PORT}/tcp`], { stdio: "ignore" });
		} catch {}
		await server.close();
		await db.close();
	};
	handle = {
		port: server.port,
		uiPort: UI_PORT,
		boardSlug: board.data.slug,
		firstTicketId: ticketIds[0] ?? "",
		close,
	};
	(process as unknown as { __workE2eClose?: () => Promise<void> }).__workE2eClose =
		close;
	process.on("exit", () => {
		try {
			preview.kill("SIGKILL");
		} catch {}
	});
	return handle;
}

