import {
	HttpApi,
	HttpApiBuilder,
	type HttpApp,
	HttpServer,
	HttpServerRequest,
	HttpServerResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import type { Sql } from "postgres";
import { RepositoryApiGroup } from "../../../packages/contracts/src/repository-http";

const RepositoryApi = HttpApi.make("repository").add(RepositoryApiGroup);
import {
	grantDeleteEffect,
	installationDeleteEffect,
	installationUpsertEffect,
	integrationDeleteEffect,
	integrationUpsertEffect,
	repoDeleteEffect,
	repoUpsertEffect,
} from "../../../packages/domain/src/repository";
import { errorResponse } from "./errors";
import type { AuthzResult, Authorize } from "./http";

// STL-18 §3: repository HTTP surface served from the same Effect HTTP
// machinery as http.ts (T0). One raw handler per §3 route over the domain
// services; the common error union; Mutation envelopes after commit; foreign
// org ids 404; grants self-only via the injected principal; no SQL, token or
// provider secret ever crosses the boundary (T06/A3).

type Row = Record<string, unknown>;

const ROUTES: Array<[RegExp, string]> = [
	[
		/^\/api\/identity\/orgs\/([^/]+)\/repos\/[^/]+$/,
		"/api/identity/orgs/:org/repos/:id",
	],
	[
		/^\/api\/identity\/orgs\/([^/]+)\/repos\/[^/]+\/(issues|pulls)$/,
		"/api/identity/orgs/:org/repos/:repo/issues|pulls",
	],
	[/^\/api\/identity\/orgs\/([^/]+)\/repos$/, "/api/identity/orgs/:org/repos"],
	[
		/^\/api\/identity\/orgs\/([^/]+)\/github\/installations(\/[^/]+)?$/,
		"/api/identity/orgs/:org/github/installations",
	],
	[/^\/api\/identity\/github\/grants(\/[^/]+)?$/, "/api/identity/github/grants"],
	[
		/^\/api\/identity\/orgs\/([^/]+)\/integrations(\/[^/]+)?$/,
		"/api/identity/orgs/:org/integrations",
	],
];

/** Mirrors requestTelemetry (http.ts) for the repository routes (T11). */
export const repositoryTelemetry = (
	httpApp: HttpApp.Default<never, never>,
): HttpApp.Default<never, never> =>
	Effect.fn("stellarc.http.request")(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const pathname = new URL(request.url, "http://localhost").pathname;
		const orgMatch = /^\/api\/identity\/orgs\/([^/]+)\//.exec(pathname);
		const matched = ROUTES.find(([pattern]) => pattern.test(pathname));
		yield* Effect.annotateCurrentSpan({
			"http.route": matched?.[1] ?? "unmatched",
			"http.request.method": request.method,
			...(orgMatch ? { "stellarc.org": decodeURIComponent(orgMatch[1]) } : {}),
		});
		const response = yield* httpApp;
		yield* Effect.annotateCurrentSpan(
			"http.response.status_code",
			response.status,
		);
		const principal = (response.headers as Record<string, string>)[
			"x-stellarc-principal"
		];
		if (response.status < 400 && principal)
			yield* Effect.annotateCurrentSpan({
				"stellarc.principal.kind": "actor",
				"stellarc.principal.id": principal,
			});
		const errorTypes: Record<number, string> = {
			400: "ValidationError",
			401: "Unauthenticated",
			403: "Forbidden",
			404: "NotFound",
			409: "Conflict",
			500: "InternalError",
			503: "Unavailable",
		};
		if (response.status >= 400)
			yield* Effect.annotateCurrentSpan(
				"error.type",
				errorTypes[response.status] ?? "InternalError",
			);
		return response;
	})();

const json = (
	body: unknown,
	status: number,
	headers: Record<string, string> = {},
) =>
	HttpServerResponse.unsafeJson(body, {
		status,
		headers: { "cache-control": "no-store", ...headers },
	});

const authError = (decision: AuthzResult) =>
	decision === "unauthenticated"
		? json({ _tag: "Unauthenticated", message: "Authentication required" }, 401)
		: json({ _tag: "Forbidden", message: "Access denied" }, 403);

const validationError = (message: string) =>
	json({ _tag: "ValidationError", message }, 400);

