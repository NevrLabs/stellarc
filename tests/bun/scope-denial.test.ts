import { afterAll, beforeAll, expect, test } from "bun:test";
import { isNative, kaneoNativeHandler } from "../../packages/kaneo/src/http";
import { disposablePostgres } from "../helpers/postgres";

/**
 * NEVR-603 — cross-scope denial matrix for the native kaneo surface. The
 * scope-root tables (packages/kaneo/src/scope.ts) declare where each route's
 * parent object comes from — path, query, or payload. These tests are the
 * runtime half of that contract: a principal who is a member of org B only
 * must be denied every read and write whose parent lives in org A, no matter
 * which channel the parent id arrives through (Plane v1.5.0-rc1's failure
 * class: nested routes trusting a body-supplied parent). Fail-closed checks
 * (missing parent ⇒ denial, unknown id ⇒ 403/404 but never a leak) and a
 * user-self isolation check complete the matrix. A same-shape admin pass on
 * every probed route proves the 403s are scope denials, not crashes.
 *
 * The better-auth rate limiter is ON for these runs (line f: credential
 * routes are throttled everywhere, tests included). It buckets by the
 * x-forwarded-for IP, so each seeded identity sends a distinct RFC 5737
 * address — the suite gets real buckets and the production sign-up limit
 * (3/min per IP) is never weakened for the test's sake.
 */

const ORIGIN = "http://localhost:5273";
const json = { "content-type": "application/json", origin: ORIGIN };
const cookieOf = (res: Response) =>
	res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");

const resources: Array<() => Promise<void>> = [];
let base = "";
let orgA = "";
let foreignCookie = "";
let adminCookie = "";
let boardId = "";
let labelId = "";
let taskId = "";

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
	process.env.AUTH_SECRET = "scope-denial-secret-0123456789abcdef";
	process.env.KANEO_CLIENT_URL = ORIGIN;
	process.env.KANEO_API_URL = "http://localhost";
	process.env.DISABLE_REGISTRATION = "false";
	process.env.DISABLE_PASSWORD_REGISTRATION = "false";
	process.env.DISABLE_LOGIN_FORM = "false";
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
	base = nativeSrv.url.origin;

	// Distinct x-forwarded-for per identity: the rate limiter (enabled
	// everywhere by NEVR-603 line f) buckets sign-ups by client IP, and the
	// whole suite shares one socket.
	const ipFor = (email: string) =>
		`198.51.100.${email === "owner-a@scope.test" ? 10 : 11}`;
	const signUp = async (email: string) => {
		const res = await fetch(`${legacySrv.url.origin}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { ...json, "x-forwarded-for": ipFor(email) },
			body: JSON.stringify({
				email,
				password: "ScopeDenial-12345!",
				name: email.split("@")[0],
			}),
		});
		expect(res.status).toBe(200);
		return cookieOf(res);
	};

	const createOrg = async (cookie: string, name: string, slug: string) => {
		const res = await fetch(
			`${legacySrv.url.origin}/api/auth/organization/create`,
			{
				method: "POST",
				headers: { ...json, cookie },
				body: JSON.stringify({ name, slug }),
			},
		);
		expect(res.status).toBe(200);
		return ((await res.json()) as { id: string }).id;
	};

	// Victim org A, owned by an instance admin (org creation is admin-gated
	// in this tree); everything probed lives in org A.
	await signUp("owner-a@scope.test");
	await db.sql`UPDATE "user" SET role='admin' WHERE email='owner-a@scope.test'`;
	// Session cookies cache the role: sign in again after promotion.
	const signIn = await fetch(`${legacySrv.url.origin}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { ...json, "x-forwarded-for": ipFor("owner-a@scope.test") },
		body: JSON.stringify({
			email: "owner-a@scope.test",
			password: "ScopeDenial-12345!",
		}),
	});
	expect(signIn.status).toBe(200);
	adminCookie = cookieOf(signIn);
	orgA = await createOrg(adminCookie, "Org Alpha", "org-alpha");
	const board = await fetch(`${base}/api/board`, {
		method: "POST",
		headers: { ...json, cookie: adminCookie },
		body: JSON.stringify({
			name: "Alpha Board",
			organizationId: orgA,
			icon: "Layout",
			slug: "alpha-board",
		}),
	});
	expect(board.status).toBe(200);
	boardId = ((await board.json()) as { id: string }).id;

	// Nested rows in org A, seeded straight into PG (the routes under test are
	// the readers): a column, an org label, and a task on the board.
	await db.sql`INSERT INTO "column"(id, board_id, name, slug, position)
		VALUES ('col-alpha', ${boardId}, 'To do', 'to-do', 0)`;
	await db.sql`INSERT INTO label(id, name, color, organization_id)
		VALUES ('label-alpha', 'bug', '#ff0000', ${orgA})`;
	await db.sql`INSERT INTO task(id, board_id, title, position, number)
		VALUES ('task-alpha', ${boardId}, 'Investigate', 0, 1)`;
	labelId = "label-alpha";
	taskId = "task-alpha";

	// The attacker: a legitimate principal whose only membership is org B —
	// never a member of org A, holding a valid session. Org B is created by
	// the admin (creation is admin-gated); the membership row is seeded the
	// same way kaneo-parity seeds its member.
	foreignCookie = await signUp("owner-b@scope.test");
	const orgB = await createOrg(adminCookie, "Org Beta", "org-beta");
	const [foreign] =
		await db.sql`SELECT id FROM "user" WHERE email='owner-b@scope.test'`;
	await db.sql`INSERT INTO organization_member(id, organization_id, user_id, role, joined_at)
		VALUES ('m-scope-b', ${orgB}, ${foreign.id}, 'member', now())`;
}, 120_000);

