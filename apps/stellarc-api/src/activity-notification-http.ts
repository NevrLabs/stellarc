import {
	HttpApiBuilder,
	type HttpServerRequest,
	HttpServerResponse,
} from "@effect/platform";
import {
	Cause,
	Effect,
	Exit,
	type Layer,
	Layer as LayerValue,
	Schema,
} from "effect";
import type { Sql } from "postgres";
import {
	CommentContent,
	ExpectedUpdate,
	OrgRuleUpsert,
	OrgScopeBody,
	PreferenceUpdate,
	StellarcApi,
	WorkflowRuleUpsert,
} from "../../../packages/contracts/src/activity-notifications";
import {
	createComment,
	deleteComment,
	type TicketScopeResolver,
	updateComment,
} from "../../../packages/domain/src/activity";
import {
	DomainConflict,
	DomainForbidden,
	DomainNotFound,
	DomainValidation,
	encodeActivityRow,
	type OutboxWriter,
} from "../../../packages/domain/src/activity-events";
import {
	deleteOrganizationRule,
	getPreferences,
	updatePreferences,
	upsertOrganizationRule,
} from "../../../packages/domain/src/notification-preferences";
import type { NotificationSecrets } from "../../../packages/domain/src/notification-secrets";
import {
	clearAllNotifications,
	deleteNotification,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	unreadCount,
} from "../../../packages/domain/src/notifications";
import {
	deleteWorkflowRule,
	listWorkflowRules,
	upsertWorkflowRule,
	type WorkflowDeps,
} from "../../../packages/domain/src/workflow-rules";

const CommentUpdatePayload = Schema.Struct({
	...CommentContent.fields,
	...ExpectedUpdate.fields,
});

/**
 * §3 HTTP surface for STL-17 (T27). The foundation group handler stays in
 * http.ts; this module binds the activity/notification/preference/workflow
 * group and composes both APIs into one web handler. Authentication and
 * permission decisions arrive through the injected `auth` seam (STL-15);
 * ticket/board/crypto bindings arrive with the owning slices' merges.
 */

export type AuthDecision =
	| { readonly ok: true; readonly principal: string }
	| { readonly ok: false; readonly status: 401 | 404 };

export interface StellarcDeps {
	readonly sql: Sql;
	/**
	 * Authenticate + authorize a request. Org routes pass the path org (404 on
	 * foreign/forbidden, §3); self-scoped routes pass "" (401 when absent).
	 */
	readonly auth: (
		org: string,
		headers: Readonly<Record<string, string>>,
	) => AuthDecision;
	/** STL-16 seam: ticket scope resolution (production binding at merge). */
	readonly tickets: TicketScopeResolver;
	/** Mention parsing is server-side policy, never caller input (§2). */
	readonly parseMentions: (content: string) => string[];
	/** Recipient resolution inside the producing transaction (§2). */
	readonly resolveRecipients: (args: {
		tx: Sql;
		scope: {
			ticketId: string;
			boardId: string;
			assigneeUserId: string | null;
			canUpdate: boolean;
			canView: boolean;
		};
		actor: { principalId: string; userId: string };
		mentions: string[];
	}) => Promise<string[]>;
	/** Durable outbox writer (§2; must enqueue inside the comment transaction). */
	readonly outbox: OutboxWriter;
	/** Preference deps (STL-15 membership + STL-16 board seams, crypto Layer). */
	readonly preferenceDeps: {
		readonly secrets: NotificationSecrets;
		readonly emailAddress: string | null;
		readonly isMember: (userId: string, orgId: string) => Promise<boolean>;
		readonly boardInOrg: (orgId: string, boardIds: string[]) => Promise<number>;
	};
	/** Workflow deps (STL-16 board/status seams). */
	readonly workflowDeps: WorkflowDeps;
}

/** Effect.tryPromise wraps thrown domain errors in UnknownException (.cause);
 * the wrapper is not an Error subclass, so unwrap by property. */
const unwrap = (error: unknown): unknown => {
	const cause = (error as { cause?: unknown } | null)?.cause;
	return cause instanceof Error ? cause : error;
};

