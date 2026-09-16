import { Effect } from "effect";
import type { Sql } from "postgres";
import {
	type IssueUpsertInput,
	issueUpsertEffect,
	type PullRequestUpsertInput,
	pullRequestUpsertEffect,
	type RepoUpsertInput,
	repoUpsertEffect,
} from "./repository";

// STL-18 T08/T09: transactional import of the repository triple. The whole
// snapshot commits inside one transaction — a malformed mirror (duplicate
// (repo_id,number), missing FK, bad state) aborts repo, issues and PRs
// together (atomicity is proven by the sabotage test). Re-importing the same
// snapshot is idempotent: rows upsert by stable ID and re-runs append no
// duplicate events because only changed rows re-emit (T09).

export type RepositoryImportSnapshot = {
	repo: Omit<RepoUpsertInput, "origin"> & { is_private?: boolean | null };
	issues: Array<{
		id: string;
		number: number;
		title: string;
		state: string;
		url: string;
		body?: string | null;
		external_id?: string | null;
		author_login?: string | null;
		author_avatar_url?: string | null;
		assignee_logins?: unknown;
		labels?: unknown;
		comment_count?: number;
		external_created_at?: string | null;
		external_updated_at?: string | null;
		closed_at?: string | null;
	}>;
	pullRequests: Array<{
		id: string;
		number: number;
		title: string;
		state: string;
		url: string;
		body?: string | null;
		external_id?: string | null;
		is_draft?: boolean | null;
		author_login?: string | null;
		author_avatar_url?: string | null;
		head_branch?: string | null;
		base_branch?: string | null;
		labels?: unknown;
		comment_count?: number;
		additions?: number | null;
		deletions?: number | null;
		changed_files?: number | null;
		external_created_at?: string | null;
		external_updated_at?: string | null;
		merged_at?: string | null;
		closed_at?: string | null;
	}>;
	origin: "live" | "import";
};

const VALID_ISSUE_STATES = new Set(["open", "closed"]);
const VALID_PR_STATES = new Set(["open", "closed", "merged"]);

/** Preflight: reject malformed mirrors before any write (fail fast, no events). */
export function validateSnapshot(snapshot: RepositoryImportSnapshot) {
	if (!snapshot.repo.id || !snapshot.repo.url) throw new Error("Invalid repo");
	if (
		snapshot.repo.provider !== "github" &&
		snapshot.repo.provider !== "gitea" &&
		snapshot.repo.provider !== "gitlab"
	)
		throw new Error("Invalid provider");
	const seenIssues = new Set<string>();
	for (const issue of snapshot.issues) {
		if (!issue.id || !issue.url) throw new Error("Invalid issue identity");
		if (!VALID_ISSUE_STATES.has(issue.state)) throw new Error("Invalid state");
		const key = `${issue.number}`;
		if (seenIssues.has(key)) throw new Error("Duplicate issue number");
		seenIssues.add(key);
	}
	const seenPrs = new Set<string>();
	for (const pr of snapshot.pullRequests) {
		if (!pr.id || !pr.url) throw new Error("Invalid pull request identity");
		if (!VALID_PR_STATES.has(pr.state)) throw new Error("Invalid state");
		const key = `${pr.number}`;
		if (seenPrs.has(key)) throw new Error("Duplicate pull request number");
		seenPrs.add(key);
	}
}

