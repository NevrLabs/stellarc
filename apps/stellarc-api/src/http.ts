import {
	HttpApiBuilder,
	type HttpApp,
	HttpServer,
	HttpServerRequest,
	HttpServerResponse,
} from "@effect/platform";
import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";
import type { Sql } from "postgres";
import { FoundationApi } from "../../../packages/contracts/src/api";
import {
	completeProjectMilestone,
	createProjectMilestone,
	deleteProjectMilestone,
	listProjectMilestones,
	reopenProjectMilestone,
	updateProjectMilestone,
} from "../../../packages/domain/src/project-milestones";
import {
	createProjectUpdate,
	deleteProjectUpdate,
	listProjectUpdates,
	updateProjectUpdate,
} from "../../../packages/domain/src/project-updates";
import {
	archiveProject,
	createProject,
	getProject,
	listProjects,
	renameProjectSlug,
	resolveProject,
	unarchiveProject,
	updateProject,
} from "../../../packages/domain/src/projects";
import type { ShapeEngine } from "../../../packages/sync/src/index";
import { errorResponse } from "./errors";

export type AuthzResult = "ok" | "unauthenticated" | "forbidden";

export type Authorize = (
	org: string,
	headers: Readonly<Record<string, string>>,
	principal?: string,
) => AuthzResult;

type Req = HttpServerRequest.HttpServerRequest;

const jsonBody = (request: Req) =>
	Effect.runPromise(request.json).catch(() => null);

const iso = (d: Date | string | null | undefined) =>
	d ? new Date(d).toISOString() : null;

// --- Public projections (fork camelCase shapes) --------------------------------

function toProjectPublic(row: Record<string, unknown>, health: string | null) {
	return {
		id: row.id as string,
		organizationId: row.organizationId as string,
		slug: row.slug as string,
		name: row.name as string,
		icon: (row.icon as string | null) ?? null,
		color: (row.color as string | null) ?? null,
		summary: row.summary as string,
		description: (row.description as string | null) ?? null,
		successCriteria: (row.successCriteria as string | null) ?? null,
		status: row.status as string,
		priority: (row.priority as string | null) ?? null,
		leadUserId: row.leadUserId as string,
		leadUserName: (row.leadUserName as string | null) ?? null,
		leadTeamId: (row.leadTeamId as string | null) ?? null,
		leadTeamName: (row.leadTeamName as string | null) ?? null,
		startDate: (row.startDate as string | null) ?? null,
		targetDate: (row.targetDate as string | null) ?? null,
		orgPrivilege: (row.orgPrivilege as string | null) ?? null,
		archivedAt: iso(row.archivedAt as Date | null),
		archivedBy: (row.archivedBy as string | null) ?? null,
		archivedByName: (row.archivedByName as string | null) ?? null,
		createdAt: iso(row.createdAt as Date) as string,
		updatedAt: iso(row.updatedAt as Date) as string,
		createdBy: row.createdBy as string,
		progress: { completed: 0, eligible: 0, percent: null },
		health,
	};
}

function toMilestonePublic(row: Record<string, unknown>) {
	return {
		id: row.id as string,
		projectId: row.projectId as string,
		name: row.name as string,
		description: (row.description as string | null) ?? null,
		targetDate: (row.targetDate as string | null) ?? null,
		rank: row.rank as number,
		completedAt: iso(row.completedAt as Date | null),
		completedBy:
			(row.completedBy as { id: string; name: string | null } | null) ?? null,
		createdAt: iso(row.createdAt as Date) as string,
		updatedAt: iso(row.updatedAt as Date) as string,
		progress: { completed: 0, eligible: 0, percent: null },
	};
}

function toUpdatePublic(row: Record<string, unknown>) {
	return {
		id: row.id as string,
		organizationId: row.organizationId as string,
		projectId: row.projectId as string,
		authorId: row.authorId as string,
		authorName: (row.authorName as string | null) ?? null,
		content: row.content as string,
		health: row.health as string,
		editHistory: (row.editHistory as Array<unknown>) ?? [],
		createdAt: iso(row.createdAt as Date) as string,
		updatedAt: iso(row.updatedAt as Date) as string,
	};
}

