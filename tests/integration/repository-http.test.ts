import type { Sql } from "postgres";
import { afterEach, beforeEach, expect, test } from "vitest";
import { disposablePostgres } from "../helpers/postgres";

// STL-18 T02/T05/T06 at the HTTP boundary: the §3 repository routes served by
// apps/stellarc-api/src/repository-http.ts, with the common error union,
// Mutation<T> envelopes, foreign-org 404s and self-only grants.

let sql: Sql;
let close: () => Promise<void>;
let server: { url: string; close: () => Promise<void> };
const ORG = "org-http-1";
const OTHER = "org-http-2";
const USER = "user-http-1";

async function seed() {
	for (const [id, name] of [
		[ORG, "HTTP Org"],
		[OTHER, "Other Org"],
	] as const) {
		await sql`INSERT INTO organization (id, name, slug, created_at)
      VALUES (${id}, ${name}, ${id}, now())`;
	}
	await sql`INSERT INTO "user" (id, name, email, created_at, updated_at)
    VALUES (${USER}, 'HTTP User', 'http@example.test', now(), now())`;
}

const authed = (org: string, user = USER): RequestInit => ({
	headers: { authorization: `Bearer ${org} ${user}` },
});

beforeEach(async () => {
	const db = await disposablePostgres();
	sql = db.sql;
	close = db.close;
	const { migrate } = await import("../../packages/db/src/migrate");
	await migrate(sql);
	await seed();
	const { startRepositoryTestServer } = await import(
		"../helpers/repository-http-server"
	);
	server = await startRepositoryTestServer(sql);
});

afterEach(async () => {
	await server.close();
	await close();
});

test("T02 POST /repos returns Mutation<RepoPublic>", async () => {
	const response = await fetch(`${server.url}/api/identity/orgs/${ORG}/repos`, {
		method: "POST",
		headers: { "content-type": "application/json", ...authed(ORG).headers },
		body: JSON.stringify({
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
		}),
	});
	expect(response.status).toBe(200);
	const body = (await response.json()) as {
		data: Record<string, unknown>;
		txid: number;
	};
	expect(body.txid).toBeGreaterThan(0);
	expect(body.data.id).toBeTruthy();
	expect(JSON.stringify(body)).not.toMatch(/token|secret/i);
});

test("T02 list repos is org-scoped and honours ?active=", async () => {
	const create = (name: string, active: boolean) =>
		fetch(`${server.url}/api/identity/orgs/${ORG}/repos`, {
			method: "POST",
			headers: { "content-type": "application/json", ...authed(ORG).headers },
			body: JSON.stringify({
				provider: "github",
				owner: "foundation",
				name,
				url: `https://example.test/foundation/${name}`,
				isActive: active,
			}),
		});
	await create("probe", true);
	await create("archive", false);
	await fetch(`${server.url}/api/identity/orgs/${OTHER}/repos`, {
		method: "POST",
		headers: { "content-type": "application/json", ...authed(OTHER).headers },
		body: JSON.stringify({
			provider: "github",
			owner: "other",
			name: "foreign",
			url: "https://example.test/other/foreign",
		}),
	});

	const all = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos`,
		authed(ORG),
	);
	expect(all.status).toBe(200);
	const allBody = (await all.json()) as { repos: Array<{ name: string }> };
	expect(allBody.repos.map((r) => r.name).sort()).toEqual(["archive", "probe"]);

	const active = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos?active=true`,
		authed(ORG),
	);
	const activeBody = (await active.json()) as {
		repos: Array<{ name: string }>;
	};
	expect(activeBody.repos.map((r) => r.name)).toEqual(["probe"]);
});