// The importer is a single Effect.fn span; each row upsert joins its span so
// the whole import reports one trace (T11).
export const importRepositoryEffect = Effect.fn("Domain.importRepository")(
	function* (
		sql: Sql,
		org: string,
		actor: string,
		snapshot: RepositoryImportSnapshot,
	) {
		validateSnapshot(snapshot);
		const origin = "import" as const;
		let lastTxid = 0;
		const track = (txid: number) => {
			lastTxid = txid;
			return txid;
		};
		// Compare-first, write-if-changed: unchanged rows produce no event.
		const [existingRepo] = yield* Effect.tryPromise({
			try: () =>
				sql`SELECT provider,owner,name,external_id,url,description,default_branch,is_private,config FROM repo WHERE id=${snapshot.repo.id} AND organization_id=${org}`,
			catch: (cause) => cause,
		});
		const repoChanged =
			!existingRepo ||
			existingRepo.provider !== snapshot.repo.provider ||
			existingRepo.owner !== snapshot.repo.owner ||
			existingRepo.name !== snapshot.repo.name ||
			existingRepo.url !== snapshot.repo.url ||
			(existingRepo.is_private ?? false) !==
				(snapshot.repo.is_private ?? false);
		if (repoChanged) {
			track(
				(yield* repoUpsertEffect(sql, org, actor, {
					...snapshot.repo,
					origin,
				} as RepoUpsertInput)).txid,
			);
		}
		for (const issue of snapshot.issues) {
			const [existing] = yield* Effect.tryPromise({
				try: () =>
					sql`SELECT title,state,comment_count,url FROM repo_issue WHERE id=${issue.id} AND repo_id=${snapshot.repo.id}`,
				catch: (cause) => cause,
			});
			if (
				!existing ||
				existing.title !== issue.title ||
				existing.state !== issue.state ||
				existing.comment_count !== (issue.comment_count ?? 0) ||
				existing.url !== issue.url
			) {
				const input: IssueUpsertInput = {
					id: issue.id,
					repoId: snapshot.repo.id,
					number: issue.number,
					externalId: issue.external_id ?? null,
					title: issue.title,
					body: issue.body ?? null,
					state: issue.state,
					authorLogin: issue.author_login ?? null,
					authorAvatarUrl: issue.author_avatar_url ?? null,
					assigneeLogins: issue.assignee_logins ?? null,
					labels: issue.labels ?? null,
					commentCount: issue.comment_count ?? 0,
					url: issue.url,
					externalCreatedAt: issue.external_created_at ?? null,
					externalUpdatedAt: issue.external_updated_at ?? null,
					closedAt: issue.closed_at ?? null,
					origin,
				};
				track((yield* issueUpsertEffect(sql, org, actor, input)).txid);
			}
		}
		for (const pr of snapshot.pullRequests) {
			const [existing] = yield* Effect.tryPromise({
				try: () =>
					sql`SELECT title,state,comment_count,url,merged_at FROM repo_pull_request WHERE id=${pr.id} AND repo_id=${snapshot.repo.id}`,
				catch: (cause) => cause,
			});
			if (
				!existing ||
				existing.title !== pr.title ||
				existing.state !== pr.state ||
				existing.comment_count !== (pr.comment_count ?? 0) ||
				existing.url !== pr.url ||
				existing.merged_at?.toISOString() !== (pr.merged_at ?? null)
			) {
				const input: PullRequestUpsertInput = {
					id: pr.id,
					repoId: snapshot.repo.id,
					number: pr.number,
					externalId: pr.external_id ?? null,
					title: pr.title,
					body: pr.body ?? null,
					state: pr.state,
					isDraft: pr.is_draft ?? false,
					authorLogin: pr.author_login ?? null,
					authorAvatarUrl: pr.author_avatar_url ?? null,
					headBranch: pr.head_branch ?? null,
					baseBranch: pr.base_branch ?? null,
					labels: pr.labels ?? null,
					commentCount: pr.comment_count ?? 0,
					additions: pr.additions ?? null,
					deletions: pr.deletions ?? null,
					changedFiles: pr.changed_files ?? null,
					url: pr.url,
					externalCreatedAt: pr.external_created_at ?? null,
					externalUpdatedAt: pr.external_updated_at ?? null,
					mergedAt: pr.merged_at ?? null,
					closedAt: pr.closed_at ?? null,
					origin,
				};
				track((yield* pullRequestUpsertEffect(sql, org, actor, input)).txid);
			}
		}
		return { txid: lastTxid };
	},
);

// ---------------------------------------------------------------------------
// Whole-dump import (T08/T09/T10): copies all six tables from a production
// dump restored as schema `kaneo_src` into the Stellarc tables inside ONE
// transaction. A malformed FK, a duplicate (repo_id, number) mirror key or an
// empty token aborts everything — no table-by-table partial commit. Source
// identifiers are preserved verbatim (joined by id; reconciliation #10 joins
// the same way). Rows that already exist byte-identically emit no event, so
// re-importing is idempotent (T09).
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

type DumpRow = Record<string, unknown>;