// Shared by the foundation and fixture handlers so every request — including
// the test-only mutation routes — carries a server span in one trace.
export const requestTelemetry = (
	httpApp: HttpApp.Default<never, never>,
): HttpApp.Default<never, never> =>
	Effect.fn("stellarc.http.request")(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const pathname = url.pathname;
		const orgMatch = /^\/orgs\/([^/]+)\//.exec(pathname);
		const shape = /^\/orgs\/[^/]+\/v1\/shape$/.test(pathname);
		const apiRoute =
			pathname === "/api/project"
				? "/api/project"
				: /^\/api\/project\/[^/]+\/(milestones|updates)/.test(pathname)
					? "/api/project/:projectId/sub"
					: pathname.startsWith("/api/project/")
						? "/api/project/:projectId"
						: undefined;
		const apiOrg = apiRoute ? url.searchParams.get("organizationId") : null;
		yield* Effect.annotateCurrentSpan({
			"http.route": shape
				? "/orgs/:org/v1/shape"
				: pathname === "/health"
					? "/health"
					: (apiRoute ?? "unmatched"),
			"http.request.method": request.method,
			...(orgMatch
				? { "stellarc.org": decodeURIComponent(orgMatch[1]) }
				: apiOrg
					? { "stellarc.org": apiOrg }
					: {}),
		});
		const response = yield* httpApp;
		yield* Effect.annotateCurrentSpan(
			"http.response.status_code",
			response.status,
		);
		// Success responses carry the authenticated principal in a dedicated
		// header; denied requests never receive it, so denied spans record
		// error.type without any principal attribute (fail-closed telemetry).
		const principal = (response.headers as Record<string, string>)[
			"x-stellarc-principal"
		];
		if (response.status < 400 && principal)
			yield* Effect.annotateCurrentSpan({
				"stellarc.principal.kind": "actor",
				"stellarc.principal.id": principal,
			});
		const errorTypes: Record<number, string> = {
			400: "BadRequest",
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

export function foundationHandler(
	sql: Sql,
	engine: ShapeEngine,
	authorize: Authorize,
	healthQuery?: Effect.Effect<unknown, unknown>,
	telemetry: Layer.Layer<never> = Layer.empty,
	// Share one memo map across every build of `telemetry` (handler + fixture
	// server runtime): OTel metric readers reject a second MeterProvider bind.
	memoMap?: Layer.MemoMap,
	// Test-principal extraction ("Bearer <org> <id>") is injected by the
	// test-composed server; production passes nothing and parses no tokens (§3).
	principalFrom: (
		org: string,
		authorization: string | undefined,
	) => string = () => "",
) {
	const principalOf = (org: string, request: Req) =>
		principalFrom(org, request.headers.authorization);
	const guard = (org: string, request: Req) => {
		const principal = principalOf(org, request);
		return authorize(org, request.headers, principal) === "ok"
			? principal
			: null;
	};
	const deny = (org: string, request: Req) => {
		const decision = authorize(org, request.headers, principalOf(org, request));
		return errorResponse({
			_tag: decision === "unauthenticated" ? "Unauthenticated" : "Forbidden",
		});
	};
	const notFound = () =>
		HttpServerResponse.unsafeJson(
			{ _tag: "NotFound", message: "Not found" },
			{ status: 404, headers: { "cache-control": "no-store" } },
		);
	const invalid = () =>
		HttpServerResponse.unsafeJson(
			{ _tag: "BadRequest", message: "Invalid request" },
			{ status: 400, headers: { "cache-control": "no-store" } },
		);
	const conflict = () =>
		HttpServerResponse.unsafeJson(
			{ _tag: "Conflict", message: "Conflict" },
			{ status: 409, headers: { "cache-control": "no-store" } },
		);
	const fail = (error: unknown) => {
		// The error arrives wrapped several layers deep depending on where it
		// was raised: Effect tryPromise -> UnknownException(.error), nested
		// runPromise -> FiberFailure(.cause), Effect Cause({_tag:"Fail"} .error).
		// Peel every .error/.cause layer, then classify by constructor name
		// (instanceof is unreliable across module instances) or _tag.
		let current = error;
		for (let depth = 0; depth < 6; depth += 1) {
			if (current === null || typeof current !== "object") break;
			const carrier = current as { error?: unknown; cause?: unknown };
			const next =
				carrier.error !== undefined
					? carrier.error
					: carrier.cause !== undefined
						? carrier.cause
						: undefined;
			if (next === undefined || next === null || next === current) break;
			current = next;
		}
		const name =
			current instanceof Error
				? current.constructor.name
				: typeof current === "object" && current !== null && "_tag" in current
					? String((current as { _tag: unknown })._tag)
					: "";
		if (name === "NotFound") return notFound();
		if (name === "ValidationError") return invalid();
		if (name === "DuplicateSlug" || name === "InvalidReference")
			return conflict();
		return errorResponse(error);
	};
	const ok = (principal: string, body: unknown) =>
		HttpServerResponse.unsafeJson(body, {
			headers: principalHeaders({}, principal),
		});
	// Run a domain operation inside a db.* span (no statement text attached).
	// Domain operations run on a runtime built from the SAME telemetry layer +
	// memo map the handler was composed with (test-server's pattern), so db.*
	// spans land in the same trace accounting. Without a telemetry layer the
	// default runtime still creates spans (prod exports via the global tracer).
	let lazyRuntime: ManagedRuntime.ManagedRuntime<never, never> | undefined;
	const runtimeFor = () => {
		lazyRuntime ??=
			memoMap && telemetry !== Layer.empty
				? ManagedRuntime.make(telemetry, memoMap)
				: undefined;
		return lazyRuntime;
	};
	const timed = async <A>(name: string, op: () => Promise<A>): Promise<A> => {
		const effect = Effect.tryPromise({ try: op, catch: (e) => e }).pipe(
			Effect.withSpan(name),
		);
		const rt = runtimeFor();
		const exit = await (rt
			? rt.runPromiseExit(effect)
			: Effect.runPromiseExit(effect));
		if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
		return exit.value;
	};
	const lastTxid = async (org: string) =>
		timed("db.projects.last-txid", async () => {
			const [row] =
				await sql`SELECT txid::text AS txid FROM event WHERE org = ${org} ORDER BY seq DESC LIMIT 1`;
			return row ? Number(BigInt(row.txid as string)) : 0;
		});
	const latestHealth = async (projectId: string) =>
		timed("db.projects.latest-health", async () => {
			const [row] =
				await sql`SELECT health FROM project_update WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
			return row ? (row.health as string) : null;
		});

	// The frozen fork client sends only the path id on sub-resource routes
	// (milestones/updates/resources) — the session owned the org there. Derive
	// the owning org from the project row so the guard can authorize the
	// caller against it; unknown and inaccessible ids share the no-leak 404.
	const orgOfProject = async (projectId: string) =>
		timed("db.projects.org-of-project", async () => {
			const [row] =
				await sql`SELECT organization_id FROM project WHERE id = ${projectId}`;
			return row ? (row.organization_id as string) : null;
		});
	const scopedOrg = async (
		request: Req,
		projectId: string,
	): Promise<string | null> => {
		const fromQuery = queryOrg(request);
		if (fromQuery) return fromQuery;
		return orgOfProject(projectId);
	};
	const queryOrg = (request: Req) =>
		new URL(request.url, "http://localhost").searchParams.get(
			"organizationId",
		) ?? "";
	const str = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
	const opt = <T>(v: unknown): T | undefined =>
		v === undefined || v === null ? undefined : (v as T);
	const nul = <T>(v: unknown): T | null =>
		v === undefined || v === null ? null : (v as T);

	const foundation = HttpApiBuilder.group(
		FoundationApi,
		"foundation",
		(handlers) =>
			handlers
				.handleRaw("health", () =>
					(healthQuery ?? Effect.tryPromise(() => sql`SELECT 1`)).pipe(
						Effect.as(HttpServerResponse.unsafeJson({ status: "ok" })),
						Effect.catchAll((error) => Effect.succeed(errorResponse(error))),
					),
				)
				.handleRaw("shape", ({ path, request }) =>
					Effect.gen(function* () {
						const principal = principalFrom(
							path.org,
							request.headers.authorization,
						);
						const decision = authorize(path.org, request.headers, principal);
						if (decision !== "ok")
							return errorResponse({
								_tag:
									decision === "unauthenticated"
										? "Unauthenticated"
										: "Forbidden",
							});
						const response = yield* engine.shapeEffect(
							path.org,
							new URL(request.url, "http://localhost"),
						);
						const resumed = authorize(path.org, request.headers, principal);
						if (resumed !== "ok")
							return errorResponse({
								_tag:
									resumed === "unauthenticated"
										? "Unauthenticated"
										: "Forbidden",
							});
						if (response.status === 204)
							return HttpServerResponse.empty({
								status: 204,
								headers: principalHeaders(
									Object.fromEntries(response.headers),
									principal,
								),
							});
						const body = yield* Effect.tryPromise(() => response.text());
						// Pass the engine payload through unmodified: the engine already
						// declared application/json (§3) and must not be re-encoded.
						return HttpServerResponse.raw(body, {
							status: response.status,
							headers: principalHeaders(
								Object.fromEntries(response.headers),
								principal,
							),
						});
					}).pipe(
						Effect.catchAll((error) => Effect.succeed(errorResponse(error))),
					),
				),
	);

	const projects = HttpApiBuilder.group(FoundationApi, "projects", (handlers) =>
		handlers
			.handleRaw("listProjects", ({ request }) =>
				Effect.tryPromise(async () => {
					const org = queryOrg(request);
					const principal = guard(org, request);
					if (!principal) return deny(org, request);
					const includeArchived =
						new URL(request.url, "http://localhost").searchParams.has(
							"includeArchived",
						) || undefined;
					const rows = await timed("db.projects.list-projects", () =>
						listProjects(sql, org, includeArchived ?? false),
					);
					return ok(
						principal,
						await Promise.all(
							rows.map(async (row) =>
								toProjectPublic(row, await latestHealth(row.id)),
							),
						),
					);
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("createProject", ({ request }) =>
				Effect.tryPromise(async () => {
					const payload = await jsonBody(request);
					if (!payload || typeof payload !== "object") return invalid();
					const p = payload as Record<string, unknown>;
					const org = str(p.organizationId);
					const principal = guard(org, request);
					if (!principal) return deny(org, request);
					const row = await timed("db.projects.create-project", () =>
						createProject(sql, {
							organizationId: org,
							name: str(p.name),
							summary: str(p.summary),
							leadUserId: str(p.leadUserId),
							leadTeamId: nul<string | null>(p.leadTeamId),
							createdBy: principal,
							slug: opt<string>(p.slug),
							status: opt<string>(p.status),
							priority: nul<string | null>(p.priority),
							icon: nul<string | null>(p.icon),
							color: nul<string | null>(p.color),
							description: nul<string | null>(p.description),
							successCriteria: nul<string | null>(p.successCriteria),
							startDate: nul<string | null>(p.startDate),
							targetDate: nul<string | null>(p.targetDate),
						}),
					);
					return ok(principal, {
						data: toProjectPublic(row, null),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("resolveProject", ({ request }) =>
				Effect.tryPromise(async () => {
					const params = new URL(request.url, "http://localhost").searchParams;
					const org = params.get("organizationId") ?? "";
					const principal = guard(org, request);
					if (!principal) return deny(org, request);
					const row = await timed("db.projects.resolve-project", () =>
						resolveProject(sql, org, params.get("slug") ?? ""),
					);
					if (!row) return notFound();
					return ok(principal, {
						...toProjectPublic(row, await latestHealth(row.id)),
						usedSlugAlias: row.usedSlugAlias,
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("getProject", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = queryOrg(request);
					const principal = guard(org, request);
					if (!principal) return deny(org, request);
					const row = await timed("db.projects.get-project", () =>
						getProject(sql, org, path.projectId),
					);
					if (!row) return notFound();
					return ok(
						principal,
						toProjectPublic(row, await latestHealth(row.id)),
					);
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("updateProject", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const payload = await jsonBody(request);
					if (!payload || typeof payload !== "object") return invalid();
					const p = payload as Record<string, unknown>;
					const org = queryOrg(request);
					const principal = guard(org, request);
					if (!principal) return deny(org, request);
					const row = await timed("db.projects.update-project", () =>
						updateProject(sql, {
							id: path.projectId,
							organizationId: org,
							updatedBy: principal,
							name: str(p.name),
							summary: str(p.summary),
							status: str(p.status),
							priority: nul<string | null>(p.priority),
							icon: nul<string | null>(p.icon),
							color: nul<string | null>(p.color),
							description: nul<string | null>(p.description),
							successCriteria: nul<string | null>(p.successCriteria),
							leadUserId: str(p.leadUserId),
							leadTeamId: nul<string | null>(p.leadTeamId),
							startDate: nul<string | null>(p.startDate),
							targetDate: nul<string | null>(p.targetDate),
							orgPrivilege: nul<string | null>(p.orgPrivilege),
						}),
					);
					return ok(principal, {
						data: toProjectPublic(row, null),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("renameProjectSlug", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const payload = await jsonBody(request);
					if (!payload || typeof payload !== "object") return invalid();
					const p = payload as Record<string, unknown>;
					const org = queryOrg(request);
					const principal = guard(org, request);
					if (!principal) return deny(org, request);
					const row = await timed("db.projects.rename-project-slug", () =>
						renameProjectSlug(sql, {
							id: path.projectId,
							organizationId: org,
							slug: str(p.slug),
							userId: principal,
						}),
					);
					return ok(principal, {
						data: toProjectPublic(row, null),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("archiveProject", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = queryOrg(request);
					const principal = guard(org, request);
					if (!principal) return deny(org, request);
					const row = await timed("db.projects.archive-project", () =>
						archiveProject(sql, {
							id: path.projectId,
							organizationId: org,
							userId: principal,
						}),
					);
					return ok(principal, {
						data: toProjectPublic(row, null),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("unarchiveProject", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = queryOrg(request);
					const principal = guard(org, request);
					if (!principal) return deny(org, request);
					const row = await timed("db.projects.unarchive-project", () =>
						unarchiveProject(sql, {
							id: path.projectId,
							organizationId: org,
							userId: principal,
						}),
					);
					return ok(principal, {
						data: toProjectPublic(row, null),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("listMilestones", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const rows = await timed("db.projects.list-milestones", () =>
						listProjectMilestones(sql, path.projectId),
					);
					return ok(principal, rows.map(toMilestonePublic));
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("createMilestone", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const payload = await jsonBody(request);
					if (!payload || typeof payload !== "object") return invalid();
					const p = payload as Record<string, unknown>;
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const row = await timed("db.projects.create-milestone", () =>
						createProjectMilestone(sql, {
							projectId: path.projectId,
							name: str(p.name),
							description: nul<string | null>(p.description),
							targetDate: nul<string | null>(p.targetDate),
							rank: opt<number>(p.rank),
							userId: principal,
						}),
					);
					return ok(principal, {
						data: toMilestonePublic(row),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("updateMilestone", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const payload = await jsonBody(request);
					if (!payload || typeof payload !== "object") return invalid();
					const p = payload as Record<string, unknown>;
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const row = await timed("db.projects.update-milestone", () =>
						updateProjectMilestone(sql, {
							id: path.milestoneId,
							projectId: path.projectId,
							name: opt<string>(p.name),
							description: opt<string | null>(p.description),
							targetDate: opt<string | null>(p.targetDate),
							rank: opt<number>(p.rank),
							userId: principal,
						}),
					);
					return ok(principal, {
						data: toMilestonePublic(row),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("deleteMilestone", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const result = await timed("db.projects.delete-milestone", () =>
						deleteProjectMilestone(sql, {
							id: path.milestoneId,
							projectId: path.projectId,
							userId: principal,
						}),
					);
					return ok(principal, {
						data: result,
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("completeMilestone", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const row = await timed("db.projects.complete-milestone", () =>
						completeProjectMilestone(sql, {
							id: path.milestoneId,
							projectId: path.projectId,
							userId: principal,
						}),
					);
					return ok(principal, {
						data: toMilestonePublic(row),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("reopenMilestone", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const row = await timed("db.projects.reopen-milestone", () =>
						reopenProjectMilestone(sql, {
							id: path.milestoneId,
							projectId: path.projectId,
							userId: principal,
						}),
					);
					return ok(principal, {
						data: toMilestonePublic(row),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("listUpdates", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const rows = await timed("db.projects.list-updates", () =>
						listProjectUpdates(sql, path.projectId),
					);
					return ok(principal, rows.map(toUpdatePublic));
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("createUpdate", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const payload = await jsonBody(request);
					if (!payload || typeof payload !== "object") return invalid();
					const p = payload as Record<string, unknown>;
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const row = await timed("db.projects.create-update", () =>
						createProjectUpdate(sql, {
							projectId: path.projectId,
							authorId: principal,
							content: str(p.content),
							health: str(p.health),
						}),
					);
					return ok(principal, {
						data: toUpdatePublic(row),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("updateUpdate", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const payload = await jsonBody(request);
					if (!payload || typeof payload !== "object") return invalid();
					const p = payload as Record<string, unknown>;
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const row = await timed("db.projects.update-update", () =>
						updateProjectUpdate(sql, {
							id: path.updateId,
							projectId: path.projectId,
							userId: principal,
							content: opt<string>(p.content),
							health: opt<string>(p.health),
						}),
					);
					return ok(principal, {
						data: toUpdatePublic(row),
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			)
			.handleRaw("deleteUpdate", ({ path, request }) =>
				Effect.tryPromise(async () => {
					const org = await scopedOrg(request, path.projectId);
					if (!org) return notFound();
					const principal = guard(org, request);
					if (!principal) return notFound();
					const result = await timed("db.projects.delete-update", () =>
						deleteProjectUpdate(sql, {
							id: path.updateId,
							projectId: path.projectId,
							userId: principal,
						}),
					);
					return ok(principal, {
						data: result,
						txid: await lastTxid(org),
					});
				}).pipe(Effect.catchAll((e) => Effect.succeed(fail(e)))),
			),
	);

	const handler = HttpApiBuilder.toWebHandler(
		Layer.mergeAll(
			HttpApiBuilder.api(FoundationApi).pipe(
				Layer.provide(Layer.merge(foundation, projects)),
			),
			HttpServer.layerContext,
			telemetry,
		),
		{
			middleware: requestTelemetry,
			memoMap,
		},
	);
	return {
		handler: handler.handler,
		dispose: async () => {
			await handler.dispose();
			if (lazyRuntime) await lazyRuntime.dispose();
		},
	};
}

// The bearer token doubles as the test principal ("Bearer <org> <id>"); real
// identity arrives with STL-15. The grammar lives in the test-composed server
// only — production parses no tokens (§3).

const principalHeaders = (
	headers: Record<string, string>,
	principal: string,
): Record<string, string> =>
	principal ? { ...headers, "x-stellarc-principal": principal } : headers;