const statusOf = (error: unknown): number => {
	const e = unwrap(error);
	if (e instanceof DomainValidation) return 400;
	if (e instanceof DomainForbidden) return 403;
	if (e instanceof DomainNotFound) return 404;
	if (e instanceof DomainConflict) return 409;
	return 500;
};

const errorBody = (error: unknown): Record<string, unknown> => {
	const e = unwrap(error);
	if (e instanceof DomainValidation)
		return { _tag: "ValidationError", code: e.code };
	if (e instanceof DomainForbidden) return { _tag: "Forbidden" };
	if (e instanceof DomainNotFound) return { _tag: "NotFound" };
	if (e instanceof DomainConflict) return { _tag: "Conflict", code: e.code };
	return { _tag: "InternalError", message: "Internal server error" };
};

const reply = (
	status: number,
	body: Record<string, unknown>,
): HttpServerResponse.HttpServerResponse =>
	HttpServerResponse.unsafeJson(body, {
		status,
		headers: { "cache-control": "no-store" },
	});

const ok = (body: unknown): HttpServerResponse.HttpServerResponse =>
	HttpServerResponse.unsafeJson(body, {
		headers: { "cache-control": "no-store" },
	});

const headersOf = (
	request: HttpServerRequest.HttpServerRequest,
): Record<string, string> => request.headers as Record<string, string>;

type PayloadResult<T> =
	| { readonly ok: true; readonly value: T }
	| {
			readonly ok: false;
			readonly response: HttpServerResponse.HttpServerResponse;
	  };

/**
 * §3 request decoding: JSON parse failure, non-object bodies, excess keys and
 * schema violations all return 400 ValidationError; the decoded value is the
 * contract type. No SQL/PII is echoed back.
 */
async function readPayload<S extends Schema.Schema<any, any, never>>(
	request: HttpServerRequest.HttpServerRequest,
	schema: S,
	allowed: readonly string[],
): Promise<PayloadResult<Schema.Schema.Type<S>>> {
	let raw: unknown;
	try {
		raw = await Effect.runPromise(request.json);
	} catch {
		return {
			ok: false,
			response: reply(400, { _tag: "ValidationError", code: "invalidJson" }),
		};
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw))
		return {
			ok: false,
			response: reply(400, { _tag: "ValidationError", code: "invalidBody" }),
		};
	const extras = Object.keys(raw).filter((k) => !allowed.includes(k));
	if (extras.length > 0)
		return {
			ok: false,
			response: reply(400, { _tag: "ValidationError", code: "excessKey" }),
		};
	try {
		const decode = Schema.decodeUnknownSync(schema as Schema.Schema<unknown>);
		return { ok: true, value: decode(raw) as Schema.Schema.Type<S> };
	} catch {
		return {
			ok: false,
			response: reply(400, { _tag: "ValidationError", code: "schema" }),
		};
	}
}

function parseLimit(url: URL):
	| { readonly ok: true; readonly limit: number }
	| {
			readonly ok: false;
			readonly response: HttpServerResponse.HttpServerResponse;
	  } {
	const raw = url.searchParams.get("limit");
	if (raw === null) return { ok: true, limit: 100 };
	const limit = Number(raw);
	if (!Number.isInteger(limit) || limit < 1 || limit > 200)
		return {
			ok: false,
			response: reply(400, { _tag: "ValidationError", code: "limit" }),
		};
	return { ok: true, limit };
}

const runDomain = async <A>(effect: Effect.Effect<A, unknown>): Promise<A> => {
	// runPromiseExit + squash keeps the original domain error identity
	// (runPromise would wrap it in FiberFailure and hide the 4xx mapping).
	const exit = await Effect.runPromiseExit(effect as Effect.Effect<A, unknown>);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
};

