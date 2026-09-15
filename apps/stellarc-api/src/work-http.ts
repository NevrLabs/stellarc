import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { Effect, Layer, Schema } from "effect";
import type { Sql } from "postgres";
import { WorkApi, type WorkError } from "../../../packages/contracts/src/work";
import * as work from "../../../packages/domain/src/work";
import { type Authorize, requestTelemetry } from "./http";

// --- Error mapping (§3): WorkError values are returned as plain wire objects;
// the handleRaw encoder matches them against the status-annotated success
// variants declared on every endpoint (see WorkErrorVariants). ----------------

function toWorkError(error: unknown): WorkError {
	// Effect wraps promise rejections as UnknownException { _tag, error } —
	// unwrap to reach the domain error class.
	const cause = error as { _tag?: string; error?: unknown };
	const inner =
		cause?._tag === "UnknownException" || cause?._tag === "WrappedError"
			? (cause.error ?? error)
			: error;
	if (inner instanceof work.WorkValidationError)
		return { _tag: "ValidationError", message: inner.detail };
	if (inner instanceof work.WorkNotFound) return { _tag: "NotFound" };
	if (inner instanceof work.WorkConflict)
		return { _tag: "Conflict", code: inner.code };
	return { _tag: "Unavailable" };
}

type Ctx = {
	path: Record<string, string>;
	request: {
		headers: unknown;
		url: string;
	};
};

type Session = { org: string; principal: string };

function headerOf(headers: unknown, name: string): string | undefined {
	if (headers && typeof (headers as Headers).get === "function")
		return (headers as Headers).get(name) ?? undefined;
	return (headers as Record<string, string> | undefined)?.[name];
}

function session(
	ctx: Ctx,
	authorize: Authorize,
	principalFrom: (org: string, authorization: string | undefined) => string,
): Session | WorkError {
	const authorization = headerOf(ctx.request.headers, "authorization");
	const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
	const org = token.split(" ")[0] ?? "";
	const principal = principalFrom(org, authorization);
	if (!org) return { _tag: "Unauthenticated" };
	const decision = authorize(
		org,
		ctx.request.headers as Record<string, string>,
		principal,
	);
	if (decision === "unauthenticated") return { _tag: "Unauthenticated" };
	if (decision === "forbidden") return { _tag: "Forbidden" };
	return { org, principal: principal || "anonymous" };
}

const ok = (value: unknown) => value;

function queryFlag(url: string, key: string): boolean {
	return new URL(url, "http://localhost").searchParams.get(key) === "true";
}

function queryParam(url: string, key: string): string | undefined {
	return new URL(url, "http://localhost").searchParams.get(key) ?? undefined;
}

async function readJson(ctx: Ctx): Promise<unknown> {
	const jsonField: unknown = (ctx.request as unknown as { json: unknown }).json;
	if (typeof jsonField === "function")
		return await (jsonField as (this: unknown) => Promise<unknown>).call(
			ctx.request,
		);
	return await Effect.runPromise(jsonField as Effect.Effect<unknown, unknown>);
}

function isWorkError(value: unknown): value is WorkError {
	return (
		typeof value === "object" &&
		value !== null &&
		"_tag" in value &&
		typeof (value as { _tag: unknown })._tag === "string" &&
		[
			"ValidationError",
			"Unauthenticated",
			"Forbidden",
			"NotFound",
			"Conflict",
			"RateLimited",
			"Unavailable",
		].includes(String((value as { _tag: unknown })._tag))
	);
}

async function body<T>(
	ctx: Ctx,
	// biome-ignore lint/suspicious/noExplicitAny: decode passthrough
	schema: Schema.Schema<any, any, never>,
): Promise<T | WorkError> {
	try {
		const raw = await readJson(ctx);
		return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(
			raw,
		) as T;
	} catch {
		const invalid: WorkError = { _tag: "ValidationError", message: "body" };
		return invalid;
	}
}

type AnyRow = Record<string, unknown>;