// Destination column allowlists (0003_repository.sql order). Identifiers are
// compile-time constants — never user input — so identifier quoting is safe.
const REPO_COLUMNS = [
	"id",
	"organization_id",
	"provider",
	"owner",
	"name",
	"external_id",
	"url",
	"description",
	"default_branch",
	"is_private",
	"config",
	"is_active",
	"org_privilege",
	"last_synced_at",
	"created_at",
	"updated_at",
] as const;
const ISSUE_COLUMNS = [
	"id",
	"repo_id",
	"number",
	"external_id",
	"title",
	"body",
	"state",
	"author_login",
	"author_avatar_url",
	"assignee_logins",
	"labels",
	"comment_count",
	"url",
	"external_created_at",
	"external_updated_at",
	"closed_at",
	"created_at",
	"updated_at",
] as const;
const PULL_COLUMNS = [
	"id",
	"repo_id",
	"number",
	"external_id",
	"title",
	"body",
	"state",
	"is_draft",
	"author_login",
	"author_avatar_url",
	"head_branch",
	"base_branch",
	"labels",
	"comment_count",
	"additions",
	"deletions",
	"changed_files",
	"url",
	"external_created_at",
	"external_updated_at",
	"merged_at",
	"closed_at",
	"created_at",
	"updated_at",
] as const;
const INSTALLATION_COLUMNS = [
	"id",
	"organization_id",
	"installation_id",
	"account_id",
	"account_login",
	"account_type",
	"account_avatar_url",
	"repository_selection",
	"permissions",
	"created_at",
	"updated_at",
] as const;
const GRANT_COLUMNS = [
	"id",
	"user_id",
	"provider_id",
	"github_user_id",
	"github_login",
	"access_token",
	"refresh_token",
	"access_token_expires_at",
	"refresh_token_expires_at",
	"scope",
	"created_at",
	"updated_at",
] as const;
const INTEGRATION_COLUMNS = [
	"id",
	"board_id",
	"type",
	"config",
	"is_active",
	"created_at",
	"updated_at",
] as const;