const notFound = () => json({ _tag: "NotFound" }, 404);

/** Domain Error messages → the §3 error union. */
const classify = (error: unknown): HttpServerResponse.HttpServerResponse => {
	if (
		typeof error === "object" &&
		error !== null &&
		"_tag" in error &&
		(error as { _tag: string })._tag === "RequestError"
	)
		return validationError("Invalid request body");
	const message = error instanceof Error ? error.message : "";
	if (message === "NotFound") return notFound();
	if (message === "InvalidReference")
		return json({ _tag: "Conflict", code: "InvalidReference" }, 409);
	if (message === "Duplicate")
		return json({ _tag: "Conflict", code: "Duplicate" }, 409);
	return errorResponse(error);
};

const ok = (body: unknown, principal: string) =>
	json(body, 200, principal ? { "x-stellarc-principal": principal } : {});

const str = (value: unknown): string => (value == null ? "" : String(value));

/** Strict body decode: excess keys and missing required keys are 400s. */
function decodeBody(
	body: unknown,
	required: string[],
	optional: string[],
): Record<string, unknown> {
	if (typeof body !== "object" || body === null)
		throw new HttpValidationError("Invalid request body");
	const record = body as Record<string, unknown>;
	for (const key of Object.keys(record))
		if (!required.includes(key) && !optional.includes(key))
			throw new HttpValidationError(`Unexpected key: ${key}`);
	for (const key of required)
		if (record[key] === undefined || record[key] === null)
			throw new HttpValidationError(`Missing key: ${key}`);
	return record;
}

class HttpValidationError extends Error {}

const httpValidation = (error: unknown): HttpServerResponse.HttpServerResponse =>
	error instanceof HttpValidationError
		? validationError(error.message)
		: classify(error);

const PROVIDERS = new Set(["github", "gitea", "gitlab"]);

const clampLimit = (raw: string | null): number => {
	if (raw === null) return 50;
	const n = Number.parseInt(raw, 10);
	if (!Number.isInteger(n) || n < 1 || n > 200)
		throw new HttpValidationError("limit must be an integer in 1..200");
	return n;
};

const validId = (id: string): string => {
	if (!id || id.length > 128)
		throw new HttpValidationError("Invalid identifier");
	return id;
};

// --- row → public DTO (camelCase wire; secrets redacted) ------------------

const iso = (value: unknown): string | null =>
	value instanceof Date ? value.toISOString() : (value as string | null) ?? null;

async function repoPublic(sql: Sql, row: Row) {
	const [counts] = (await sql`SELECT
      count(*) FILTER (WHERE state='open')::int AS open_issues,
      count(*) FILTER (WHERE state='open')::int AS open_prs
    FROM repo_issue WHERE repo_id=${row.id as string}`) as Row[];
	const [prCounts] = (await sql`SELECT
      count(*) FILTER (WHERE state='open')::int AS open_prs
    FROM repo_pull_request WHERE repo_id=${row.id as string}`) as Row[];
	return {
		id: row.id,
		organizationId: row.organization_id,
		provider: row.provider,
		owner: row.owner,
		name: row.name,
		externalId: row.external_id ?? null,
		url: row.url,
		description: row.description ?? null,
		defaultBranch: row.default_branch ?? null,
		isPrivate: row.is_private ?? null,
		config: null, // redacted: config may carry provider secrets (A3)
		isActive: row.is_active ?? null,
		lastSyncedAt: iso(row.last_synced_at),
		openIssueCount: counts?.open_issues ?? 0,
		openPullRequestCount: prCounts?.open_prs ?? 0,
	};
}

const issuePublic = (row: Row) => ({
	id: row.id,
	repoId: row.repo_id,
	number: row.number,
	externalId: row.external_id ?? null,
	title: row.title,
	body: row.body ?? null,
	state: row.state,
	authorLogin: row.author_login ?? null,
	authorAvatarUrl: row.author_avatar_url ?? null,
	assigneeLogins: row.assignee_logins ?? null,
	labels: row.labels ?? null,
	commentCount: row.comment_count ?? 0,
	url: row.url,
	externalCreatedAt: iso(row.external_created_at),
	externalUpdatedAt: iso(row.external_updated_at),
	closedAt: iso(row.closed_at),
});