// Fixed-window rate buckets keyed `${boardId}:${minute}`. Pruned on write so
// the map holds at most the current window's keys (D12: no unbounded growth).
const publicRateBuckets = new Map<string, number>();
let publicRateCurrentWindow = -1;
function pruneRateBuckets(window: number) {
	if (window === publicRateCurrentWindow) return;
	for (const key of publicRateBuckets.keys())
		if (!key.endsWith(`:${window}`)) publicRateBuckets.delete(key);
	publicRateCurrentWindow = window;
}

/** All work endpoints (§3). Org identity rides the authorization token. */
export function workHandler(
	sql: Sql,
	authorize: Authorize,
	principalFrom: (
		org: string,
		authorization: string | undefined,
	) => string = () => "",
	telemetry: Layer.Layer<never> = Layer.empty,
	memoMap?: Layer.MemoMap,
): {
	handler: (request: Request) => Promise<Response>;
	dispose: () => Promise<void>;
} {
	type Handler = (ctx: Ctx) => Promise<unknown>;
	const auth = (ctx: Ctx) => session(ctx, authorize, principalFrom);

	const handlers: Record<string, Handler> = {
		listBoards: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const includeArchived = queryFlag(ctx.request.url, "includeArchived");
			const teamId = queryParam(ctx.request.url, "teamId");
			const rows = (await sql`SELECT * FROM "board"
				WHERE organization_id = ${s.org}
				${includeArchived ? sql`` : sql`AND archived_at IS NULL`}
				${teamId ? sql`AND (default_assignee_team_id = ${teamId})` : sql``}
				ORDER BY created_at`) as AnyRow[];
			return ok({ boards: rows.map((r) => work.boardPublic(r as never)) });
		},
		createBoard: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, CreateBoardBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.createBoard(sql, s.org, s.principal, {
					...(input as object),
					id: crypto.randomUUID(),
				} as never),
			);
		},
		getBoard: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const [row] =
				(await sql`SELECT * FROM "board" WHERE id = ${ctx.path.id} AND organization_id = ${s.org}`) as AnyRow[];
			if (!row) return { _tag: "NotFound" } as WorkError;
			return ok({ board: work.boardPublic(row as never) });
		},
		updateBoard: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, UpdateBoardBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.updateBoard(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					input as never,
				),
			);
		},
		deleteBoard: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(await work.deleteBoard(sql, s.org, s.principal, ctx.path.id));
		},
		archiveBoard: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(
				await work.archiveBoard(sql, s.org, s.principal, ctx.path.id, true),
			);
		},
		unarchiveBoard: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(
				await work.archiveBoard(sql, s.org, s.principal, ctx.path.id, false),
			);
		},
		putBoardKey: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, PutKeyBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.setBoardKey(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					(input as { key: string }).key,
				),
			);
		},
		listStatuses: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(await work.listStatuses(sql, s.org, ctx.path.id));
		},
		createStatus: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, CreateStatusBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.createStatus(sql, s.org, s.principal, ctx.path.id, {
					...(input as object),
					id: crypto.randomUUID(),
				} as never),
			);
		},
		updateStatus: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, UpdateStatusBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.updateStatus(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					input as never,
				),
			);
		},
		deleteStatus: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(await work.deleteStatus(sql, s.org, s.principal, ctx.path.id));
		},
		reorderStatuses: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, ReorderStatusesBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.reorderStatuses(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					(input as { ids: string[] }).ids,
				),
			);
		},
		listTickets: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(
				await work.listTickets(sql, s.org, ctx.path.id, {
					status: queryParam(ctx.request.url, "status"),
					assigneeId: queryParam(ctx.request.url, "assigneeId"),
					teamId: queryParam(ctx.request.url, "teamId"),
					includeArchived: queryFlag(ctx.request.url, "includeArchived"),
					includeDeleted: queryFlag(ctx.request.url, "includeDeleted"),
				}),
			);
		},
		createTicket: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, CreateTicketBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.createTicket(sql, s.org, s.principal, ctx.path.id, {
					...(input as object),
					id: crypto.randomUUID(),
				} as never),
			);
		},
		getTicket: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(await work.getTicket(sql, s.org, ctx.path.id));
		},
		updateTicket: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, UpdateTicketBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.updateTicket(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					input as never,
				),
			);
		},
		putTicketStatus: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, PutStatusBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.setTicketStatus(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					(input as { status: string }).status,
				),
			);
		},
		moveTicket: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, MoveBody);
			if (isWorkError(input)) return input;
			const b = input as {
				boardId: string;
				status?: string;
				position?: number;
			};
			return ok(
				await work.moveTicket(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					b.boardId,
					b.status,
					b.position,
				),
			);
		},
		reorderTickets: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, ReorderTicketsBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.reorderTickets(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					(input as { updates: never[] }).updates,
				),
			);
		},
		bulkPatchTickets: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, BulkBody);
			if (isWorkError(input)) return input;
			const b = input as { ids: string[]; patch: never };
			return ok(
				await work.bulkPatchTickets(sql, s.org, s.principal, b.ids, b.patch),
			);
		},
		deleteTicket: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(
				await work.softDeleteTicket(sql, s.org, s.principal, ctx.path.id),
			);
		},
		restoreTicket: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(await work.restoreTicket(sql, s.org, s.principal, ctx.path.id));
		},
		putTicketArchived: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, ArchiveBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.setTicketArchived(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					(input as { archived: boolean }).archived,
				),
			);
		},
		listLabels: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const organizationId =
				queryParam(ctx.request.url, "organizationId") ?? s.org;
			return ok(await work.listLabels(sql, s.org, organizationId));
		},
		createLabel: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, CreateLabelBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.createLabel(sql, s.org, s.principal, {
					...(input as object),
					id: crypto.randomUUID(),
				} as never),
			);
		},
		updateLabel: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, UpdateLabelBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.updateLabel(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					input as never,
				),
			);
		},
		putLabelTask: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, PutLabelTaskBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.assignLabelTask(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					(input as { taskId?: string }).taskId ?? null,
				),
			);
		},
		deleteLabel: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(await work.deleteLabel(sql, s.org, s.principal, ctx.path.id));
		},
		listTicketLabels: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(await work.listTicketLabels(sql, s.org, ctx.path.id));
		},
		listTemplates: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const organizationId =
				queryParam(ctx.request.url, "organizationId") ?? s.org;
			return ok(await work.listTemplates(sql, s.org, organizationId));
		},
		createTemplate: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, CreateTemplateBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.createTemplate(sql, s.org, s.principal, {
					...(input as object),
					id: crypto.randomUUID(),
				} as never),
			);
		},
		updateTemplate: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, UpdateTemplateBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.updateTemplate(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					input as never,
				),
			);
		},
		deleteTemplate: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(
				await work.deleteTemplate(sql, s.org, s.principal, ctx.path.id),
			);
		},
		listFlagTypes: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const boardId = queryParam(ctx.request.url, "boardId");
			if (!boardId)
				return { _tag: "ValidationError", message: "boardId" } as WorkError;
			return ok(await work.listFlagTypes(sql, s.org, boardId));
		},
		createFlagType: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, CreateFlagTypeBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.createFlagType(sql, s.org, s.principal, {
					...(input as object),
					id: crypto.randomUUID(),
				} as never),
			);
		},
		updateFlagType: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, UpdateFlagTypeBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.updateFlagType(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					input as never,
				),
			);
		},
		deleteFlagType: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(
				await work.deleteFlagType(sql, s.org, s.principal, ctx.path.id),
			);
		},
		listTicketFlags: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			return ok(await work.listTicketFlags(sql, s.org, ctx.path.id));
		},
		createTicketFlag: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, CreateFlagBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.createTicketFlag(sql, s.org, s.principal, ctx.path.id, {
					...(input as object),
					id: crypto.randomUUID(),
				} as never),
			);
		},
		resolveTicketFlag: async (ctx) => {
			const s = auth(ctx);
			if (isWorkError(s)) return s;
			const input = await body(ctx, ResolveBody);
			if (isWorkError(input)) return input;
			return ok(
				await work.resolveTicketFlag(
					sql,
					s.org,
					s.principal,
					ctx.path.id,
					(input as { note: string }).note,
				),
			);
		},
		publicBoard: async (ctx) => {
			// Unauthenticated by design (§3): is_public boards only, minimal
			// fields, fixed-window rate limit per board.
			const id = ctx.path.id;
			const now = Math.floor(Date.now() / 1000);
			const window = Math.floor(now / 60);
			pruneRateBuckets(window);
			const key = `${id}:${window}`;
			const bucket = publicRateBuckets.get(key) ?? 0;
			if (bucket >= 120) {
				const limited: WorkError = {
					_tag: "RateLimited",
					retryAfterSeconds: 60 - (now % 60),
				};
				return limited;
			}
			publicRateBuckets.set(key, bucket + 1);
			const [row] =
				(await sql`SELECT id, name, slug, description, icon, created_at, is_public FROM "board" WHERE id = ${id}`) as AnyRow[];
			if (!row || row.is_public !== true)
				return { _tag: "NotFound" } as WorkError;
			return ok({
				board: {
					id: row.id,
					name: row.name,
					slug: row.slug,
					description: row.description,
					icon: row.icon,
					createdAt: row.created_at,
				},
			});
		},
	};

	const handled = Object.keys(handlers);

	const group = HttpApiBuilder.group(WorkApi, "work", (g) => {
		let builder: unknown = g;
		for (const name of handled) {
			const handler = handlers[name];
			builder = (
				builder as {
					handleRaw: (
						name: string,
						h: (ctx: unknown) => Effect.Effect<unknown, unknown, unknown>,
					) => unknown;
				}
			).handleRaw(name, (ctx: unknown) =>
				// tryPromise's catch channel is re-failed by handleRaw (500); the
				// error must land in the SUCCESS channel for success-variant encode.
				Effect.tryPromise(() => handler(ctx as Ctx)).pipe(
					Effect.catchAll((error) => Effect.succeed(toWorkError(error))),
				),
			);
		}
		// The typed builder can't express the dynamic 41-handler registration;
		// runtime exhaustiveness is guaranteed by `handled` (== handlers keys).
		return builder as never;
	});
	return HttpApiBuilder.toWebHandler(
		Layer.mergeAll(
			HttpApiBuilder.api(WorkApi).pipe(Layer.provide(group)),
			HttpServer.layerContext,
			telemetry,
		),
		{
			memoMap,
			// §3/T26: every work request carries http.route/method + stellarc.org
			// (from the bearer org) + principal.kind/id on success. No titles,
			// descriptions or notes ever enter span attributes.
			middleware: (httpApp) =>
				requestTelemetry(httpApp, workRouteOf, workOrgOf, workPrincipalOf),
		},
	);
}

