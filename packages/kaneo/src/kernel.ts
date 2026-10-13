/**
 * Effect kernel for the Kaneo-compatible domain.
 *
 * - `Db`: drizzle over @effect/sql-pg (every query is an Effect, traced,
 *   SqlError-typed) using the exact Kaneo schema, so reads/writes are
 *   byte-compatible with the legacy tree during the strangler migration.
 * - `CurrentUser`: the authenticated principal for one request.
 * - `Access`: organization membership, org permissions and resource
 *   privileges — the same rules as kaneo-legacy's middlewares, as Effects.
 */

import { PgClient } from "@effect/sql-pg";
import { HttpServerRequest } from "effect/http";
import { HttpApiMiddleware } from "effect/http-api";
import { SqlClient } from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
import { make as makeDrizzle } from "../../drizzle-effect/src/index";
import { and, eq, sql } from "drizzle-orm";
import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import { Context, Effect, Layer, Redacted } from "effect";
import { builtInRoles } from "../../contracts/src/legacy/permissions/index";
import * as relations from "../../kaneo-legacy/src/database/relations";
import * as tables from "../../kaneo-legacy/src/database/schema";

/** Tables + relations: relational queries (`db.query.x.findMany({ with })`)
 * need both, exactly as Kaneo's drizzle instance is built. */
export const schema = { ...tables, ...relations };
export type KaneoSchema = typeof schema;
export type Database = PgRemoteDatabase<KaneoSchema>;

export class Db extends Context.Service<Db, Database>()("stellarc/kaneo/Db") {}

export const DbLive = (url: string) =>
	Layer.effect(Db, makeDrizzle({ schema })).pipe(
		Layer.provideMerge(
			PgClient.layer({
				url: Redacted.make(url),
				maxConnections: 10,
				applicationName: "stellarc-kaneo",
			}),
		),
	);

/** Run an Effect in one PG transaction. drizzle's Effect bridge resolves the
 * connection from the fiber context, so every query inside participates. */
export const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	Effect.flatMap(SqlClient, (sql) => sql.withTransaction(effect));