afterAll(async () => {
	while (resources.length) await resources.pop()?.();
});

/** Every probed (method, path, body?) — denied for the foreign principal,
 * served for org A's owner. One shared shape, no per-route drift. Built
 * lazily: the paths interpolate ids that only exist after beforeAll. */
const probes = (): Array<{
	name: string;
	method: string;
	path: string;
	body?: unknown;
}> => [
	{
		name: "board list, org parent in query",
		method: "GET",
		path: `/api/board?organizationId=${orgA}`,
	},
	{
		name: "board get, board parent in path",
		method: "GET",
		path: `/api/board/${boardId}`,
	},
	{
		name: "board update",
		method: "PUT",
		path: `/api/board/${boardId}`,
		// Schema-valid full payload: the probe must reach the guard, not die
		// in decode (board update requires name/icon/slug/description/isPublic).
		body: {
			name: "Hijacked",
			icon: "Layout",
			slug: "hijacked",
			description: "",
			isPublic: false,
		},
	},
	{ name: "board delete", method: "DELETE", path: `/api/board/${boardId}` },
	{
		name: "board create INTO a foreign org (payload parent)",
		method: "POST",
		path: "/api/board",
		body: {
			name: "Injected",
			organizationId: orgA,
			icon: "Layout",
			slug: "injected",
		},
	},
	{
		name: "column list, board parent in path",
		method: "GET",
		path: `/api/column/${boardId}`,
	},
	{
		name: "label byOrganization, org parent in path",
		method: "GET",
		path: `/api/label/organization/${orgA}`,
	},
	{
		name: "label get, label parent in path",
		method: "GET",
		path: `/api/label/${labelId}`,
	},
	{
		name: "label byTask, task parent in path",
		method: "GET",
		path: `/api/label/task/${taskId}`,
	},
	{
		name: "label assign (label id + task id, both foreign)",
		method: "PUT",
		path: `/api/label/${labelId}/task`,
		body: { taskId },
	},
	{
		name: "label update",
		method: "PUT",
		path: `/api/label/${labelId}`,
		body: { name: "renamed", color: "#00ff00" },
	},
	{ name: "label delete", method: "DELETE", path: `/api/label/${labelId}` },
];

test("S1 every org-A route denies a principal whose only membership is org B", async () => {
	for (const probe of probes()) {
		const res = await fetch(`${base}${probe.path}`, {
			method: probe.method,
			headers: { ...json, cookie: foreignCookie },
			body: probe.body === undefined ? undefined : JSON.stringify(probe.body),
		});
		expect(res.status, `${probe.name}: must be denied, got ${res.status}`).toBe(
			403,
		);
	}
});

test("S2 the same routes serve org A's owner (the 403s are scope denials)", async () => {
	// Destructive probes are skipped for the positive control — S1 already
	// proved them denied; deleting the seed would race the other probes.
	const safe = probes().filter(
		(p) => p.method === "GET" || p.name.startsWith("label assign"),
	);
	for (const probe of safe) {
		const res = await fetch(`${base}${probe.path}`, {
			method: probe.method,
			headers: { ...json, cookie: adminCookie },
			body: probe.body === undefined ? undefined : JSON.stringify(probe.body),
		});
		expect(
			res.status,
			`${probe.name}: owner must be served, got ${res.status}`,
		).toBe(200);
	}
});

test("S3 fail closed: a board list with no org parent is a denial, not a default-org leak", async () => {
	const res = await fetch(`${base}/api/board`, {
		headers: { ...json, cookie: foreignCookie },
	});
	// The list schema requires organizationId, so an absent parent is
	// rejected in decode (400) — either way the caller learns nothing.
	expect([400, 403]).toContain(res.status);
});

test("S4 unknown ids deny without leaking existence (no 5xx, no 200)", async () => {
	for (const path of [
		"/api/board/does-not-exist",
		"/api/column/does-not-exist",
		"/api/label/does-not-exist",
		"/api/label/task/does-not-exist",
	]) {
		const res = await fetch(`${base}${path}`, {
			headers: { ...json, cookie: foreignCookie },
		});
		// 400 = guard cannot resolve the parent (fail closed, no existence
		// leak); the property under test is: never 200, never 5xx.
		expect([400, 403, 404], `${path}`).toContain(res.status);
	}
});

test("S5 user-self: get-session returns only the caller's own identity", async () => {
	const res = await fetch(`${base}/api/auth/get-session`, {
		headers: { ...json, cookie: foreignCookie },
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as { user?: { email?: string } };
	expect(body.user?.email).toBe("owner-b@scope.test");
});
