import { Effect, Metric, Runtime, Schema } from "effect";
import type { Sql } from "postgres";
import { assertNoSecrets } from "./repository-events";

// STL-18 §2: every service is an Effect.fn; mutations are transactional with
// org-scoped sequence reservations and one txid per commit (T0 pattern, see
// packages/domain/src/index.ts). Events carry public rows only — secrets are
// stripped before append (T06), and the same-org predicate is enforced in SQL
// (T05), not in application filters that a sabotage could bypass.

const Id = Schema.NonEmptyString.pipe(Schema.maxLength(128));

export type RepositoryEventRow = Record<string, unknown>;

type Append = (
	write: () => PromiseLike<unknown>,
	type: string,
	seq: string,
	txid: number,
) => Promise<void>;

/** Shared transactional append: counter bump, event inserts, row writes. */
async function runTransaction(
	sql: Sql,
	org: string,
	actor: string,
	events: Array<{ type: string; payload: RepositoryEventRow }>,
	apply: (tx: Parameters<Parameters<Sql["begin"]>[1]>[0]) => Promise<void>,
) {
	if (!org || !actor) throw new Error("Invalid principal");
	for (const event of events) {
		Schema.decodeUnknownSync(Id)(event.payload.id);
		assertNoSecrets((event.payload.row ?? {}) as Record<string, unknown>);
	}
	return sql.begin(async (tx) => {
		await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
		const [counter] =
			await tx`UPDATE org_event_counter SET seq=seq+${events.length} WHERE org=${org} RETURNING seq::text`;
		const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
		const txid = Number(BigInt(transaction.txid));
		let seq = BigInt(counter.seq) - BigInt(events.length);
		for (const event of events) {
			seq += 1n;
			await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
        VALUES (${org},${seq.toString()},${event.type},${actor},${tx.json(event.payload as never)},1,${transaction.txid})`;
		}
		await apply(tx);
		return { txid };
	});
}

// Effect-native wrapper that joins the caller's telemetry runtime so append
// spans export inside the inbound request trace (T0 accounting pattern).
function withRuntime<A>(
	body: (append: Append) => Promise<A>,
	counterType: string | null,
) {
	return Effect.gen(function* () {
		const runtime = yield* Effect.runtime<never>();
		const result = yield* Effect.tryPromise({
			try: () =>
				body((write, type, seq, txid) =>
					Promise.resolve(
						Runtime.runPromise(runtime)(
							appendEventEffect(write, type, seq, txid),
						),
					),
				),
			catch: (cause) => cause,
		});
		if (counterType)
			yield* Metric.increment(
				Metric.counter("stellarc_events_appended_total"),
			).pipe(Effect.tagMetrics("type", counterType));
		return result;
	});
}

const appendEventEffect = Effect.fn("stellarc.event.append")(function* (
	write: () => PromiseLike<unknown>,
	type: string,
	seq: string,
	txid: number,
) {
	yield* Effect.annotateCurrentSpan({
		"stellarc.event.type": type,
		"stellarc.event.seq": seq,
		"stellarc.event.txid": txid,
	});
	yield* Effect.tryPromise({
		try: () => Promise.resolve(write()),
		catch: (cause) => cause,
	});
});

// ---------------------------------------------------------------------------
// repo
// ---------------------------------------------------------------------------

export type RepoUpsertInput = {
	id: string;
	provider: string;
	owner: string;
	name: string;
	url: string;
	externalId?: string | null;
	description?: string | null;
	defaultBranch?: string | null;
	isPrivate?: boolean | null;
	config?: unknown;
	isActive?: boolean | null;
	orgPrivilege?: string | null;
	origin: "live" | "import";
};

const REPO_COLUMN_LIST = [
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
];

export const repoUpsertEffect = Effect.fn("Domain.repoUpsert")(function* (
	sql: Sql,
	org: string,
	actor: string,
	input: RepoUpsertInput,
) {
	return yield* withRuntime(async () => {
		const row = {
			id: input.id,
			organization_id: org,
			provider: input.provider,
			owner: input.owner,
			name: input.name,
			external_id: input.externalId ?? null,
			url: input.url,
			description: input.description ?? null,
			default_branch: input.defaultBranch ?? null,
			is_private: input.isPrivate ?? false,
			config: input.config === undefined ? null : input.config,
			is_active: input.isActive ?? true,
			org_privilege: input.orgPrivilege ?? null,
		};
		return runTransaction(
			sql,
			org,
			actor,
			[
				{
					type: "repository:repo-upserted",
					payload: { id: row.id, row, origin: input.origin },
				},
			],
			async (tx) => {
				await tx`INSERT INTO repo (${sql(REPO_COLUMN_LIST)})
          VALUES (${row.id},${row.organization_id},${row.provider},${row.owner},${row.name},${row.external_id},${row.url},${row.description},${row.default_branch},${row.is_private},${tx.json(row.config as never)},${row.is_active},${row.org_privilege})
          ON CONFLICT (id) DO UPDATE SET provider=EXCLUDED.provider,owner=EXCLUDED.owner,name=EXCLUDED.name,
            external_id=EXCLUDED.external_id,url=EXCLUDED.url,description=EXCLUDED.description,
            default_branch=EXCLUDED.default_branch,is_private=EXCLUDED.is_private,config=EXCLUDED.config,
            is_active=EXCLUDED.is_active,org_privilege=EXCLUDED.org_privilege,updated_at=now()`;
			},
		);
	}, "repository:repo-upserted");
});

export const repoDeleteEffect = Effect.fn("Domain.repoDelete")(function* (
	sql: Sql,
	org: string,
	actor: string,
	id: string,
) {
	return yield* withRuntime(async () => {
		Schema.decodeUnknownSync(Id)(id);
		// Cascaded mirror rows must reach clients as their own delete events,
		// otherwise issue/PR shapes keep stale rows after the repo disappears
		// (T07 exact-once deletes).
		const result = await sql.begin(async (tx) => {
			const [repo] =
				await tx`SELECT id FROM repo WHERE id=${id} AND organization_id=${org}`;
			if (!repo) throw new Error("NotFound");
			const issues = await tx`SELECT id FROM repo_issue WHERE repo_id=${id}`;
			const pulls =
				await tx`SELECT id FROM repo_pull_request WHERE repo_id=${id}`;
			await tx`INSERT INTO org_event_counter(org) VALUES (${org}) ON CONFLICT DO NOTHING`;
			const total = 1 + issues.length + pulls.length;
			const [counter] =
				await tx`UPDATE org_event_counter SET seq=seq+${total} WHERE org=${org} RETURNING seq::text`;
			const [transaction] = await tx`SELECT pg_current_xact_id()::text AS txid`;
			const txid = Number(BigInt(transaction.txid));
			let seq = BigInt(counter.seq) - BigInt(total);
			const events: Array<{ type: string; payload: Record<string, unknown> }> =
				[
					...(issues as unknown as Array<{ id: string }>).map((issue) => ({
						type: "repository:issue-deleted",
						payload: { id: issue.id, repoId: id },
					})),
					...(pulls as unknown as Array<{ id: string }>).map((pull) => ({
						type: "repository:pull-request-deleted",
						payload: { id: pull.id, repoId: id },
					})),
					{ type: "repository:repo-deleted", payload: { id } },
				];
			for (const event of events) {
				seq += 1n;
				await tx`INSERT INTO event(org,seq,plugin_type,actor,payload,schema_version,txid)
        VALUES (${org},${seq.toString()},${event.type},${actor},${tx.json(event.payload as never)},1,${transaction.txid})`;
			}
			await tx`DELETE FROM repo WHERE id=${id} AND organization_id=${org}`;
			return { txid };
		});
		return result;
	}, "repository:repo-deleted");
});

// ---------------------------------------------------------------------------
// repo_issue / repo_pull_request (provider sync + import seam; HTTP reads
// these tables, writes flow through the importer and provider adapter)
// ---------------------------------------------------------------------------

export type IssueUpsertInput = {
	id: string;
	repoId: string;
	number: number;
	externalId?: string | null;
	title: string;
	body?: string | null;
	state: string;
	authorLogin?: string | null;
	authorAvatarUrl?: string | null;
	assigneeLogins?: unknown;
	labels?: unknown;
	commentCount?: number;
	url: string;
	externalCreatedAt?: string | null;
	externalUpdatedAt?: string | null;
	closedAt?: string | null;
	origin: "live" | "import";
};

export type PullRequestUpsertInput = IssueUpsertInput & {
	isDraft?: boolean | null;
	headBranch?: string | null;
	baseBranch?: string | null;
	additions?: number | null;
	deletions?: number | null;
	changedFiles?: number | null;
	mergedAt?: string | null;
};

async function assertRepoInOrg(
	tx: Parameters<Parameters<Sql["begin"]>[1]>[0],
	repoId: string,
	org: string,
) {
	const [repo] = await tx`SELECT organization_id FROM repo WHERE id=${repoId}`;
	if (!repo || repo.organization_id !== org)
		throw new Error("InvalidReference");
}

export const issueUpsertEffect = Effect.fn("Domain.issueUpsert")(function* (
	sql: Sql,
	org: string,
	actor: string,
	input: IssueUpsertInput,
) {
	return yield* withRuntime(async () => {
		const row = {
			id: input.id,
			repo_id: input.repoId,
			number: input.number,
			external_id: input.externalId ?? null,
			title: input.title,
			body: input.body ?? null,
			state: input.state,
			author_login: input.authorLogin ?? null,
			author_avatar_url: input.authorAvatarUrl ?? null,
			assignee_logins: input.assigneeLogins ?? null,
			labels: input.labels ?? null,
			comment_count: input.commentCount ?? 0,
			url: input.url,
			external_created_at: input.externalCreatedAt ?? null,
			external_updated_at: input.externalUpdatedAt ?? null,
			closed_at: input.closedAt ?? null,
		};
		return runTransaction(
			sql,
			org,
			actor,
			[
				{
					type: "repository:issue-upserted",
					payload: { id: row.id, row, origin: input.origin },
				},
			],
			async (tx) => {
				await assertRepoInOrg(tx, input.repoId, org);
				await tx`INSERT INTO repo_issue (${sql(Object.keys(row))})
          VALUES (${row.id},${row.repo_id},${row.number},${row.external_id},${row.title},${row.body},${row.state},${row.author_login},${row.author_avatar_url},${tx.json(row.assignee_logins as never)},${tx.json(row.labels as never)},${row.comment_count},${row.url},${row.external_created_at},${row.external_updated_at},${row.closed_at})
          ON CONFLICT (id) DO UPDATE SET number=EXCLUDED.number,external_id=EXCLUDED.external_id,title=EXCLUDED.title,
            body=EXCLUDED.body,state=EXCLUDED.state,author_login=EXCLUDED.author_login,
            author_avatar_url=EXCLUDED.author_avatar_url,assignee_logins=EXCLUDED.assignee_logins,
            labels=EXCLUDED.labels,comment_count=EXCLUDED.comment_count,url=EXCLUDED.url,
            external_created_at=EXCLUDED.external_created_at,external_updated_at=EXCLUDED.external_updated_at,
            closed_at=EXCLUDED.closed_at,updated_at=now()`;
			},
		);
	}, "repository:issue-upserted");
});

export const issueDeleteEffect = Effect.fn("Domain.issueDelete")(function* (
	sql: Sql,
	org: string,
	actor: string,
	repoId: string,
	id: string,
) {
	return yield* withRuntime(async () => {
		Schema.decodeUnknownSync(Id)(id);
		return runTransaction(
			sql,
			org,
			actor,
			[{ type: "repository:issue-deleted", payload: { id, repoId } }],
			async (tx) => {
				await assertRepoInOrg(tx, repoId, org);
				const deleted =
					await tx`DELETE FROM repo_issue WHERE id=${id} AND repo_id=${repoId} RETURNING id`;
				if (deleted.length === 0) throw new Error("NotFound");
			},
		);
	}, "repository:issue-deleted");
});

export const pullRequestUpsertEffect = Effect.fn("Domain.pullRequestUpsert")(
	function* (
		sql: Sql,
		org: string,
		actor: string,
		input: PullRequestUpsertInput,
	) {
		return yield* withRuntime(async () => {
			const row = {
				id: input.id,
				repo_id: input.repoId,
				number: input.number,
				external_id: input.externalId ?? null,
				title: input.title,
				body: input.body ?? null,
				state: input.state,
				is_draft: input.isDraft ?? false,
				author_login: input.authorLogin ?? null,
				author_avatar_url: input.authorAvatarUrl ?? null,
				head_branch: input.headBranch ?? null,
				base_branch: input.baseBranch ?? null,
				labels: input.labels ?? null,
				comment_count: input.commentCount ?? 0,
				additions: input.additions ?? null,
				deletions: input.deletions ?? null,
				changed_files: input.changedFiles ?? null,
				url: input.url,
				external_created_at: input.externalCreatedAt ?? null,
				external_updated_at: input.externalUpdatedAt ?? null,
				merged_at: input.mergedAt ?? null,
				closed_at: input.closedAt ?? null,
			};
			return runTransaction(
				sql,
				org,
				actor,
				[
					{
						type: "repository:pull-request-upserted",
						payload: { id: row.id, row, origin: input.origin },
					},
				],
				async (tx) => {
					await assertRepoInOrg(tx, input.repoId, org);
					await tx`INSERT INTO repo_pull_request (${sql(Object.keys(row))})
          VALUES (${row.id},${row.repo_id},${row.number},${row.external_id},${row.title},${row.body},${row.state},${row.is_draft},${row.author_login},${row.author_avatar_url},${row.head_branch},${row.base_branch},${tx.json(row.labels as never)},${row.comment_count},${row.additions},${row.deletions},${row.changed_files},${row.url},${row.external_created_at},${row.external_updated_at},${row.merged_at},${row.closed_at})
          ON CONFLICT (id) DO UPDATE SET number=EXCLUDED.number,external_id=EXCLUDED.external_id,title=EXCLUDED.title,
            body=EXCLUDED.body,state=EXCLUDED.state,is_draft=EXCLUDED.is_draft,
            author_login=EXCLUDED.author_login,author_avatar_url=EXCLUDED.author_avatar_url,
            head_branch=EXCLUDED.head_branch,base_branch=EXCLUDED.base_branch,labels=EXCLUDED.labels,
            comment_count=EXCLUDED.comment_count,additions=EXCLUDED.additions,deletions=EXCLUDED.deletions,
            changed_files=EXCLUDED.changed_files,url=EXCLUDED.url,
            external_created_at=EXCLUDED.external_created_at,external_updated_at=EXCLUDED.external_updated_at,
            merged_at=EXCLUDED.merged_at,closed_at=EXCLUDED.closed_at,updated_at=now()`;
				},
			);
		}, "repository:pull-request-upserted");
	},
);

export const pullRequestDeleteEffect = Effect.fn("Domain.pullRequestDelete")(
	function* (sql: Sql, org: string, actor: string, repoId: string, id: string) {
		return yield* withRuntime(async () => {
			Schema.decodeUnknownSync(Id)(id);
			return runTransaction(
				sql,
				org,
				actor,
				[{ type: "repository:pull-request-deleted", payload: { id, repoId } }],
				async (tx) => {
					await assertRepoInOrg(tx, repoId, org);
					const deleted =
						await tx`DELETE FROM repo_pull_request WHERE id=${id} AND repo_id=${repoId} RETURNING id`;
					if (deleted.length === 0) throw new Error("NotFound");
				},
			);
		}, "repository:pull-request-deleted");
	},
);

// ---------------------------------------------------------------------------
// organization_github_installation
// ---------------------------------------------------------------------------

export type InstallationUpsertInput = {
	id: string;
	installationId: number;
	accountId: number;
	accountLogin: string;
	accountType: string;
	accountAvatarUrl?: string | null;
	repositorySelection?: string | null;
	permissions?: unknown;
	origin: "live" | "import";
};

export const installationUpsertEffect = Effect.fn("Domain.installationUpsert")(
	function* (
		sql: Sql,
		org: string,
		actor: string,
		input: InstallationUpsertInput,
	) {
		return yield* withRuntime(async () => {
			const row = {
				id: input.id,
				organization_id: org,
				installation_id: input.installationId,
				account_id: input.accountId,
				account_login: input.accountLogin,
				account_type: input.accountType,
				account_avatar_url: input.accountAvatarUrl ?? null,
				repository_selection: input.repositorySelection ?? null,
				permissions: input.permissions === undefined ? null : input.permissions,
			};
			return runTransaction(
				sql,
				org,
				actor,
				[
					{
						type: "repository:installation-upserted",
						payload: { id: row.id, row, origin: input.origin },
					},
				],
				async (tx) => {
					await tx`INSERT INTO organization_github_installation (${sql(Object.keys(row))})
          VALUES (${row.id},${row.organization_id},${row.installation_id},${row.account_id},${row.account_login},${row.account_type},${row.account_avatar_url},${row.repository_selection},${tx.json(row.permissions as never)})
          ON CONFLICT (id) DO UPDATE SET installation_id=EXCLUDED.installation_id,account_id=EXCLUDED.account_id,
            account_login=EXCLUDED.account_login,account_type=EXCLUDED.account_type,
            account_avatar_url=EXCLUDED.account_avatar_url,repository_selection=EXCLUDED.repository_selection,
            permissions=EXCLUDED.permissions,updated_at=now()`;
				},
			);
		}, "repository:installation-upserted");
	},
);

export const installationDeleteEffect = Effect.fn("Domain.installationDelete")(
	function* (sql: Sql, org: string, actor: string, id: string) {
		return yield* withRuntime(async () => {
			Schema.decodeUnknownSync(Id)(id);
			return runTransaction(
				sql,
				org,
				actor,
				[{ type: "repository:installation-deleted", payload: { id } }],
				async (tx) => {
					const deleted =
						await tx`DELETE FROM organization_github_installation WHERE id=${id} AND organization_id=${org} RETURNING id`;
					if (deleted.length === 0) throw new Error("NotFound");
				},
			);
		}, "repository:installation-deleted");
	},
);

// ---------------------------------------------------------------------------
// github_user_grant — tokens encrypted at rest, events carry metadata only.
// ---------------------------------------------------------------------------

export type GrantUpsertInput = {
	id: string;
	userId: string;
	providerId: string;
	githubUserId: string;
	githubLogin: string;
	encryptedAccessToken: string;
	encryptedRefreshToken?: string | null;
	accessTokenExpiresAt?: string | null;
	refreshTokenExpiresAt?: string | null;
	scope?: string | null;
	origin: "live" | "import";
};

export const grantUpsertEffect = Effect.fn("Domain.grantUpsert")(function* (
	sql: Sql,
	org: string,
	actor: string,
	input: GrantUpsertInput,
) {
	return yield* withRuntime(async () => {
		const safeMetadata = {
			id: input.id,
			user_id: input.userId,
			provider_id: input.providerId,
			github_user_id: input.githubUserId,
			github_login: input.githubLogin,
			scope: input.scope ?? null,
			access_token_expires_at: input.accessTokenExpiresAt ?? null,
			refresh_token_expires_at: input.refreshTokenExpiresAt ?? null,
		};
		return runTransaction(
			sql,
			org,
			actor,
			[
				{
					type: "repository:github-grant-upserted",
					payload: { id: input.id, row: safeMetadata, origin: input.origin },
				},
			],
			async (tx) => {
				const [user] = await tx`SELECT id FROM "user" WHERE id=${input.userId}`;
				if (!user) throw new Error("InvalidReference");
				await tx`INSERT INTO github_user_grant (id,user_id,provider_id,github_user_id,github_login,access_token,refresh_token,access_token_expires_at,refresh_token_expires_at,scope)
          VALUES (${input.id},${input.userId},${input.providerId},${input.githubUserId},${input.githubLogin},${input.encryptedAccessToken},${input.encryptedRefreshToken ?? null},${input.accessTokenExpiresAt ?? null},${input.refreshTokenExpiresAt ?? null},${input.scope ?? null})
          ON CONFLICT (id) DO UPDATE SET provider_id=EXCLUDED.provider_id,github_user_id=EXCLUDED.github_user_id,
            github_login=EXCLUDED.github_login,access_token=EXCLUDED.access_token,
            refresh_token=EXCLUDED.refresh_token,access_token_expires_at=EXCLUDED.access_token_expires_at,
            refresh_token_expires_at=EXCLUDED.refresh_token_expires_at,scope=EXCLUDED.scope,updated_at=now()`;
			},
		);
	}, "repository:github-grant-upserted");
});

export const grantDeleteEffect = Effect.fn("Domain.grantDelete")(function* (
	sql: Sql,
	org: string,
	actor: string,
	userId: string,
	id: string,
) {
	return yield* withRuntime(async () => {
		Schema.decodeUnknownSync(Id)(id);
		return runTransaction(
			sql,
			org,
			actor,
			[{ type: "repository:github-grant-deleted", payload: { id } }],
			async (tx) => {
				// Self-only: the row must belong to the requesting user.
				const deleted =
					await tx`DELETE FROM github_user_grant WHERE id=${id} AND user_id=${userId} RETURNING id`;
				if (deleted.length === 0) throw new Error("NotFound");
			},
		);
	}, "repository:github-grant-deleted");
});

// ---------------------------------------------------------------------------
// integration — board-owned connection; board_id has no FK until STL-16.
// ---------------------------------------------------------------------------

export type IntegrationUpsertInput = {
	id: string;
	boardId: string;
	type: string;
	config: string;
	isActive?: boolean | null;
	origin: "live" | "import";
};

export const integrationUpsertEffect = Effect.fn("Domain.integrationUpsert")(
	function* (
		sql: Sql,
		org: string,
		actor: string,
		input: IntegrationUpsertInput,
	) {
		return yield* withRuntime(async () => {
			// Safe metadata only: the config envelope is board-scoped secret
			// material and never enters the event log.
			const safeMetadata = {
				id: input.id,
				board_id: input.boardId,
				type: input.type,
				is_active: input.isActive ?? null,
			};
			return runTransaction(
				sql,
				org,
				actor,
				[
					{
						type: "repository:integration-upserted",
						payload: { id: input.id, row: safeMetadata, origin: input.origin },
					},
				],
				async (tx) => {
					await tx`INSERT INTO integration (id,board_id,type,config,is_active)
          VALUES (${input.id},${input.boardId},${input.type},${input.config},${input.isActive ?? null})
          ON CONFLICT (id) DO UPDATE SET board_id=EXCLUDED.board_id,type=EXCLUDED.type,
            config=EXCLUDED.config,is_active=EXCLUDED.is_active,updated_at=now()`;
				},
			);
		}, "repository:integration-upserted");
	},
);

export const integrationDeleteEffect = Effect.fn("Domain.integrationDelete")(
	function* (sql: Sql, org: string, actor: string, id: string) {
		return yield* withRuntime(async () => {
			Schema.decodeUnknownSync(Id)(id);
			return runTransaction(
				sql,
				org,
				actor,
				[{ type: "repository:integration-deleted", payload: { id } }],
				async (tx) => {
					const deleted =
						await tx`DELETE FROM integration WHERE id=${id} RETURNING id`;
					if (deleted.length === 0) throw new Error("NotFound");
				},
			);
		}, "repository:integration-deleted");
	},
);