// Parameterized route templates for §3's work API surface. Order matters:
// longest literal segments first so :id greediness cannot swallow fixed tails.
const WORK_ROUTES: Array<[RegExp, string]> = [
	[
		/^\/api\/work\/boards\/([^/]+)\/statuses\/reorder$/,
		"/api/work/boards/:id/statuses/reorder",
	],
	[
		/^\/api\/work\/boards\/([^/]+)\/tickets\/reorder$/,
		"/api/work/boards/:id/tickets/reorder",
	],
	[/^\/api\/work\/boards\/([^/]+)\/statuses$/, "/api/work/boards/:id/statuses"],
	[/^\/api\/work\/boards\/([^/]+)\/tickets$/, "/api/work/boards/:id/tickets"],
	[/^\/api\/work\/boards\/([^/]+)\/archive$/, "/api/work/boards/:id/archive"],
	[
		/^\/api\/work\/boards\/([^/]+)\/unarchive$/,
		"/api/work/boards/:id/unarchive",
	],
	[/^\/api\/work\/boards\/([^/]+)\/key$/, "/api/work/boards/:id/key"],
	[/^\/api\/work\/boards\/([^/]+)$/, "/api/work/boards/:id"],
	[/^\/api\/work\/boards$/, "/api/work/boards"],
	[/^\/api\/work\/statuses\/([^/]+)$/, "/api/work/statuses/:id"],
	[/^\/api\/work\/tickets\/bulk$/, "/api/work/tickets/bulk"],
	[/^\/api\/work\/tickets\/([^/]+)\/status$/, "/api/work/tickets/:id/status"],
	[/^\/api\/work\/tickets\/([^/]+)\/move$/, "/api/work/tickets/:id/move"],
	[/^\/api\/work\/tickets\/([^/]+)\/archive$/, "/api/work/tickets/:id/archive"],
	[/^\/api\/work\/tickets\/([^/]+)\/restore$/, "/api/work/tickets/:id/restore"],
	[/^\/api\/work\/tickets\/([^/]+)\/labels$/, "/api/work/tickets/:id/labels"],
	[/^\/api\/work\/tickets\/([^/]+)\/flags$/, "/api/work/tickets/:id/flags"],
	[/^\/api\/work\/tickets\/([^/]+)$/, "/api/work/tickets/:id"],
	[/^\/api\/work\/labels\/([^/]+)\/task$/, "/api/work/labels/:id/task"],
	[/^\/api\/work\/labels\/([^/]+)$/, "/api/work/labels/:id"],
	[/^\/api\/work\/labels$/, "/api/work/labels"],
	[/^\/api\/work\/templates\/([^/]+)$/, "/api/work/templates/:id"],
	[/^\/api\/work\/templates$/, "/api/work/templates"],
	[/^\/api\/work\/flag-types\/([^/]+)$/, "/api/work/flag-types/:id"],
	[/^\/api\/work\/flag-types$/, "/api/work/flag-types"],
	[/^\/api\/work\/flags\/([^/]+)\/resolve$/, "/api/work/flags/:id/resolve"],
	[/^\/api\/public\/boards\/([^/]+)$/, "/api/public/boards/:id"],
];