test("T02 PATCH updates mutable metadata and DELETE returns Mutation<{id}>", async () => {
	const created = await fetch(`${server.url}/api/identity/orgs/${ORG}/repos`, {
		method: "POST",
		headers: { "content-type": "application/json", ...authed(ORG).headers },
		body: JSON.stringify({
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
		}),
	});
	const { data } = (await created.json()) as { data: { id: string } };
	const patch = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos/${data.id}`,
		{
			method: "PATCH",
			headers: { "content-type": "application/json", ...authed(ORG).headers },
			body: JSON.stringify({ description: "updated" }),
		},
	);
	expect(patch.status).toBe(200);
	const patched = (await patch.json()) as { data: { description: string } };
	expect(patched.data.description).toBe("updated");

	const del = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos/${data.id}`,
		{ method: "DELETE", ...authed(ORG) },
	);
	expect(del.status).toBe(200);
	const deleted = (await del.json()) as { data: { id: string }; txid: number };
	expect(deleted.data.id).toBe(data.id);
	expect(deleted.txid).toBeGreaterThan(0);

	const gone = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos/${data.id}`,
		{ method: "DELETE", ...authed(ORG) },
	);
	expect(gone.status).toBe(404);
});

test("T02 foreign-org repo id returns 404 (never 403)", async () => {
	const created = await fetch(
		`${server.url}/api/identity/orgs/${OTHER}/repos`,
		{
			method: "POST",
			headers: { "content-type": "application/json", ...authed(OTHER).headers },
			body: JSON.stringify({
				provider: "github",
				owner: "other",
				name: "foreign",
				url: "https://example.test/other/foreign",
			}),
		},
	);
	const { data } = (await created.json()) as { data: { id: string } };
	const response = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos/${data.id}`,
		{ method: "DELETE", ...authed(ORG) },
	);
	expect(response.status).toBe(404);
});

test("T03 issues and pulls read imported rows with cursor pagination", async () => {
	const { issueUpsertEffect, pullRequestUpsertEffect, repoUpsertEffect } =
		await import("../../packages/domain/src/repository");
	const { Effect } = await import("effect");
	await Effect.runPromise(
		repoUpsertEffect(sql, ORG, USER, {
			id: "repo-http-1",
			provider: "github",
			owner: "foundation",
			name: "probe",
			url: "https://example.test/foundation/probe",
			origin: "import",
		}),
	);
	for (const [id, number_, title] of [
		["i1", 1, "Alpha"],
		["i2", 2, "Beta"],
		["i3", 3, "Gamma"],
	] as const) {
		await Effect.runPromise(
			issueUpsertEffect(sql, ORG, USER, {
				id,
				repoId: "repo-http-1",
				number: number_,
				title,
				state: "open",
				url: `https://example.test/i/${number_}`,
				origin: "import",
			}),
		);
	}
	await Effect.runPromise(
		pullRequestUpsertEffect(sql, ORG, USER, {
			id: "p1",
			repoId: "repo-http-1",
			number: 7,
			title: "Merged PR",
			state: "merged",
			url: "https://example.test/p/7",
			origin: "import",
			mergedAt: "2026-01-04T10:00:00Z",
		}),
	);

	const issues = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos/repo-http-1/issues?limit=2`,
		authed(ORG),
	);
	expect(issues.status).toBe(200);
	const page1 = (await issues.json()) as {
		items: Array<{ number: number }>;
		nextCursor: string | null;
	};
	expect(page1.items).toHaveLength(2);
	expect(page1.nextCursor).toBeTruthy();
	const page2 = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos/repo-http-1/issues?limit=2&cursor=${page1.nextCursor}`,
		authed(ORG),
	);
	const page2Body = (await page2.json()) as {
		items: Array<{ number: number }>;
		nextCursor: string | null;
	};
	expect(page2Body.items).toHaveLength(1);
	expect(page2Body.nextCursor).toBeNull();
	const numbers = [...page1.items, ...page2Body.items].map((i) => i.number);
	expect(new Set(numbers).size).toBe(3);

	const pulls = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos/repo-http-1/pulls`,
		authed(ORG),
	);
	const pullsBody = (await pulls.json()) as {
		items: Array<{ state: string; mergedAt: string | null }>;
	};
	expect(pullsBody.items).toHaveLength(1);
	expect(pullsBody.items[0].state).toBe("merged");
	expect(pullsBody.items[0].mergedAt).toBeTruthy();
});

test("T05 foreign repo in issues path yields empty, not foreign rows", async () => {
	const issues = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/repos/repo-foreign/issues`,
		authed(ORG),
	);
	expect([404, 200]).toContain(issues.status);
	if (issues.status === 200) {
		const body = (await issues.json()) as { items: unknown[] };
		expect(body.items).toEqual([]);
	}
});