export function activityNotificationGroup(deps: StellarcDeps) {
	return HttpApiBuilder.group(
		StellarcApi,
		"activity-notifications",
		(handlers) =>
			handlers
				.handleRaw("activity-list", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth(path.org, headersOf(request));
						if (!auth.ok)
							return reply(auth.status, {
								_tag: auth.status === 401 ? "Unauthenticated" : "NotFound",
							});
						const url = new URL(request.url, "http://localhost");
						const lim = parseLimit(url);
						if (!lim.ok) return lim.response;
						const limit = lim.limit;
						const actor = {
							principalId: auth.principal,
							userId: auth.principal,
						};
						const scope = yield* Effect.tryPromise(() =>
							deps.tickets.resolve(path.org, path.ticket, actor),
						).pipe(Effect.catchAll(() => Effect.succeed(null)));
						// Foreign org/resource uses the same 404 as missing (§3).
						if (!scope || !scope.canView)
							return reply(404, { _tag: "NotFound" });
						const cursor = url.searchParams.get("cursor");
						const rows = yield* Effect.tryPromise(() => {
							const cursorFilter = cursor
								? (() => {
										const sep = cursor.lastIndexOf(":");
										if (sep <= 0) throw new DomainValidation("cursor");
										const ts = new Date(cursor.slice(0, sep));
										if (Number.isNaN(ts.getTime()))
											throw new DomainValidation("cursor");
										return deps.sql` AND (p.created_at, p.id) < (${ts}, ${cursor.slice(sep + 1)})`;
									})()
								: deps.sql``;
							return deps.sql`
                SELECT p.id, p.org_id, p.ticket_id, p.type, p.created_at, p.updated_at,
                       p.user_id, p.content, p.edit_history, p.event_data,
                       p.external_user_name, p.external_user_avatar,
                       p.external_source, p.external_url,
                       u.name AS user_name, u.image AS user_image
                FROM activity_projection p
                LEFT JOIN "user" u ON u.id = p.user_id
                WHERE p.org_id = ${path.org} AND p.ticket_id = ${path.ticket}${cursorFilter}
                ORDER BY p.created_at DESC, p.id DESC
                LIMIT ${limit + 1}`;
						});
						const items = (rows as Record<string, unknown>[]).map((row) =>
							encodeActivityRow(
								row as never,
								row.user_id
									? {
											id: String(row.user_id),
											name: String(row.user_name ?? ""),
											image: (row.user_image as string | null) ?? null,
										}
									: null,
							),
						);
						let nextCursor: string | null = null;
						if (rows.length > limit && items.length > 0) {
							const last = items[items.length - 1];
							nextCursor = `${new Date(last.createdAt).toISOString()}:${last.id}`;
						}
						return ok({ items, nextCursor });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("comment-create", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth(path.org, headersOf(request));
						if (!auth.ok)
							return reply(auth.status, {
								_tag: auth.status === 401 ? "Unauthenticated" : "NotFound",
							});
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(request, CommentContent, ["content"]),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								createComment(deps.sql, {
									org: path.org,
									actor: {
										principalId: auth.principal,
										userId: auth.principal,
									},
									ticketId: path.ticket,
									content: parsed.value.content,
									outbox: deps.outbox,
									tickets: deps.tickets,
									parseMentions: deps.parseMentions,
									resolveRecipients: deps.resolveRecipients,
								}),
							),
						);
						return ok({ data: result.row, txid: result.txid });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("comment-update", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth(path.org, headersOf(request));
						if (!auth.ok)
							return reply(auth.status, {
								_tag: auth.status === 401 ? "Unauthenticated" : "NotFound",
							});
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(request, CommentUpdatePayload, [
								"content",
								"expectedUpdatedAt",
							]),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								updateComment(deps.sql, {
									org: path.org,
									actor: {
										principalId: auth.principal,
										userId: auth.principal,
									},
									ticketId: path.ticket,
									commentId: path.id,
									content: parsed.value.content,
									expectedUpdatedAt: new Date(parsed.value.expectedUpdatedAt),
									tickets: deps.tickets,
								}),
							),
						);
						return ok({ data: result.row, txid: result.txid });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("comment-delete", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth(path.org, headersOf(request));
						if (!auth.ok)
							return reply(auth.status, {
								_tag: auth.status === 401 ? "Unauthenticated" : "NotFound",
							});
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(request, ExpectedUpdate, ["expectedUpdatedAt"]),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								deleteComment(deps.sql, {
									org: path.org,
									actor: {
										principalId: auth.principal,
										userId: auth.principal,
									},
									ticketId: path.ticket,
									commentId: path.id,
									expectedUpdatedAt: new Date(parsed.value.expectedUpdatedAt),
									tickets: deps.tickets,
								}),
							),
						);
						return ok({ data: result.data, txid: result.txid });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("notification-list", ({ request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const url = new URL(request.url, "http://localhost");
						const lim = parseLimit(url);
						if (!lim.ok) return lim.response;
						const limit = lim.limit;
						const page = yield* Effect.tryPromise(() =>
							listNotifications(deps.sql, auth.principal, {
								limit,
								orgId: url.searchParams.get("orgId"),
								cursor: url.searchParams.get("cursor"),
							}),
						);
						return ok(page);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("notification-unread-count", ({ request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const url = new URL(request.url, "http://localhost");
						const count = yield* Effect.tryPromise(() =>
							unreadCount(
								deps.sql,
								auth.principal,
								url.searchParams.get("orgId"),
							),
						);
						return ok({ count });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("notification-read", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(request, Schema.Struct({}), []),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								markNotificationRead(deps.sql, auth.principal, path.id),
							),
						);
						return ok({ data: result.data, txid: result.txid });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("notification-read-all", ({ request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(request, OrgScopeBody, ["orgId"]),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								markAllNotificationsRead(
									deps.sql,
									auth.principal,
									parsed.value.orgId ?? null,
								),
							),
						);
						return ok(result);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("notification-clear-all", ({ request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(request, OrgScopeBody, ["orgId"]),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								clearAllNotifications(
									deps.sql,
									auth.principal,
									parsed.value.orgId ?? null,
								),
							),
						);
						return ok(result);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("notification-delete", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const result = yield* Effect.tryPromise(() =>
							runDomain(deleteNotification(deps.sql, auth.principal, path.id)),
						);
						return ok({ data: result.data, txid: result.txid });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("preference-get", ({ request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const data = yield* Effect.tryPromise(() =>
							runDomain(
								getPreferences(deps.sql, auth.principal, deps.preferenceDeps),
							),
						);
						return ok(data);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("preference-put", ({ request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(
								request,
								PreferenceUpdate,
								Object.keys(PreferenceUpdate.fields),
							),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								updatePreferences(
									deps.sql,
									auth.principal,
									parsed.value as Parameters<typeof updatePreferences>[2],
									deps.preferenceDeps,
								),
							),
						);
						return ok(result);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("preference-org-upsert", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(
								request,
								OrgRuleUpsert,
								Object.keys(OrgRuleUpsert.fields),
							),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								upsertOrganizationRule(
									deps.sql,
									auth.principal,
									path.org,
									parsed.value as Parameters<typeof upsertOrganizationRule>[3],
									deps.preferenceDeps,
								),
							),
						);
						return ok(result);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("preference-org-delete", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth("", headersOf(request));
						if (!auth.ok) return reply(401, { _tag: "Unauthenticated" });
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								deleteOrganizationRule(
									deps.sql,
									auth.principal,
									path.org,
									deps.preferenceDeps,
								),
							),
						);
						return ok(result);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("workflow-list", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth(path.org, headersOf(request));
						if (!auth.ok)
							return reply(auth.status, {
								_tag: auth.status === 401 ? "Unauthenticated" : "NotFound",
							});
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								listWorkflowRules(
									deps.sql,
									path.org,
									path.board,
									auth.principal,
									deps.workflowDeps,
								),
							),
						);
						return ok(result);
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("workflow-upsert", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth(path.org, headersOf(request));
						if (!auth.ok)
							return reply(auth.status, {
								_tag: auth.status === 401 ? "Unauthenticated" : "NotFound",
							});
						const parsed = yield* Effect.tryPromise(() =>
							readPayload(
								request,
								WorkflowRuleUpsert,
								Object.keys(WorkflowRuleUpsert.fields),
							),
						);
						if (!parsed.ok) return parsed.response;
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								upsertWorkflowRule(deps.sql, deps.workflowDeps, {
									org: path.org,
									boardId: path.board,
									actor: auth.principal,
									integrationType: parsed.value.integrationType,
									eventType: parsed.value.eventType,
									statusId: parsed.value.statusId,
								}),
							),
						);
						return ok({ data: result.data, txid: result.txid });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				)
				.handleRaw("workflow-delete", ({ path, request }) =>
					Effect.gen(function* () {
						const auth = deps.auth(path.org, headersOf(request));
						if (!auth.ok)
							return reply(auth.status, {
								_tag: auth.status === 401 ? "Unauthenticated" : "NotFound",
							});
						const result = yield* Effect.tryPromise(() =>
							runDomain(
								deleteWorkflowRule(deps.sql, deps.workflowDeps, {
									org: path.org,
									boardId: path.board,
									ruleId: path.id,
									actor: auth.principal,
								}),
							),
						);
						return ok({ data: result.data, txid: result.txid });
					}).pipe(
						Effect.catchAll((error) =>
							Effect.succeed(reply(statusOf(error), errorBody(error))),
						),
					),
				),
	);
}

// --- Composition: foundation group + this slice's group on one handler -------
// (§5: both APIs mount on the single StellarcApi web handler used by
// production main.ts and the test server.)

/** Composed args for the composed handler (test server + production main). */
export interface ComposeArgs {
	readonly sql: Sql;
	readonly engine: unknown;
	readonly authorize: (
		org: string,
		headers: Readonly<Record<string, string>>,
		principal?: string,
	) => "ok" | "unauthenticated" | "forbidden";
	readonly healthQuery?: Effect.Effect<unknown, unknown> | undefined;
	readonly telemetry: Layer.Layer<never>;
	readonly memoMap?: Layer.MemoMap;
	readonly principalFrom: (org: string, authorization?: string) => string;
	/** Resolves the authenticated USER id for self-scoped routes ("" none). */
	readonly selfAuth?: (authorization?: string) => string;
	readonly activity: {
		readonly tickets: TicketScopeResolver;
		readonly parseMentions: (content: string) => string[];
		readonly resolveRecipients: (args: {
			tx: Sql;
			scope: {
				ticketId: string;
				boardId: string;
				assigneeUserId: string | null;
				canUpdate: boolean;
				canView: boolean;
			};
			actor: { principalId: string; userId: string };
			mentions: string[];
		}) => Promise<string[]>;
		readonly outbox: OutboxWriter;
		readonly preferenceDeps: {
			readonly secrets: NotificationSecrets;
			readonly emailAddress: string | null;
			readonly isMember: (userId: string, orgId: string) => Promise<boolean>;
			readonly boardInOrg: (
				orgId: string,
				boardIds: string[],
			) => Promise<number>;
		};
		readonly workflowDeps: WorkflowDeps;
	};
}

export async function composeStellarcHandler(args: ComposeArgs) {
	const { foundationGroup } = await import("./http");
	const group = activityNotificationGroup({
		sql: args.sql,
		auth: (org, headers) => {
			if (org !== "") {
				const principal = args.principalFrom(org, headers.authorization);
				const decision = args.authorize(org, headers, principal);
				if (decision === "unauthenticated") return { ok: false, status: 401 };
				if (decision !== "ok") return { ok: false, status: 404 };
				return { ok: true, principal };
			}
			const self = args.selfAuth
				? args.selfAuth(headers.authorization)
				: args.principalFrom("", headers.authorization);
			if (!self) return { ok: false, status: 401 };
			return { ok: true, principal: self };
		},
		tickets: args.activity.tickets,
		parseMentions: args.activity.parseMentions,
		resolveRecipients: args.activity.resolveRecipients,
		outbox: args.activity.outbox,
		preferenceDeps: args.activity.preferenceDeps,
		workflowDeps: args.activity.workflowDeps,
	});
	return HttpApiBuilder.toWebHandler(
		LayerValue.mergeAll(
			HttpApiBuilder.api(StellarcApi).pipe(
				LayerValue.provide(
					foundationGroup({
						sql: args.sql,
						engine: args.engine as never,
						authorize: args.authorize,
						healthQuery: args.healthQuery,
						principalFrom: args.principalFrom,
					}),
				),
				LayerValue.provide(group),
			),
			// biome-ignore lint/suspicious/noExplicitAny: layer variance at the compose seam
			LayerValue.empty,
			args.telemetry as never,
		) as never,
		{ memoMap: args.memoMap },
	);
}