/** Infrastructure faults become defects (500); domain errors stay typed. */
export const sqlDie = <A, E, R>(
	effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, SqlError>, R> =>
	Effect.catchIf(
		effect,
		(e): e is Extract<E, SqlError> =>
			typeof e === "object" &&
			e !== null &&
			(e as { _tag?: unknown })._tag === "SqlError",
		(e) => Effect.die(e),
	) as Effect.Effect<A, Exclude<E, SqlError>, R>;

export {
	BadRequest,
	Conflict,
	type DomainError,
	Forbidden,
	NotFound,
	Unauthorized,
} from "./errors";

import { BadRequest, Forbidden, NotFound, Unauthorized } from "./errors";

// ── principal ───────────────────────────────────────────────────────────────
export interface Principal {
	readonly userId: string;
	readonly userRole: string | null;
	readonly apiKey: {
		readonly id: string;
		readonly permissions: Record<string, string[]> | null;
		readonly metadata: Record<string, unknown> | null;
	} | null;
}
export class CurrentUser extends Context.Service<CurrentUser, Principal>()(
	"stellarc/kaneo/CurrentUser",
) {}

/** Resolves the principal from the raw request (BetterAuth session cookie,
 * bearer session, or API key). Provided by the host; the kernel stays
 * independent of BetterAuth's module graph. */
export class PrincipalResolver extends Context.Service<
	PrincipalResolver,
	(headers: Headers) => Promise<Principal | null | "malformed">
>()("stellarc/kaneo/PrincipalResolver") {}

/** HttpApi middleware: every Kaneo endpoint requires a principal. */
export class Authentication extends HttpApiMiddleware.Service<
	Authentication,
	{ provides: CurrentUser }
>()("stellarc/kaneo/Authentication", { error: Unauthorized }) {}

export const AuthenticationLive = Layer.effect(
	Authentication,
	Effect.gen(function* () {
		const resolve = yield* PrincipalResolver;
		return Effect.fn("Kaneo.authenticate")(function* (httpEffect) {
			const request = yield* HttpServerRequest.HttpServerRequest;
			const headers = new Headers(request.headers as Record<string, string>);
			const principal = yield* Effect.promise(() => resolve(headers));
			if (!principal || principal === "malformed")
				return yield* new Unauthorized({ message: "Unauthorized" });
			yield* Effect.annotateCurrentSpan(
				"stellarc.principal.kind",
				principal.apiKey ? "apikey" : "user",
			);
			return yield* Effect.provideService(httpEffect, CurrentUser, principal);
		});
	}),
);

/** Side-effect ports the native handlers share with not-yet-migrated
 * consumers (WS push, notifications, integration plugins). The host binds
 * them to the legacy in-process bus; the parity test binds the same. */
export interface DomainPorts {
	readonly publish: (event: string, data: unknown) => Promise<void>;
	readonly labelSync: {
		readonly upsert: (
			taskId: string,
			name: string,
			color: string,
		) => Promise<void>;
		readonly remove: (
			taskId: string,
			name: string,
			alsoGitea: boolean,
		) => Promise<void>;
	};
}
export class DomainEvents extends Context.Service<DomainEvents, DomainPorts>()(
	"stellarc/kaneo/DomainEvents",
) {}

/** Fire-and-forget like Kaneo: integration sync failures never fail the
 * request, but they are logged inside the request span. */
export const detach = (label: string, f: () => Promise<void>) =>
	Effect.tryPromise(f).pipe(
		Effect.catch((e) => Effect.logWarning(`${label} failed`, e)),
		Effect.forkDetach,
		Effect.asVoid,
	);

export const publish = (event: string, data: unknown) =>
	Effect.flatMap(DomainEvents, (p) =>
		Effect.promise(() => p.publish(event, data)),
	).pipe(Effect.withSpan("Kaneo.publish", { attributes: { event } }));

// ── access control (same rules as kaneo-legacy) ─────────────────────────────
export const PRIVILEGES = ["none", "view", "edit", "manage"] as const;
export type Privilege = (typeof PRIVILEGES)[number];
const rank = (p: string) => Math.max(0, PRIVILEGES.indexOf(p as Privilege));
export const privilegeAllows = (actual: Privilege, required: Privilege) =>
	rank(actual) >= rank(required);

const isAgentKey = (p: Principal) => p.apiKey?.metadata?.type === "agent";

const satisfies = (
	statements: Record<string, readonly string[]>,
	required: Record<string, string[]>,
) =>
	Object.entries(required).every(([resource, actions]) => {
		const granted = statements[resource];
		return !!granted && actions.every((a) => granted.includes(a));
	});

const parseStatements = (raw: string) => {
	try {
		const value = JSON.parse(raw) as unknown;
		if (!value || typeof value !== "object" || Array.isArray(value))
			return null;
		const out: Record<string, string[]> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>))
			if (Array.isArray(v)) {
				const acts = v.filter((x): x is string => typeof x === "string");
				if (acts.length) out[k] = acts;
			}
		return out;
	} catch {
		return null;
	}
};