test("T06 grants are self-only and never expose tokens", async () => {
	const { grantUpsertEffect } = await import(
		"../../packages/domain/src/repository"
	);
	const { Effect } = await import("effect");
	await Effect.runPromise(
		grantUpsertEffect(sql, ORG, USER, {
			id: "grant-http-1",
			userId: USER,
			providerId: "github",
			githubUserId: "7001",
			githubLogin: "http-fixture",
			accessToken: "gho_http_secret_token",
			origin: "live",
		}),
	);
	const mine = await fetch(
		`${server.url}/api/identity/github/grants`,
		authed(ORG),
	);
	expect(mine.status).toBe(200);
	const body = (await mine.json()) as { grants: Record<string, unknown>[] };
	expect(body.grants).toHaveLength(1);
	expect(JSON.stringify(body)).not.toContain("gho_http_secret_token");
	expect(body.grants[0]).not.toHaveProperty("accessToken");
	expect(body.grants[0]).not.toHaveProperty("refreshToken");

	const del = await fetch(
		`${server.url}/api/identity/github/grants/grant-http-1`,
		{
			method: "DELETE",
			...authed(ORG, "user-http-other"),
		},
	);
	expect(del.status).toBe(404);
});

test("T05 installations: create, list, delete with same-org ownership", async () => {
	const created = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/github/installations`,
		{
			method: "POST",
			headers: { "content-type": "application/json", ...authed(ORG).headers },
			body: JSON.stringify({
				installationId: 1001,
				accountId: 2001,
				accountLogin: "foundation",
				accountType: "Organization",
			}),
		},
	);
	expect(created.status).toBe(200);
	const { data } = (await created.json()) as { data: { id: string } };
	expect(data.id).toBeTruthy();

	const list = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/github/installations`,
		authed(ORG),
	);
	const listBody = (await list.json()) as {
		installations: Array<{ installationId: number }>;
	};
	expect(listBody.installations.map((i) => i.installationId)).toEqual([1001]);

	const del = await fetch(
		`${server.url}/api/identity/orgs/${OTHER}/github/installations/${data.id}`,
		{ method: "DELETE", ...authed(OTHER) },
	);
	expect(del.status).toBe(404);
});

test("PUT integration upserts by (boardId,type) and DELETE removes", async () => {
	const put = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/integrations`,
		{
			method: "PUT",
			headers: { "content-type": "application/json", ...authed(ORG).headers },
			body: JSON.stringify({
				boardId: "board-http-1",
				type: "github",
				config: '{"installationId":1001}',
				isActive: true,
			}),
		},
	);
	expect(put.status).toBe(200);
	const first = (await put.json()) as { data: { id: string } };
	expect(first.data.id).toBeTruthy();

	const putAgain = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/integrations`,
		{
			method: "PUT",
			headers: { "content-type": "application/json", ...authed(ORG).headers },
			body: JSON.stringify({
				boardId: "board-http-1",
				type: "github",
				config: '{"installationId":1001}',
				isActive: false,
			}),
		},
	);
	const second = (await putAgain.json()) as {
		data: { id: string; isActive: boolean };
	};
	expect(second.data.id).toBe(first.data.id);
	expect(second.data.isActive).toBe(false);

	const list = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/integrations`,
		authed(ORG),
	);
	const listBody = (await list.json()) as { integrations: unknown[] };
	expect(listBody.integrations).toHaveLength(1);

	const del = await fetch(
		`${server.url}/api/identity/orgs/${ORG}/integrations/${first.data.id}`,
		{ method: "DELETE", ...authed(ORG) },
	);
	expect(del.status).toBe(200);
});
