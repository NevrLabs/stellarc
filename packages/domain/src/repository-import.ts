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