function rowDigest(row: DumpRow): string {
	return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

/** Compare-first: ids and digests of the current destination rows. */
async function existingDigests(
	tx: Parameters<Parameters<Sql["begin"]>[1]>[0],
	table: string,
): Promise<Map<string, string>> {
	const rows = (await tx.unsafe(
		`SELECT * FROM "${table}"`,
	)) as unknown as DumpRow[];
	return new Map(rows.map((row) => [String(row.id), rowDigest(row)]));
}

export const importRepositoryDumpEffect = Effect.fn(
	"Domain.importRepositoryDump",
)(function* (sql: Sql, actor: string) {
	return yield* Effect.tryPromise({
		try: () =>
			sql.begin(async (tx) => {
				// --- preflight reads (source is never written) ---
				const repos =
					(await tx`SELECT * FROM kaneo_src.repo ORDER BY id`) as unknown as DumpRow[];
				const issues =
					(await tx`SELECT * FROM kaneo_src.repo_issue ORDER BY id`) as unknown as DumpRow[];
				const pulls =
					(await tx`SELECT * FROM kaneo_src.repo_pull_request ORDER BY id`) as unknown as DumpRow[];
				const installations =
					(await tx`SELECT * FROM kaneo_src.organization_github_installation ORDER BY id`) as unknown as DumpRow[];
				const grants =
					(await tx`SELECT * FROM kaneo_src.github_user_grant ORDER BY id`) as unknown as DumpRow[];
				const integrations =
					(await tx`SELECT * FROM kaneo_src.integration ORDER BY id`) as unknown as DumpRow[];

				// --- validation (fail fast, nothing written) ---
				const issueNumbers = new Set<string>();
				for (const issue of issues) {
					const key = `${issue.repo_id}:${issue.number}`;
					if (issueNumbers.has(key)) throw new Error("Duplicate issue number");
					issueNumbers.add(key);
				}
				const pullNumbers = new Set<string>();
				for (const pull of pulls) {
					const key = `${pull.repo_id}:${pull.number}`;
					if (pullNumbers.has(key))
						throw new Error("Duplicate pull request number");
					pullNumbers.add(key);
				}
				for (const grant of grants)
					if (!grant.access_token) throw new Error("Invalid grant token");

				// --- compare-first digests of destination rows ---
				const digestsOf = async (table: string) => {
					const rows = (await tx.unsafe(
						`SELECT * FROM "${table}"`,
					)) as unknown as DumpRow[];
					return new Map(rows.map((row) => [String(row.id), rowDigest(row)]));
				};
				const prior: Record<string, Map<string, string>> = {
					repo: await digestsOf("repo"),
					repo_issue: await digestsOf("repo_issue"),
					repo_pull_request: await digestsOf("repo_pull_request"),
					organization_github_installation: await digestsOf(
						"organization_github_installation",
					),
					github_user_grant: await digestsOf("github_user_grant"),
					integration: await digestsOf("integration"),
				};

				type Planned = {
					org: string;
					type: string;
					payload: Record<string, unknown>;
				};
				const planned: Planned[] = [];

				// Parameterized upsert: identifiers are a fixed allowlist (never
				// user input); values bind as parameters; row bytes preserved.
				const upsert = async (
					table: string,
					row: DumpRow,
					columns: readonly string[],
				) => {
					const values = columns.map((column) => row[column]);
					const updateSet = columns
						.filter(
							(column) =>
								column !== "id" &&
								column !== "created_at" &&
								column !== "updated_at",
						)
						.map((column) => `"${column}"=EXCLUDED."${column}"`)
						.join(", ");
					await tx.unsafe(
						`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")})
							 VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})
							 ON CONFLICT (id) DO UPDATE SET ${updateSet ? `${updateSet}, ` : ""}"updated_at"=now()`,
						values as never[],
					);
				};

				// --- destination writes in dependency order ---
				for (const repo of repos) {
					await upsert("repo", repo, REPO_COLUMNS);
					if (prior.repo.get(String(repo.id)) !== rowDigest(repo))
						planned.push({
							org: String(repo.organization_id),
							type: "repository:repo-upserted",
							payload: { id: repo.id, row: repo, origin: "import" },
						});
				}
				for (const issue of issues) {
					await upsert("repo_issue", issue, ISSUE_COLUMNS);
					const repoRow = repos.find((r) => r.id === issue.repo_id);
					if (
						repoRow &&
						prior.repo_issue.get(String(issue.id)) !== rowDigest(issue)
					)
						planned.push({
							org: String(repoRow.organization_id),
							type: "repository:issue-upserted",
							payload: { id: issue.id, row: issue, origin: "import" },
						});
				}
				for (const pull of pulls) {
					await upsert("repo_pull_request", pull, PULL_COLUMNS);
					const repoRow = repos.find((r) => r.id === pull.repo_id);
					if (
						repoRow &&
						prior.repo_pull_request.get(String(pull.id)) !== rowDigest(pull)
					)
						planned.push({
							org: String(repoRow.organization_id),
							type: "repository:pull-request-upserted",
							payload: { id: pull.id, row: pull, origin: "import" },
						});
				}
				for (const installation of installations) {
					await upsert(
						"organization_github_installation",
						installation,
						INSTALLATION_COLUMNS,
					);
					if (
						prior.organization_github_installation.get(
							String(installation.id),
						) !== rowDigest(installation)
					)
						planned.push({
							org: String(installation.organization_id),
							type: "repository:installation-upserted",
							payload: {
								id: installation.id,
								row: installation,
								origin: "import",
							},
						});
				}
				// Board→org resolution comes from the dump itself; integrations
				// are board-owned so their events land in the owning org.
				const boards =
					(await tx`SELECT id, organization_id FROM kaneo_src.board`) as unknown as Array<{
						id: string;
						organization_id: string;
					}>;
				const boardOrg = new Map(boards.map((b) => [b.id, b.organization_id]));
				for (const grant of grants) {
					// Grants are user-scoped (§4: no grant shape/collection): import
					// writes the row verbatim but appends no org event, matching the
					// domain service's self-only HTTP surface.
					await upsert("github_user_grant", grant, GRANT_COLUMNS);
				}
				for (const integration of integrations) {
					await upsert("integration", integration, INTEGRATION_COLUMNS);
					const org = boardOrg.get(String(integration.board_id));
					if (
						org &&
						prior.integration.get(String(integration.id)) !==
							rowDigest(integration)
					) {
						// Safe metadata only: config never enters the event log.
						const { config: _c, ...safe } = integration;
						planned.push({
							org,
							type: "repository:integration-upserted",
							payload: { id: integration.id, row: safe, origin: "import" },
						});
					}
				}

				// --- events: one txid, per-org contiguous seq ranges ---
				const orgs = new Set(planned.map((event) => event.org));
				for (const org of orgs) {
					await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
				}
				const [transaction] =
					await tx`SELECT pg_current_xact_id()::text AS txid`;
				const byOrg = new Map<string, Planned[]>();
				for (const event of planned) {
					const list = byOrg.get(event.org) ?? [];
					list.push(event);
					byOrg.set(event.org, list);
				}
				for (const [org, events] of byOrg) {
					const [counter] =
						await tx`UPDATE org_event_counter SET seq=seq+${events.length}
							WHERE org=${org} RETURNING seq::text`;
					let seq = BigInt(counter.seq) - BigInt(events.length);
					for (const event of events) {
						seq += 1n;
						await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
								VALUES (${org},${seq.toString()},${event.type},${actor},${tx.json(event.payload as never)},1,${transaction.txid})`;
					}
				}
				return { txid: Number(BigInt(transaction.txid)) };
			}),
		catch: (cause) => cause as Error,
	});
});