const pullPublic = (row: Row) => ({
	id: row.id,
	repoId: row.repo_id,
	number: row.number,
	externalId: row.external_id ?? null,
	title: row.title,
	body: row.body ?? null,
	state: row.state,
	isDraft: row.is_draft ?? null,
	authorLogin: row.author_login ?? null,
	authorAvatarUrl: row.author_avatar_url ?? null,
	headBranch: row.head_branch ?? null,
	baseBranch: row.base_branch ?? null,
	labels: row.labels ?? null,
	commentCount: row.comment_count ?? 0,
	additions: row.additions ?? null,
	deletions: row.deletions ?? null,
	changedFiles: row.changed_files ?? null,
	url: row.url,
	externalCreatedAt: iso(row.external_created_at),
	externalUpdatedAt: iso(row.external_updated_at),
	mergedAt: iso(row.merged_at),
	closedAt: iso(row.closed_at),
});

const installationPublic = (row: Row) => ({
	id: row.id,
	organizationId: row.organization_id,
	installationId: row.installation_id,
	accountId: row.account_id,
	accountLogin: row.account_login,
	accountType: row.account_type,
	accountAvatarUrl: row.account_avatar_url ?? null,
	repositorySelection: row.repository_selection ?? null,
	permissions: row.permissions ?? null,
	createdAt: iso(row.created_at),
	updatedAt: iso(row.updated_at),
});

const grantPublic = (row: Row) => ({
	id: row.id,
	userId: row.user_id,
	providerId: row.provider_id,
	githubUserId: row.github_user_id,
	githubLogin: row.github_login,
	accessTokenExpiresAt: iso(row.access_token_expires_at),
	refreshTokenExpiresAt: iso(row.refresh_token_expires_at),
	scope: row.scope ?? null,
	createdAt: iso(row.created_at),
	updatedAt: iso(row.updated_at),
});

const integrationPublic = (row: Row) => ({
	id: row.id,
	boardId: row.board_id,
	type: row.type,
	isActive: row.is_active ?? null,
	createdAt: iso(row.created_at),
	updatedAt: iso(row.updated_at),
});

