import { afterAll, beforeAll, expect, test } from "bun:test";
import { isNative, kaneoNativeHandler } from "../../packages/kaneo/src/http";
import { runParity } from "../../packages/kaneo/test/parity";
import { disposablePostgres } from "../helpers/postgres";

/**
 * Effect-native Kaneo endpoints must be wire-identical to the lifted legacy
 * tree: same status codes and JSON for the same requests, for an instance
 * admin AND a plain org member (whose requests exercise the permission and
 * resource-privilege paths). One disposable PG, Kaneo's own migrations.
 */
const resources: Array<() => Promise<void>> = [];
let nativeBase = "";
let legacyBase = "";
let org = "";
let adminCookie = "";
let memberCookie = "";

const ORIGIN = "http://localhost:5273";
const json = { "content-type": "application/json", origin: ORIGIN };
const cookieOf = (res: Response) =>
	res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");

beforeAll(async () => {
	const db = await disposablePostgres();
	resources.push(db.close);
	const opts = db.sql.options as unknown as {
		host: string[];
		database: string;
		user: string;
	};
	const url = `postgresql://${opts.user}@localhost/${opts.database}?host=${encodeURIComponent(opts.host[0])}`;
	process.env.DATABASE_URL = url;
	process.env.AUTH_SECRET = "parity-test-secret-0123456789abcdef";
	process.env.KANEO_CLIENT_URL = ORIGIN;
	process.env.KANEO_API_URL = "http://localhost";
	// Hermetic: never inherit registration/login lockdowns from a host .env.
	process.env.DISABLE_REGISTRATION = "false";
	process.env.DISABLE_PASSWORD_REGISTRATION = "false";
	process.env.DISABLE_LOGIN_FORM = "false";
	// The legacy tree is loaded by path so the strict root typecheck never
	// crawls it (it keeps Kaneo's own compiler settings).
	const L = "../../packages/kaneo-legacy/src";
	const legacy = await import(`${L}/index.ts`);
	await legacy.runStartupTasks();
	const { resolvePrincipal, domainPorts } = await import(
		`${L}/stellarc-auth.ts`
	);
	const native = kaneoNativeHandler({
		databaseUrl: url,
		resolvePrincipal,
		ports: domainPorts,
	});
	const legacySrv = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (r) => legacy.default.fetch(r),
	});
	const nativeSrv = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		// Native host: Effect handlers for the migrated surface; auth + org
		// creation still flow through the legacy tree (BetterAuth).
		fetch: (r) => (isNative(r) ? native.handler(r) : legacy.default.fetch(r)),
	});
	resources.push(async () => {
		legacySrv.stop(true);
		nativeSrv.stop(true);
		await native.dispose();
		const { getDatabasePool } = await import(`${L}/database/index.ts`);
		await getDatabasePool().end();
		const { shutdownScheduler } = await import(`${L}/scheduler/index.ts`);
		shutdownScheduler();
	});
	legacyBase = legacySrv.url.origin;
	nativeBase = nativeSrv.url.origin;

	const signUp = async (email: string) => {
		const res = await fetch(`${legacyBase}/api/auth/sign-up/email`, {
			method: "POST",
			headers: json,
			body: JSON.stringify({
				email,
				password: "ParityPass-12345!",
				name: email.split("@")[0],
			}),
		});
		expect(res.status).toBe(200);
		return cookieOf(res);
	};
	await signUp("admin@parity.test");
	await db.sql`UPDATE "user" SET role='admin' WHERE email='admin@parity.test'`;
	// Session cookies cache the role: sign in again after promotion.
	const signIn = await fetch(`${legacyBase}/api/auth/sign-in/email`, {
		method: "POST",
		headers: json,
		body: JSON.stringify({
			email: "admin@parity.test",
			password: "ParityPass-12345!",
		}),
	});
	expect(signIn.status).toBe(200);
	adminCookie = cookieOf(signIn);
	const created = await fetch(`${legacyBase}/api/auth/organization/create`, {
		method: "POST",
		headers: { ...json, cookie: adminCookie },
		body: JSON.stringify({ name: "Parity Org", slug: "parity-org" }),
	});
	expect(created.status).toBe(200);
	org = ((await created.json()) as { id: string }).id;
	memberCookie = await signUp("member@parity.test");
	const [member] =
		await db.sql`SELECT id FROM "user" WHERE email='member@parity.test'`;
	await db.sql`INSERT INTO organization_member(id, organization_id, user_id, role, joined_at)
    VALUES ('m-parity', ${org}, ${member.id}, 'member', now())`;
	// A board the member can see, so lists are non-trivial.
	const board = await fetch(`${legacyBase}/api/board`, {
		method: "POST",
		headers: { ...json, cookie: adminCookie },
		body: JSON.stringify({
			name: "Seed",
			organizationId: org,
			icon: "Layout",
			slug: "seed",
		}),
	});
	expect(board.status).toBe(200);
}, 120_000);

afterAll(async () => {
	while (resources.length) await resources.pop()?.();
});

test("K1 board + column + label endpoints: native ≡ legacy for an instance admin", async () => {
	const rows = await runParity(nativeBase, legacyBase, adminCookie, org);
	expect(rows.filter((r) => !r.ok)).toEqual([]);
	expect(rows.length).toBe(34);
}, 60_000);

test("K2 board + column + label endpoints: native ≡ legacy for a plain member (permission paths)", async () => {
	const rows = await runParity(nativeBase, legacyBase, memberCookie, org);
	expect(rows.filter((r) => !r.ok)).toEqual([]);
	// members are denied board mutation: the denials themselves must match
	expect(rows.find((r) => r.name === "delete board")?.native).toBe(403);
	expect(rows.find((r) => r.name === "list foreign org")?.native).toBe(403);
}, 60_000);

test("K3 native label writes still reach board WebSocket subscribers via the shared bus", async () => {
	const h = { ...json, cookie: adminCookie };
	const boards = (await (
		await fetch(`${nativeBase}/api/board?organizationId=${org}`, { headers: h })
	).json()) as Array<{ id: string }>;
	const boardId = boards[0].id;
	const task = (await (
		await fetch(`${nativeBase}/api/task/${boardId}`, {
			method: "POST",
			headers: h,
			body: JSON.stringify({
				title: "ws host",
				description: "",
				status: "to-do",
				priority: "low",
				userId: "",
			}),
		})
	).json()) as { id: string };
	const { addConnection, removeConnection } = await import(
		`${"../../packages/kaneo-legacy/src"}/ws/index.ts`
	);
	const got: string[] = [];
	const conn = addConnection(
		boardId,
		{ send: (m: string) => got.push(JSON.parse(m).type) },
		"observer",
		"observer:w",
	);
	try {
		const label = await fetch(`${nativeBase}/api/label`, {
			method: "POST",
			headers: h,
			body: JSON.stringify({
				name: "ws-label",
				color: "#123",
				organizationId: org,
				taskId: task.id,
			}),
		});
		expect(label.status).toBe(200);
		// WS fan-out is batched per board; give the flush a moment.
		for (let i = 0; i < 40 && !got.includes("TASK_LABEL_UPDATED"); i++)
			await Bun.sleep(50);
		expect(got).toContain("TASK_LABEL_UPDATED");
	} finally {
		removeConnection(boardId, conn);
	}
}, 30_000);