function workRouteOf(pathname: string): string {
	for (const [pattern, template] of WORK_ROUTES)
		if (pattern.test(pathname)) return template;
	return "unmatched";
}

// The org and principal ride the bearer token ("Bearer <org> <principal>");
// derive both from the Authorization header instead of the path for work
// routes. The public board endpoint is unauthenticated — never a principal.
function bearerParts(
	headers: Record<string, string | string[] | undefined>,
): { org: string; principal: string } | undefined {
	const raw = headers.authorization;
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (typeof value !== "string" || value.length === 0) return undefined;
	const token = value.replace(/^Bearer\s+/i, "").trim();
	const [org, principal = ""] = token.split(" ");
	if (!org) return undefined;
	return { org, principal };
}

function workOrgOf(
	_pathname: string,
	headers: Record<string, string | string[] | undefined>,
): string | undefined {
	return bearerParts(headers)?.org;
}

function workPrincipalOf(
	pathname: string,
	headers: Record<string, string | string[] | undefined>,
): string | undefined {
	if (pathname.startsWith("/api/public/")) return undefined;
	if (!WORK_ROUTES.some(([pattern]) => pattern.test(pathname)))
		return undefined;
	return bearerParts(headers)?.principal || undefined;
}

// --- Body schemas (mirror of the contract request schemas) -----------------------------------
const CreateBoardBody = Schema.Struct({
	name: Schema.NonEmptyString,
	slug: Schema.optional(Schema.String),
	icon: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
});
const UpdateBoardBody = Schema.Struct({
	name: Schema.optional(Schema.String),
	icon: Schema.optional(Schema.NullOr(Schema.String)),
	description: Schema.optional(Schema.NullOr(Schema.String)),
	taskStatusOrder: Schema.optional(Schema.Array(Schema.String)),
	backlogStatusOrder: Schema.optional(Schema.Array(Schema.String)),
	defaultAssigneeId: Schema.optional(Schema.NullOr(Schema.String)),
	defaultAssigneeTeamId: Schema.optional(Schema.NullOr(Schema.String)),
});
const PutKeyBody = Schema.Struct({ key: Schema.String });
const CreateStatusBody = Schema.Struct({
	name: Schema.NonEmptyString,
	slug: Schema.optional(Schema.String),
	position: Schema.optional(Schema.Number),
	icon: Schema.optional(Schema.String),
	color: Schema.optional(Schema.String),
	isFinal: Schema.optional(Schema.Boolean),
});
const UpdateStatusBody = Schema.Struct({
	name: Schema.optional(Schema.String),
	icon: Schema.optional(Schema.NullOr(Schema.String)),
	color: Schema.optional(Schema.NullOr(Schema.String)),
	position: Schema.optional(Schema.Number),
	isFinal: Schema.optional(Schema.Boolean),
});
const ReorderStatusesBody = Schema.Struct({ ids: Schema.Array(Schema.String) });
const CreateTicketBody = Schema.Struct({
	title: Schema.NonEmptyString,
	description: Schema.optional(Schema.String),
	status: Schema.optional(Schema.String),
	priority: Schema.optional(Schema.String),
	assigneeId: Schema.optional(Schema.NullOr(Schema.String)),
	teamId: Schema.optional(Schema.NullOr(Schema.String)),
	startDate: Schema.optional(Schema.NullOr(Schema.String)),
	dueDate: Schema.optional(Schema.NullOr(Schema.String)),
	labels: Schema.optional(Schema.Array(Schema.String)),
	templateId: Schema.optional(Schema.String),
});
const UpdateTicketBody = Schema.Struct({
	title: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
	priority: Schema.optional(Schema.String),
	assigneeId: Schema.optional(Schema.NullOr(Schema.String)),
	teamId: Schema.optional(Schema.NullOr(Schema.String)),
	startDate: Schema.optional(Schema.NullOr(Schema.String)),
	dueDate: Schema.optional(Schema.NullOr(Schema.String)),
});
const PutStatusBody = Schema.Struct({ status: Schema.String });
const MoveBody = Schema.Struct({
	boardId: Schema.String,
	status: Schema.optional(Schema.String),
	position: Schema.optional(Schema.Number),
});
const ReorderTicketsBody = Schema.Struct({
	updates: Schema.Array(
		Schema.Struct({
			id: Schema.String,
			position: Schema.Number,
			status: Schema.optional(Schema.String),
		}),
	),
});
const BulkBody = Schema.Struct({
	ids: Schema.Array(Schema.String),
	patch: Schema.Struct({
		status: Schema.optional(Schema.String),
		priority: Schema.optional(Schema.String),
		assigneeId: Schema.optional(Schema.NullOr(Schema.String)),
		teamId: Schema.optional(Schema.NullOr(Schema.String)),
	}),
});
const ArchiveBody = Schema.Struct({ archived: Schema.Boolean });
const CreateLabelBody = Schema.Struct({
	name: Schema.NonEmptyString,
	color: Schema.String,
	taskId: Schema.optional(Schema.String),
	organizationId: Schema.optional(Schema.String),
});
const UpdateLabelBody = Schema.Struct({
	name: Schema.optional(Schema.String),
	color: Schema.optional(Schema.String),
});
const PutLabelTaskBody = Schema.Struct({
	taskId: Schema.optional(Schema.String),
});
const CreateTemplateBody = Schema.Struct({
	organizationId: Schema.String,
	name: Schema.String,
	data: Schema.Unknown,
});
const UpdateTemplateBody = Schema.Struct({
	name: Schema.optional(Schema.String),
	data: Schema.optional(Schema.Unknown),
});
const CreateFlagTypeBody = Schema.Struct({
	boardId: Schema.String,
	name: Schema.NonEmptyString,
	color: Schema.optional(Schema.String),
	icon: Schema.optional(Schema.String),
	position: Schema.optional(Schema.Number),
});
const UpdateFlagTypeBody = Schema.Struct({
	name: Schema.optional(Schema.String),
	color: Schema.optional(Schema.NullOr(Schema.String)),
	icon: Schema.optional(Schema.NullOr(Schema.String)),
	position: Schema.optional(Schema.Number),
});
const CreateFlagBody = Schema.Struct({
	flagTypeId: Schema.String,
	targetUserId: Schema.optional(Schema.String),
	targetTeamId: Schema.optional(Schema.String),
	note: Schema.optional(Schema.String),
});
const ResolveBody = Schema.Struct({ note: Schema.NonEmptyString });