export function repositoryHandler(
	sql: Sql,
	authorize: Authorize,
	telemetry: Layer.Layer<never> = Layer.empty,
	memoMap?: Layer.MemoMap,
	principalFrom: (
		org: string,
		authorization: string | undefined,
	) => string = () => "",
) {
	const group = HttpApiBuilder.group(RepositoryApi, "repository", (handlers) =>
		handlers
			.handleRaw("list-repos", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					const url = new URL(request.url, "http://localhost");
					const provider = url.searchParams.get("provider");
					const active = url.searchParams.get("active");
					const rows = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM repo WHERE organization_id=${path.org} ORDER BY id` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					const filtered = rows.filter(
						(r) =>
							(!provider || r.provider === provider) &&
							(active === null || String(r.is_active) === active),
					);
					return ok(
						{ repos: yield* Effect.forEach(filtered, (r) => Effect.promise(() => repoPublic(sql, r))) },
						principal,
					);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(classify(error))),
				),
			)
			.handleRaw("create-repo", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					const body = decodeBody(
						yield* request.json,
						["provider", "owner", "name", "url"],
						[
							"externalId",
							"description",
							"defaultBranch",
							"isPrivate",
							"isActive",
							"config",
							"orgPrivilege",
						],
					);
					if (!PROVIDERS.has(str(body.provider)))
						throw new HttpValidationError("Unsupported provider");
					const id = crypto.randomUUID();
					const created = yield* repoUpsertEffect(sql, path.org, principal || "actor-unknown", {
						id,
						provider: str(body.provider),
						owner: str(body.owner),
						name: str(body.name),
						url: str(body.url),
						externalId: body.externalId as string | null,
						description: body.description as string | null,
						defaultBranch: body.defaultBranch as string | null,
						isPrivate: body.isPrivate as boolean | null,
						isActive: body.isActive as boolean | null,
						config: body.config as string | null,
						orgPrivilege: body.orgPrivilege as string | null,
						origin: "live",
					});
					const [row] = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM repo WHERE id=${id} AND organization_id=${path.org}` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					return ok({ data: yield* Effect.promise(() => repoPublic(sql, row)), txid: created.txid }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(httpValidation(error))),
				),
			)
			.handleRaw("update-repo", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					validId(path.id);
					const [existing] = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM repo WHERE id=${path.id} AND organization_id=${path.org}` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					if (!existing) return notFound();
					const body = decodeBody(
						yield* request.json,
						[],
						["description", "defaultBranch", "isActive", "orgPrivilege", "config"],
					);
					const result = yield* repoUpsertEffect(
						sql,
						path.org,
						principal || "actor-unknown",
						{
							id: path.id,
							provider: str(existing.provider),
							owner: str(existing.owner),
							name: str(existing.name),
							url: str(existing.url),
							externalId: existing.external_id as string | null,
							description: (body.description ?? existing.description) as string | null,
							defaultBranch: (body.defaultBranch ?? existing.default_branch) as string | null,
							isPrivate: existing.is_private as boolean | null,
							config: (body.config ?? existing.config) as string | null,
							isActive: (body.isActive ?? existing.is_active) as boolean | null,
							orgPrivilege: (body.orgPrivilege ?? existing.org_privilege) as string | null,
							origin: "live",
						},
					);
					const [row] = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM repo WHERE id=${path.id} AND organization_id=${path.org}` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					return ok(
						{ data: yield* Effect.promise(() => repoPublic(sql, row)), txid: result.txid },
						principal,
					);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(httpValidation(error))),
				),
			)
			.handleRaw("delete-repo", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					validId(path.id);
					const result = yield* repoDeleteEffect(
						sql,
						path.org,
						principal || "actor-unknown",
						path.id,
					);
					return ok({ data: { id: path.id }, txid: result.txid }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(classify(error))),
				),
			)
			.handleRaw("list-issues", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					const url = new URL(request.url, "http://localhost");
					const limit = clampLimit(url.searchParams.get("limit"));
					const state = url.searchParams.get("state");
					const cursor = url.searchParams.get("cursor");
					const [repo] = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT id FROM repo WHERE id=${path.repo} AND organization_id=${path.org}` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					if (!repo) return notFound();
					const rows = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM repo_issue
              WHERE repo_id=${path.repo}
                ${state ? sql`AND state=${state}` : sql``}
                ${cursor ? sql`AND id > ${cursor}` : sql``}
              ORDER BY id LIMIT ${limit}` as unknown as Promise<Row[]>,
						catch: (cause) => cause,
					})) as Row[];
					const items = rows.map(issuePublic);
					return ok(
						{
							items,
							nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
						},
						principal,
					);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(httpValidation(error))),
				),
			)
			.handleRaw("list-pulls", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					const url = new URL(request.url, "http://localhost");
					const limit = clampLimit(url.searchParams.get("limit"));
					const state = url.searchParams.get("state");
					const cursor = url.searchParams.get("cursor");
					const [repo] = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT id FROM repo WHERE id=${path.repo} AND organization_id=${path.org}` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					if (!repo) return notFound();
					const rows = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM repo_pull_request
              WHERE repo_id=${path.repo}
                ${state ? sql`AND state=${state}` : sql``}
                ${cursor ? sql`AND id > ${cursor}` : sql``}
              ORDER BY id LIMIT ${limit}` as unknown as Promise<Row[]>,
						catch: (cause) => cause,
					})) as Row[];
					const items = rows.map(pullPublic);
					return ok(
						{
							items,
							nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
						},
						principal,
					);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(httpValidation(error))),
				),
			)
			.handleRaw("list-installations", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					const rows = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM organization_github_installation WHERE organization_id=${path.org} ORDER BY id` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					return ok({ installations: rows.map(installationPublic) }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(classify(error))),
				),
			)
			.handleRaw("create-installation", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					const body = decodeBody(
						yield* request.json,
						["installationId", "accountId", "accountLogin", "accountType"],
						["accountAvatarUrl", "repositorySelection", "permissions"],
					);
					const id = crypto.randomUUID();
					const created = yield* installationUpsertEffect(
						sql,
						path.org,
						principal || "actor-unknown",
						{
							id,
							installationId: Number(body.installationId),
							accountId: Number(body.accountId),
							accountLogin: str(body.accountLogin),
							accountType: str(body.accountType),
							accountAvatarUrl: body.accountAvatarUrl as string | null,
							repositorySelection: body.repositorySelection as string | null,
							permissions: body.permissions as string | null,
							origin: "live",
						},
					);
					const [row] = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM organization_github_installation WHERE id=${id}` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					return ok({ data: installationPublic(row), txid: created.txid }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(httpValidation(error))),
				),
			)
			.handleRaw("delete-installation", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					validId(path.id);
					const result = yield* installationDeleteEffect(
						sql,
						path.org,
						principal || "actor-unknown",
						path.id,
					);
					return ok({ data: { id: path.id }, txid: result.txid }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(classify(error))),
				),
			)
			.handleRaw("list-grants", ({ request }) =>
				Effect.gen(function* () {
					// Grants have no org in the path; the org rides in the test
					// principal grammar ("Bearer <org> <user>") — production identity
					// arrives with STL-15.
					const token = (request.headers.authorization ?? "")
						.replace(/^Bearer\s+/i, "")
						.trim();
					const tokenOrg = token.split(" ")[0] ?? "";
					const principal = principalFrom(tokenOrg, request.headers.authorization);
					const decision = authorize(tokenOrg, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					if (!principal) return authError("unauthenticated");
					const rows = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM github_user_grant WHERE user_id=${principal} ORDER BY id` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					return ok({ grants: rows.map(grantPublic) }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(classify(error))),
				),
			)
			.handleRaw("delete-grant", ({ path, request }) =>
				Effect.gen(function* () {
					const token = (request.headers.authorization ?? "")
						.replace(/^Bearer\s+/i, "")
						.trim();
					const tokenOrg = token.split(" ")[0] ?? "";
					const principal = principalFrom(tokenOrg, request.headers.authorization);
					const decision = authorize(tokenOrg, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					if (!principal) return authError("unauthenticated");
					validId(path.id);
					const result = yield* grantDeleteEffect(
						sql,
						tokenOrg,
						principal || "actor-unknown",
						principal,
						path.id,
					);
					return ok({ data: { id: path.id }, txid: result.txid }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(classify(error))),
				),
			)
			.handleRaw("list-integrations", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					const rows = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM integration ORDER BY id` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					return ok({ integrations: rows.map(integrationPublic) }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(classify(error))),
				),
			)
			.handleRaw("put-integration", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					const body = decodeBody(
						yield* request.json,
						["boardId", "type", "config"],
						["isActive"],
					);
					validId(str(body.boardId));
					// Upsert key is (board_id, type): reuse the existing row id so a
					// second PUT updates instead of duplicating (§2 unique).
					const [existing] = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT id FROM integration WHERE board_id=${str(body.boardId)} AND type=${str(body.type)}` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					const id = (existing?.id as string) ?? crypto.randomUUID();
					const result = yield* integrationUpsertEffect(
						sql,
						path.org,
						principal || "actor-unknown",
						{
							id,
							boardId: str(body.boardId),
							type: str(body.type),
							config: str(body.config),
							isActive: body.isActive as boolean | null,
							origin: "live",
						},
					);
					const [row] = (yield* Effect.tryPromise({
						try: () =>
							sql`SELECT * FROM integration WHERE id=${id}` as unknown as Promise<
								Row[]
							>,
						catch: (cause) => cause,
					})) as Row[];
					return ok({ data: integrationPublic(row), txid: result.txid }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(httpValidation(error))),
				),
			)
			.handleRaw("delete-integration", ({ path, request }) =>
				Effect.gen(function* () {
					const principal = principalFrom(
						path.org,
						request.headers.authorization,
					);
					const decision = authorize(path.org, request.headers, principal);
					if (decision !== "ok") return authError(decision);
					validId(path.id);
					const result = yield* integrationDeleteEffect(
						sql,
						path.org,
						principal || "actor-unknown",
						path.id,
					);
					return ok({ data: { id: path.id }, txid: result.txid }, principal);
				}).pipe(
					Effect.catchAll((error) => Effect.succeed(classify(error))),
				),
			),
	);

	return HttpApiBuilder.toWebHandler(
		Layer.mergeAll(
			HttpApiBuilder.api(RepositoryApi).pipe(Layer.provide(group)),
			HttpServer.layerContext,
			telemetry,
		),
		{
			middleware: repositoryTelemetry,
			memoMap,
		},
	);
}