export class Access extends Context.Service<Access>()("stellarc/kaneo/Access", {
	make: Effect.gen(function* () {
		const db = yield* Db;

		/** Org membership gate (validateOrganizationAccess). */
		const requireMember = Effect.fn("Access.requireMember")(function* (
			organizationId: string,
		) {
			const me = yield* CurrentUser;
			if (me.apiKey) {
				const [key] = yield* db
					.select({ metadata: schema.apikeyTable.metadata })
					.from(schema.apikeyTable)
					.where(
						and(
							eq(schema.apikeyTable.id, me.apiKey.id),
							eq(schema.apikeyTable.enabled, true),
						),
					)
					.limit(1);
				if (!key)
					return yield* new Forbidden({
						message: "Invalid API key for this organization",
					});
				const meta = me.apiKey.metadata;
				if (meta?.type === "agent" && meta.organizationId !== organizationId)
					return yield* new Forbidden({
						message: "Agent is not authorized for this organization",
					});
			}
			if (me.userRole === "admin") return "admin" as string;
			const [member] = yield* db
				.select({ role: schema.organizationMemberTable.role })
				.from(schema.organizationMemberTable)
				.where(
					and(
						eq(schema.organizationMemberTable.userId, me.userId),
						eq(schema.organizationMemberTable.organizationId, organizationId),
					),
				)
				.limit(1);
			if (!member)
				return yield* new Forbidden({
					message: "You don't have access to this organization",
				});
			return member.role;
		});

		/** Org permission statements (requireOrganizationPermission). */
		const requirePermission = Effect.fn("Access.requirePermission")(function* (
			organizationId: string,
			required: Record<string, string[]>,
		) {
			const me = yield* CurrentUser;
			if (
				!isAgentKey(me) &&
				me.apiKey?.permissions &&
				!satisfies(me.apiKey.permissions, required)
			)
				return yield* new Forbidden({ message: "Insufficient API key scope" });
			if (me.userRole === "admin") return;
			const [member] = yield* db
				.select({ role: schema.organizationMemberTable.role })
				.from(schema.organizationMemberTable)
				.where(
					and(
						eq(schema.organizationMemberTable.organizationId, organizationId),
						eq(schema.organizationMemberTable.userId, me.userId),
					),
				)
				.limit(1);
			if (!member?.role)
				return yield* new Forbidden({ message: "Insufficient permissions" });
			const [row] = yield* db
				.select({ permission: schema.organizationRoleTable.permission })
				.from(schema.organizationRoleTable)
				.where(
					and(
						eq(schema.organizationRoleTable.organizationId, organizationId),
						eq(schema.organizationRoleTable.role, member.role),
					),
				)
				.limit(1);
			const statements =
				(row?.permission ? parseStatements(row.permission) : null) ??
				((builtInRoles as Record<string, { statements: unknown }>)[member.role]
					?.statements as Record<string, readonly string[]> | undefined) ??
				null;
			if (!statements || !satisfies(statements, required))
				return yield* new Forbidden({ message: "Insufficient permissions" });
		});

		/** Effective privilege on one board (getResourcePrivilege, board kind). */
		const boardPrivilege = Effect.fn("Access.boardPrivilege")(function* (
			organizationId: string,
			boardId: string,
		) {
			const me = yield* CurrentUser;
			const [[member], [org], [board], grants, teams] = yield* Effect.all(
				[
					db
						.select({ role: schema.organizationMemberTable.role })
						.from(schema.organizationMemberTable)
						.where(
							and(
								eq(
									schema.organizationMemberTable.organizationId,
									organizationId,
								),
								eq(schema.organizationMemberTable.userId, me.userId),
							),
						)
						.limit(1),
					db
						.select({
							def: schema.organizationTable.defaultResourcePrivilege,
						})
						.from(schema.organizationTable)
						.where(eq(schema.organizationTable.id, organizationId))
						.limit(1),
					db
						.select({ orgPrivilege: schema.boardTable.orgPrivilege })
						.from(schema.boardTable)
						.where(
							and(
								eq(schema.boardTable.id, boardId),
								eq(schema.boardTable.organizationId, organizationId),
							),
						)
						.limit(1),
					db
						.select({
							privilege: schema.resourceGrantTable.privilege,
							teamId: schema.resourceGrantTable.teamId,
							userId: schema.resourceGrantTable.userId,
						})
						.from(schema.resourceGrantTable)
						.where(
							and(
								eq(schema.resourceGrantTable.organizationId, organizationId),
								eq(schema.resourceGrantTable.resourceType, "board"),
								eq(schema.resourceGrantTable.resourceId, boardId),
							),
						),
					db.execute(sql`
            WITH RECURSIVE effective_team(id, path, depth) AS (
              SELECT tm.team_id, ARRAY[tm.team_id], 1 FROM team_member tm WHERE tm.user_id = ${me.userId}
              UNION ALL
              SELECT t.parent_team_id, et.path || t.parent_team_id, et.depth + 1
                FROM team t JOIN effective_team et ON t.id = et.id
               WHERE t.parent_team_id IS NOT NULL AND NOT t.parent_team_id = ANY(et.path) AND et.depth < 16
            ) SELECT DISTINCT id FROM effective_team`),
				],
				{ concurrency: "unbounded" },
			);
			if (
				me.userRole === "admin" ||
				member?.role === "owner" ||
				member?.role === "admin"
			)
				return "manage" as Privilege;
			if (!member) return "none" as Privilege;
			const teamIds = new Set(
				(teams as unknown as { rows?: Array<{ id: string }> }).rows?.map(
					(r) => r.id,
				) ?? (teams as unknown as Array<{ id: string }>).map((r) => r.id),
			);
			const applicable = grants
				.filter(
					(g) =>
						g.userId === me.userId ||
						(g.teamId !== null && teamIds.has(g.teamId)),
				)
				.map((g) => g.privilege as Privilege);
			if (applicable.length)
				return applicable.reduce((a, b) => (rank(b) > rank(a) ? b : a));
			const candidate = board?.orgPrivilege ?? org?.def ?? "manage";
			return (PRIVILEGES as readonly string[]).includes(candidate)
				? (candidate as Privilege)
				: "manage";
		});

		/** Resolve a board's org, check membership + privilege (fromBoard). */
		const guardBoard = Effect.fn("Access.guardBoard")(function* (
			boardId: string,
			required: "view" | "edit",
		) {
			const [board] = yield* db
				.select({ organizationId: schema.boardTable.organizationId })
				.from(schema.boardTable)
				.where(eq(schema.boardTable.id, boardId))
				.limit(1);
			if (!board)
				return yield* new BadRequest({
					message: "Organization ID could not be determined",
				});
			yield* requireMember(board.organizationId);
			const privilege = yield* boardPrivilege(board.organizationId, boardId);
			if (!privilegeAllows(privilege, required))
				return yield* new NotFound({ message: "Board not found" });
			return board.organizationId;
		});

		/** Resolve an org from a lookup and check membership (fromLabel/fromParam):
		 * unresolvable ids fall back to an explicit organizationId, else 400. */
		const guardOrg = Effect.fn("Access.guardOrg")(function* (
			resolved: string | null | undefined,
			fallbackOrganizationId?: string,
		) {
			const organizationId = resolved || fallbackOrganizationId || null;
			if (!organizationId)
				return yield* new BadRequest({
					message: "Organization ID could not be determined",
				});
			yield* requireMember(organizationId);
			return organizationId;
		});

		/** fromTaskId: task -> board -> org, plus board privilege. */
		const guardTask = Effect.fn("Access.guardTask")(function* (
			taskId: string,
			required: "view" | "edit",
			fallbackOrganizationId?: string,
		) {
			const [row] = yield* db
				.select({
					boardId: schema.taskTable.boardId,
					organizationId: schema.boardTable.organizationId,
				})
				.from(schema.taskTable)
				.innerJoin(
					schema.boardTable,
					eq(schema.taskTable.boardId, schema.boardTable.id),
				)
				.where(eq(schema.taskTable.id, taskId))
				.limit(1);
			const organizationId = yield* guardOrg(
				row?.organizationId,
				fallbackOrganizationId,
			);
			if (!row) return yield* new NotFound({ message: "Resource not found" });
			const privilege = yield* boardPrivilege(organizationId, row.boardId);
			if (!privilegeAllows(privilege, required))
				return yield* new NotFound({ message: "Board not found" });
			return organizationId;
		});

		return {
			requireMember,
			requirePermission,
			boardPrivilege,
			guardBoard,
			guardOrg,
			guardTask,
		} as const;
	}),
}) {
	static readonly layer = Layer.effect(Access, Access.make);
}
