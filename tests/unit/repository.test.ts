import { describe, expect, test } from "vitest";

// STL-18 unit battery: event payloads/upcasters, provider state mapping (T04),
// public DTO secret isolation (T06 surface) and token encryption.

const GITHUB_ISSUE = {
	id: 4001,
	node_id: "MDU6SXNzdWU0MDAx",
	number: 7,
	title: "Gateway timeouts on /v1/shape",
	body: "Long-poll requests drop after the idle window.",
	state: "open",
	user: { login: "ada-fixture", avatar_url: "https://avatars.test/ada" },
	assignees: [{ login: "lin-fixture" }],
	labels: [{ name: "sync", color: "2563eb" }],
	comments: 2,
	html_url: "https://example.test/foundation/probe/issues/7",
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-02T00:00:00Z",
	closed_at: null,
	closed_by: undefined,
};

const GITHUB_PR = {
	id: 5001,
	node_id: "MDExOlB1bGxSZXF1ZXN0NTAwMQ",
	number: 9,
	title: "Preserve bigint cursors across reconnects",
	body: "Encodes cursors as decimal strings end to end.",
	state: "closed",
	merged: true,
	draft: false,
	user: { login: "lin-fixture", avatar_url: null },
	labels: [{ name: "sync", color: "2563eb" }],
	comments: 1,
	commits: 3,
	additions: 42,
	deletions: 7,
	changed_files: 2,
	html_url: "https://example.test/foundation/probe/pulls/9",
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-03T00:00:00Z",
	merged_at: "2026-01-03T12:00:00Z",
	closed_at: "2026-01-03T12:00:00Z",
	head: { ref: "fix/bigint-cursors" },
	base: { ref: "main" },
};

describe("T04 github provider state mapping", () => {
	test("issue mapping preserves provider state, labels and nullable timestamps", async () => {
		const { normalizeIssue } = await import(
			"../../packages/domain/src/github-provider"
		);
		const row = normalizeIssue(GITHUB_ISSUE, {
			id: "repo-1",
			organization_id: "org-1",
		});
		expect(row).toMatchObject({
			repo_id: "repo-1",
			number: 7,
			external_id: "4001",
			title: "Gateway timeouts on /v1/shape",
			state: "open",
			author_login: "ada-fixture",
			assignee_logins: ["lin-fixture"],
			labels: [{ name: "sync", color: "2563eb" }],
			comment_count: 2,
			closed_at: null,
		});
		expect(row.external_created_at).toBe("2026-01-01T00:00:00.000Z");
		expect(row.external_updated_at).toBe("2026-01-02T00:00:00.000Z");
	});

	test("closed issue keeps closed state and closed_at", async () => {
		const { normalizeIssue } = await import(
			"../../packages/domain/src/github-provider"
		);
		const row = normalizeIssue(
			{ ...GITHUB_ISSUE, state: "closed", closed_at: "2026-02-01T00:00:00Z" },
			{ id: "repo-1", organization_id: "org-1" },
		);
		expect(row.state).toBe("closed");
		expect(row.closed_at).toBe("2026-02-01T00:00:00.000Z");
	});

	test("merged pull request maps to merged state and preserves draft", async () => {
		const { normalizePullRequest } = await import(
			"../../packages/domain/src/github-provider"
		);
		const row = normalizePullRequest(GITHUB_PR, {
			id: "repo-1",
			organization_id: "org-1",
		});
		expect(row.state).toBe("merged");
		expect(row.merged_at).toBe("2026-01-03T12:00:00.000Z");
		expect(row.is_draft).toBe(false);
		expect(row.head_branch).toBe("fix/bigint-cursors");
		expect(row.base_branch).toBe("main");
		expect(row.additions).toBe(42);
		expect(row.changed_files).toBe(2);
		const openDraft = normalizePullRequest(
			{
				...GITHUB_PR,
				state: "open",
				merged: false,
				merged_at: null,
				draft: true,
			},
			{ id: "repo-1", organization_id: "org-1" },
		);
		expect(openDraft.state).toBe("open");
		expect(openDraft.is_draft).toBe(true);
		expect(openDraft.merged_at).toBeNull();
	});
});

describe("repository event payloads and upcasters", () => {
	test("registry supports the twelve repository event types", async () => {
		const { RepositoryUpcasterRegistry } = await import(
			"../../packages/domain/src/repository-events"
		);
		const registry = new RepositoryUpcasterRegistry();
		for (const kind of [
			"repo",
			"issue",
			"pull-request",
			"installation",
			"github-grant",
			"integration",
		]) {
			expect(registry.supports(`repository:${kind}-upserted`)).toBe(true);
			expect(registry.supports(`repository:${kind}-deleted`)).toBe(true);
		}
		expect(registry.supports("foundation:probe-upserted")).toBe(false);
	});

	test("decode validates upsert and delete payloads at schema_version 1", async () => {
		const { RepositoryUpcasterRegistry } = await import(
			"../../packages/domain/src/repository-events"
		);
		const registry = new RepositoryUpcasterRegistry();
		const upsert = registry.decode("repository:repo-upserted", 1, {
			id: "repo-1",
			row: { id: "repo-1", provider: "github" },
			origin: "import",
		});
		expect(upsert).toEqual({
			id: "repo-1",
			row: { id: "repo-1", provider: "github" },
			origin: "import",
		});
		const del = registry.decode("repository:issue-deleted", 1, {
			id: "issue-1",
			repoId: "repo-1",
		});
		expect(del).toEqual({ id: "issue-1", repoId: "repo-1" });
		expect(() =>
			registry.decode("repository:repo-upserted", 2, { id: "x", row: {} }),
		).toThrow();
		expect(() =>
			registry.decode("repository:repo-upserted", 1, { id: "x" }),
		).toThrow();
		expect(() =>
			registry.decode("repository:github-grant-upserted", 1, {
				id: "g1",
				row: { access_token: "secret" },
			}),
		).toThrow();
	});
});

describe("T06 grant secret isolation", () => {
	test("public grant DTO schema rejects token fields and omits secrets", async () => {
		const { GrantPublic } = await import(
			"../../packages/contracts/src/repository"
		);
		const { Schema } = await import("effect");
		const decode = Schema.decodeUnknownSync(GrantPublic, {
			onExcessProperty: "error",
		});
		const safe = decode({
			id: "grant-1",
			userId: "user-1",
			providerId: "github",
			githubUserId: "1001",
			githubLogin: "ada",
			accessTokenExpiresAt: null,
			refreshTokenExpiresAt: null,
			scope: "repo",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		expect(safe).not.toHaveProperty("accessToken");
		expect(() =>
			decode({ ...safe, access_token: "gho_supersecret" }),
		).toThrow();
	});

	// A3: secrets are stored as imported (plaintext parity with the fork);
	// encryption is deferred to its own follow-up slice. The grant store
	// helper must therefore pass tokens through unchanged and expose only a
	// fingerprint for telemetry.
	test("A3 grant tokens are stored as imported; only fingerprinted for telemetry", async () => {
		const { fingerprintToken, storeGrantToken } = await import(
			"../../packages/domain/src/github-provider"
		);
		expect(storeGrantToken("gho_live_token_value")).toBe(
			"gho_live_token_value",
		);
		const print = fingerprintToken("gho_live_token_value");
		expect(print).not.toContain("gho_live");
		expect(print).toMatch(/^[0-9a-f]{12}$/);
	});
});
