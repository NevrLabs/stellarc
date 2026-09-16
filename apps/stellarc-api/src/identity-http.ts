import { Schema } from "effect";
import type { Sql } from "postgres";
import {
	ActiveOrgRequest,
	AddTeamMemberRequest,
	CreateApiKeyRequest,
	CreateInvitationRequest,
	CreateOrganizationRequest,
	CreateRoleRequest,
	CreateTeamRequest,
	UpdateMemberRequest,
	UpdateOrganizationRequest,
	UpdateRoleRequest,
	UpdateTeamRequest,
} from "../../../packages/contracts/src/identity/http";
import { humanPrincipalId } from "../../../packages/domain/src/identity/auth";
import {
	effectiveCapabilities,
	type PrincipalContext,
} from "../../../packages/domain/src/identity/capabilities";
import {
	acceptInvitation,
	addTeamMember,
	cancelInvitation,
	createApiKey,
	createInvitation,
	createRole,
	createTeam,
	deleteApiKey,
	deleteRole,
	deleteTeam,
	removeMember,
	removeTeamMember,
	updateMemberRole,
	updateOrganization,
	updateRole,
	updateTeam,
} from "../../../packages/domain/src/identity/mutations";
import { orgRouter } from "../../../packages/domain/src/identity/org-router";
import { resolveRequestContext, sessionTokenValue } from "./identity-context";
import { identityTracer, type TracerLike } from "./identity-trace";

// STL-15 §3: identity HTTP surface. Every route decodes through the §3
// schemas (excess write keys rejected, bounded lengths), answers in the
// domain envelopes (mutations carry txid after commit) and never leaks SQL
// errors. Foreign-org identifiers return the same 404 as absent entities
// AFTER authentication; unsupported paths 404; unsupported methods 405.

interface AuthLike {
	handler:
		| ((request: Request) => Promise<Response>)
		| Promise<(request: Request) => Promise<Response>>
		| { fetch: (request: Request) => Promise<Response> };
}

type ErrorBody =
	| { _tag: "ValidationError"; message: string }
	| { _tag: "Unauthenticated" }
	| { _tag: "Forbidden" }
	| { _tag: "NotFound" }
	| { _tag: "Conflict"; code: string }
	| { _tag: "RateLimited"; retryAfterSeconds: number }
	| { _tag: "Unavailable" };

const NO_STORE = { "cache-control": "no-store" };

function json(
	body: unknown,
	status: number,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...NO_STORE, ...headers },
	});
}

function errorResponse(
	tag: ErrorBody["_tag"],
	status: number,
	extra: Record<string, unknown> = {},
): Response {
	return json({ _tag: tag, ...extra }, status);
}

const ID_MAX = 128;

function validId(value: unknown): value is string {
	return (
		typeof value === "string" && value.length > 0 && value.length <= ID_MAX
	);
}

function validName(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 256;
}

// D10: slug is bounded exactly like name (§3 bounded names ≤256).
const validSlug = validName;

// §3 Permission = Record(nonempty resource, Array(nonempty action)),
// validated against the pinned vocabulary — unknown capability rejected.

function manageCapability(
	caps: ReadonlySet<string>,
	capability: string,
): Response | null {
	return caps.has(capability) ? null : errorResponse("Forbidden", 403);
}

function principalContext(
	ctx: import("./identity-context").RequestContext,
): PrincipalContext {
	return {
		principalId: ctx.principalId,
		kind: ctx.kind,
		userId: ctx.userId,
		keyCeiling: ctx.keyCeiling,
		apikeyId: ctx.apikeyId,
	};
}

/** D8 (§3): write bodies decode through the contracts request schemas —
 * excess properties are REJECTED, not dropped, and invalid shapes become
 * ValidationError 400 before any handler logic runs. */
function decodeBody<A, I>(
	schema: Schema.Schema<A, I>,
	body: unknown,
): A | null {
	const result = Schema.decodeUnknownEither(schema, {
		onExcessProperty: "error",
	})(body);
	return result._tag === "Right" ? result.right : null;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const parsed: unknown = await request.json();
		if (parsed === null || typeof parsed !== "object") return {};
		return parsed as Record<string, unknown>;
	} catch {
		return {};
	}
}

function toIso(value: Date | string | null | undefined): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

// --- row projectors (snake_case -> camelCase public allowlists) ----------------

function pickUserPublic(row: {
	id: string;
	name: string;
	email: string;
	image: string | null;
}) {
	return { id: row.id, name: row.name, email: row.email, image: row.image };
}

interface OrgRow {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: string | null;
	description: string | null;
	repos_enabled: boolean;
	tables_enabled: boolean;
	work_enabled: boolean;
	default_resource_privilege: string;
	ai_enabled: boolean;
	ai_default_token_limit: number;
	ai_default_character_limit: number;
	ai_provider_base_url: string | null;
	ai_provider_model: string | null;
	created_at: Date | string;
}

function orgPublic(row: OrgRow) {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		logo: row.logo,
		metadata: row.metadata,
		description: row.description,
		reposEnabled: row.repos_enabled,
		tablesEnabled: row.tables_enabled,
		workEnabled: row.work_enabled,
		defaultResourcePrivilege: row.default_resource_privilege,
		aiEnabled: row.ai_enabled,
		aiDefaultTokenLimit: row.ai_default_token_limit,
		aiDefaultCharacterLimit: row.ai_default_character_limit,
		aiProviderBaseUrl: row.ai_provider_base_url,
		aiProviderModel: row.ai_provider_model,
		createdAt: toIso(row.created_at),
	};
}

interface RoleRow {
	id: string;
	organization_id: string;
	role: string;
	permission: string;
	created_at: Date | string;
	updated_at: Date | string;
}

function rolePublic(row: RoleRow) {
	let permission: Record<string, string[]> = {};
	try {
		const parsed: unknown = JSON.parse(row.permission);
		if (parsed && typeof parsed === "object")
			permission = parsed as Record<string, string[]>;
	} catch {
		permission = {};
	}
	return {
		id: row.id,
		organizationId: row.organization_id,
		role: row.role,
		permission,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at),
	};
}

interface TeamRow {
	id: string;
	name: string;
	organization_id: string;
	source: string;
	icon: string | null;
	parent_team_id: string | null;
	created_at: Date | string;
	updated_at: Date | string | null;
}

function teamPublic(row: TeamRow) {
	return {
		id: row.id,
		name: row.name,
		organizationId: row.organization_id,
		source: row.source,
		icon: row.icon,
		parentTeamId: row.parent_team_id,
		createdAt: toIso(row.created_at),
		updatedAt: row.updated_at === null ? null : toIso(row.updated_at),
	};
}

// --- route table (D9: 405 + Allow on known paths) -------------------------------

const ROUTES: Array<{ method: string; segments: string[] }> = [
	{ method: "POST", segments: ["active-org"] },
	{ method: "GET", segments: ["active-organization"] },
	{ method: "GET", segments: ["organizations"] },
	{ method: "POST", segments: ["organizations"] },
	{ method: "PATCH", segments: ["orgs", ":org"] },
	{ method: "GET", segments: ["orgs", ":org", "members"] },
	{ method: "PATCH", segments: ["orgs", ":org", "members", ":id"] },
	{ method: "DELETE", segments: ["orgs", ":org", "members", ":id"] },
	{ method: "GET", segments: ["orgs", ":org", "roles"] },
	{ method: "POST", segments: ["orgs", ":org", "roles"] },
	{ method: "PATCH", segments: ["orgs", ":org", "roles", ":id"] },
	{ method: "DELETE", segments: ["orgs", ":org", "roles", ":id"] },
	{ method: "GET", segments: ["orgs", ":org", "teams"] },
	{ method: "POST", segments: ["orgs", ":org", "teams"] },
	{ method: "PATCH", segments: ["orgs", ":org", "teams", ":id"] },
	{ method: "DELETE", segments: ["orgs", ":org", "teams", ":id"] },
	{ method: "GET", segments: ["orgs", ":org", "teams", ":id", "members"] },
	{ method: "POST", segments: ["orgs", ":org", "teams", ":id", "members"] },
	{
		method: "DELETE",
		segments: ["orgs", ":org", "teams", ":id", "members", ":memberId"],
	},
	{ method: "GET", segments: ["orgs", ":org", "invitations"] },
	{ method: "POST", segments: ["orgs", ":org", "invitations"] },
	{
		method: "POST",
		segments: ["orgs", ":org", "invitations", ":id", "cancel"],
	},
	{ method: "POST", segments: ["invitations", ":id", "accept"] },
	{ method: "GET", segments: ["orgs", ":org", "apikeys"] },
	{ method: "POST", segments: ["orgs", ":org", "apikeys"] },
	{ method: "DELETE", segments: ["orgs", ":org", "apikeys", ":id"] },
	{ method: "GET", segments: ["users", ":id", "avatar"] },
];

/** Route template for span attributes: concrete IDs collapse to :params so
 * cardinality stays bounded (T30) — mirrors the ROUTES table above. */
function routeTemplate(segments: string[], _method: string): string {
	const templates = new Set(ROUTES.map((r) => r.segments.join("/")));
	const concrete = segments.join("/");
	if (templates.has(concrete)) return `/api/identity/${concrete}`;
	for (const r of ROUTES) {
		if (
			r.segments.length === segments.length &&
			r.segments.every((seg, i) => seg.startsWith(":") || seg === segments[i])
		)
			return `/api/identity/${r.segments.join("/")}`;
	}
	return "/api/identity/unmatched";
}

function pathKnown(segments: string[]): boolean {
	return ROUTES.some(
		(r) =>
			r.segments.length === segments.length &&
			r.segments.every((seg, i) => seg.startsWith(":") || seg === segments[i]),
	);
}

function allowHeader(segments: string[]): Record<string, string> {
	const methods = ROUTES.filter(
		(r) =>
			r.segments.length === segments.length &&
			r.segments.every((seg, i) => seg.startsWith(":") || seg === segments[i]),
	).map((r) => r.method);
	return methods.length > 0 ? { allow: methods.join(", ") } : {};
}

// --- handler -------------------------------------------------------------------

export function identityHandler(
	sql: Sql,
	_auth: AuthLike,
	tracer: TracerLike = identityTracer(),
) {
	const dispatch = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const path = url.pathname;
		if (!path.startsWith("/api/identity/"))
			return new Response(null, { status: 404 });

		const headers = Object.fromEntries(request.headers.entries());
		// Server span in the inbound trace (review c9 defect 3 / T30): route
		// template + method are known up front; org/principal/status are
		// annotated as they resolve. No SQL text or secrets in attributes.
		const span = tracer.startSpan("stellarc.http.request", {
			traceparent: headers.traceparent,
		});
		const segments = path
			.slice("/api/identity/".length)
			.split("/")
			.filter(Boolean);
		span.setAttribute("http.route", routeTemplate(segments, request.method));
		span.setAttribute("http.request.method", request.method);
		const orgFromPath = segments[0] === "orgs" ? segments[1] : undefined;
		if (orgFromPath)
			span.setAttribute("stellarc.org", decodeURIComponent(orgFromPath));
		try {
			const response = await span.with(() =>
				handle(request, headers, segments),
			);
			span.setAttribute("http.response.status_code", response.status);
			if (response.status < 400)
				span.setAttribute(
					"stellarc.principal.kind",
					principalKind.get() ?? "human",
				);
			span.end();
			return response;
		} catch (error) {
			span.recordError(error);
			span.setAttribute("http.response.status_code", 503);
			span.end();
			return errorResponse("Unavailable", 503);
		}
	};

	// The authenticated principal kind travels through the span-scoped slot
	// the HTTP wrapper reads after the handler resolves the caller.
	const principalKind = (() => {
		let current = "human";
		return {
			get: () => current,
			set: (kind: string) => {
				current = kind;
			},
		};
	})();

	return dispatch;

	async function handle(
		request: Request,
		headers: Record<string, string>,
		segments: string[],
	): Promise<Response> {
		const resolution = await resolveRequestContext(sql, headers, tracer);
		if (!resolution.ok) {
			// Ambiguous simultaneous credentials are rejected like unauthenticated
			// (§3) — never 500.
			return errorResponse("Unauthenticated", 401);
		}
		const ctx = resolution.context;
		principalKind.set(ctx.kind);

		// GET /api/identity/active-organization (rework c13, D10): the
		// switcher's active-org read; session-driven, user-private (§4).
		if (
			method("GET", request) &&
			segments.join("/") === "active-organization"
		) {
			const rawToken = sessionTokenFromCookie(headers);
			const [sessionRow] = await sql`
				SELECT active_organization_id FROM session
				WHERE token = ${rawToken === null ? "" : sessionTokenValue(rawToken)}`;
			const activeId = sessionRow?.active_organization_id;
			if (typeof activeId !== "string" || activeId.length === 0)
				return json({ organization: null }, 200);
			try {
				const resolved = await orgRouter(sql, ctx.userId, activeId);
				const [org] = await sql<
					OrgRow[]
				>`SELECT * FROM organization WHERE id = ${resolved.orgId}`;
				if (!org) return json({ organization: null }, 200);
				return json({ organization: orgPublic(org) }, 200);
			} catch {
				// Stale/inaccessible active org: treat as none rather than 404.
				return json({ organization: null }, 200);
			}
		}

		// POST /api/identity/active-org
		if (method("POST", request) && segments.join("/") === "active-org") {
			const raw = await readJson(request);
			const body = decodeBody(ActiveOrgRequest, raw);
			if (!body)
				return errorResponse("ValidationError", 400, {
					message: "organizationId required",
				});
			try {
				await orgRouter(sql, ctx.userId, String(body.organizationId));
			} catch (error) {
				return identityError(error);
			}
			const [org] = await sql<
				OrgRow[]
			>`SELECT * FROM organization WHERE id = ${String(body.organizationId)}`;
			if (!org) return errorResponse("NotFound", 404);
			const rawToken = sessionTokenFromCookie(headers);
			await sql`UPDATE session SET active_organization_id = ${String(body.organizationId)}, updated_at = now() WHERE token = ${rawToken === null ? "" : sessionTokenValue(rawToken)}`;
			return json({ organization: orgPublic(org) }, 200);
		}

		// GET /api/identity/organizations
		if (method("GET", request) && segments.join("/") === "organizations") {
			const orgs = await sql<OrgRow[]>`
				SELECT o.* FROM organization o
				JOIN organization_member m ON m.organization_id = o.id
				WHERE m.user_id = ${ctx.userId}
				ORDER BY o.id`;
			return json({ organizations: orgs.map(orgPublic) }, 200);
		}

		// POST /api/identity/organizations
		if (method("POST", request) && segments.join("/") === "organizations") {
			const raw = await readJson(request);
			// D8/D10: schema decode bounds name/slug (≤256) and rejects excess keys.
			const body = decodeBody(CreateOrganizationRequest, raw);
			if (!body)
				return errorResponse("ValidationError", 400, {
					message: "name and slug required (each bounded to 256)",
				});
			// Instance admin only (§3): user.role === 'admin' at the instance level.
			const [user] =
				await sql`SELECT role FROM "user" WHERE id = ${ctx.userId}`;
			if (user?.role !== "admin") return errorResponse("Forbidden", 403);
			const { createOrganization } = await import(
				"../../../packages/domain/src/identity/mutations"
			);
			try {
				const result = await createOrganization(
					sql,
					ctx.userId,
					{
						name: String(body.name),
						slug: String(body.slug),
						description:
							typeof body.description === "string"
								? body.description
								: undefined,
					},
					tracer,
				);
				return json(result, 200);
			} catch (error) {
				return identityError(error);
			}
		}

		// GET /api/identity/invitations/pending (rework c13, D10): the
		// authenticated user's own pending invitations (invitee side).
		if (
			method("GET", request) &&
			segments.join("/") === "invitations/pending"
		) {
			const [user] = await sql<{ email: string }[]>`
				SELECT email FROM "user" WHERE id = ${ctx.userId}`;
			if (!user) return json([], 200);
			const rows = await sql`
				SELECT id, organization_id, email, role, team_id, status, expires_at, created_at, inviter_id
				FROM invitation
				WHERE email = ${user.email} AND status = 'pending' AND expires_at > now()
				ORDER BY id`;
			return json(
				rows.map((row) => ({
					id: row.id,
					organizationId: row.organization_id,
					email: row.email,
					role: row.role,
					teamId: row.team_id,
					status: row.status,
					expiresAt: toIso(row.expires_at),
					createdAt: toIso(row.created_at),
					inviterId: row.inviter_id,
				})),
				200,
			);
		}

		// GET /api/identity/invitations/:id/details (rework c13, D10): public
		// invitation context for the invitee's accept screen (name resolution,
		// status/expiry). No auth beyond knowing the invitation id.
		if (
			method("GET", request) &&
			segments[0] === "invitations" &&
			segments[2] === "details" &&
			segments.length === 3 &&
			validId(segments[1])
		) {
			const [invitation] = await sql`
				SELECT id, organization_id, email, role, team_id, status, expires_at, created_at, inviter_id
				FROM invitation WHERE id = ${segments[1]}`;
			if (!invitation) return errorResponse("NotFound", 404);
			const [org] = await sql<{ name: string }[]>`
				SELECT name FROM organization WHERE id = ${invitation.organization_id}`;
			const [inviter] = await sql<{ name: string }[]>`
				SELECT name FROM "user" WHERE id = ${invitation.inviter_id}`;
			const expired =
				new Date(toIso(invitation.expires_at)).getTime() < Date.now();
			return json(
				{
					valid: invitation.status === "pending" && !expired,
					invitation: {
						id: invitation.id,
						email: invitation.email,
						organizationName: org?.name ?? "",
						inviterName: inviter?.name ?? "",
						expiresAt: toIso(invitation.expires_at),
						status: invitation.status,
						expired,
					},
				},
				200,
			);
		}

		// GET /api/identity/users/:id/avatar (§3: bytes, stored safe image MIME,
		// Content-Length=size, nosniff; self or shared authorized org only).
		if (
			method("GET", request) &&
			segments[0] === "users" &&
			segments[2] === "avatar" &&
			segments.length === 3 &&
			validId(segments[1])
		) {
			const targetUserId = String(segments[1]);
			if (targetUserId !== ctx.userId) {
				const [shared] = await sql`
					SELECT 1 FROM organization_member a
					JOIN organization_member b ON a.organization_id = b.organization_id
					WHERE a.user_id = ${targetUserId} AND b.user_id = ${ctx.userId}`;
				if (!shared) return errorResponse("NotFound", 404);
			}
			const [avatar] = await sql<
				Array<{ mime_type: string; size: number; data: Buffer }>
			>`SELECT mime_type, size, data FROM user_avatar WHERE user_id = ${targetUserId}`;
			if (!avatar) return errorResponse("NotFound", 404);
			if (!/^image\//i.test(avatar.mime_type))
				return errorResponse("NotFound", 404);
			const bytes = Buffer.from(avatar.data ?? []);
			return new Response(new Uint8Array(bytes), {
				status: 200,
				headers: {
					"content-type": avatar.mime_type,
					"content-length": String(avatar.size),
					"x-content-type-options": "nosniff",
					"cache-control": "no-store",
				},
			});
		}

		// /api/identity/orgs/:org/...
		if (segments[0] === "orgs" && segments.length >= 3) {
			const orgArg = decodeURIComponent(segments[1] ?? "");
			if (!validId(orgArg)) return errorResponse("NotFound", 404);
			// Resolve org + principal capabilities first; foreign org = same
			// 404 as absent (§3). Authorization is capability-based (D2):
			// agents never inherit the owner's human membership authority.
			const [org] = await sql<
				OrgRow[]
			>`SELECT * FROM organization WHERE id = ${orgArg} OR slug = ${orgArg}`;
			if (!org) return errorResponse("NotFound", 404);
			const caps = await effectiveCapabilities(
				sql,
				principalContext(ctx),
				String(org.id),
				tracer,
			);
			// Rework c10 (defect 5): with mint-on-auth removed, an
			// authenticated agent has real capabilities only where
			// createApiKey/importer grants exist. Visibility is gated on the
			// structural org:member row (present here via the seed); a
			// capabilities-empty principal is Forbidden, not "absent org".
			if (!caps.has("org:member") && caps.size === 0)
				return errorResponse("NotFound", 404);
			if (!caps.has("org:member")) return errorResponse("Forbidden", 403);
			const rest = segments.slice(2);
			// Guards accept equivalent capability aliases: the fork's key
			// ceiling vocabulary (organization:manage_members) and the
			// resource-action form (member:delete) name the same power.
			const manage = (...capabilities: string[]): Response | null =>
				capabilities.some((c) => caps.has(c))
					? null
					: errorResponse("Forbidden", 403);

			// GET /orgs/:org (rework c13, D10): the org public projection for
			// the resolved scope — the lifted full-organization hook's base row.
			if (rest.length === 0 && method("GET", request)) {
				const [row] = await sql<
					OrgRow[]
				>`SELECT * FROM organization WHERE id = ${org.id}`;
				return json(orgPublic(row), 200);
			}

			// GET /orgs/:org/members
			if (method("GET", request) && rest.join("/") === "members") {
				const rows = await sql`
					SELECT m.*, u.name AS user_name, u.email AS user_email, u.image AS user_image
					FROM organization_member m JOIN "user" u ON u.id = m.user_id
					WHERE m.organization_id = ${org.id} ORDER BY m.id`;
				return json(
					{
						members: rows.map((row) => ({
							id: row.id,
							organizationId: row.organization_id,
							userId: row.user_id,
							role: row.role,
							aiTokenLimit: row.ai_token_limit,
							aiCharacterLimit: row.ai_character_limit,
							joinedAt: toIso(row.joined_at),
							user: pickUserPublic({
								id: row.user_id,
								name: row.user_name,
								email: row.user_email,
								image: row.user_image,
							}),
							principalId: humanPrincipalId(row.user_id),
						})),
					},
					200,
				);
			}

			// PATCH /orgs/:org/members/:id (§3 role change)
			if (
				method("PATCH", request) &&
				rest[0] === "members" &&
				rest.length === 2
			) {
				const denied = manage("member:update", "organization:manage_members");
				if (denied) return denied;
				const raw = await readJson(request);
				const body = decodeBody(UpdateMemberRequest, raw);
				const role = body ? body.role : "";
				if (
					!validName(role) ||
					!["owner", "admin", "member", "viewer"].includes(role)
				)
					return errorResponse("ValidationError", 400, {
						message: "role must be a known nonempty role",
					});
				try {
					const result = await updateMemberRole(
						sql,
						String(org.id),
						String(rest[1]),
						role,
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// DELETE /orgs/:org/members/:id
			if (
				method("DELETE", request) &&
				rest[0] === "members" &&
				rest.length === 2
			) {
				const denied = manage("member:delete", "organization:manage_members");
				if (denied) return denied;
				try {
					const result = await removeMember(
						sql,
						String(org.id),
						String(rest[1]),
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// GET /orgs/:org/roles
			if (method("GET", request) && rest.join("/") === "roles") {
				const roles = await sql<RoleRow[]>`
					SELECT * FROM organization_role WHERE organization_id = ${org.id} ORDER BY id`;
				return json({ roles: roles.map(rolePublic) }, 200);
			}

			// POST /orgs/:org/roles
			if (method("POST", request) && rest.join("/") === "roles") {
				const denied = manage(
					"organization:manage_settings",
					"organization:update",
				);
				if (denied) return denied;
				const raw = await readJson(request);
				const body = decodeBody(CreateRoleRequest, raw);
				if (!body)
					return errorResponse("ValidationError", 400, {
						message: "role and permission required",
					});
				try {
					const result = await createRole(
						sql,
						String(org.id),
						{
							role: String(body.role),
							permission: body.permission as Record<string, string[]>,
						},
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// PATCH /orgs/:org/roles/:id
			if (
				method("PATCH", request) &&
				rest[0] === "roles" &&
				rest.length === 2
			) {
				const denied = manage(
					"organization:manage_settings",
					"organization:update",
				);
				if (denied) return denied;
				const raw = await readJson(request);
				const body = decodeBody(UpdateRoleRequest, raw);
				if (!body)
					return errorResponse("ValidationError", 400, {
						message: "permission required",
					});
				try {
					const result = await updateRole(
						sql,
						String(org.id),
						String(rest[1]),
						body.permission as Record<string, string[]>,
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// DELETE /orgs/:org/roles/:id
			if (
				method("DELETE", request) &&
				rest[0] === "roles" &&
				rest.length === 2
			) {
				const denied = manage(
					"organization:manage_settings",
					"organization:update",
				);
				if (denied) return denied;
				try {
					const result = await deleteRole(
						sql,
						String(org.id),
						String(rest[1]),
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// GET /orgs/:org/teams
			if (method("GET", request) && rest.join("/") === "teams") {
				const teams = await sql<TeamRow[]>`
					SELECT * FROM team WHERE organization_id = ${org.id} ORDER BY id`;
				return json({ teams: teams.map(teamPublic) }, 200);
			}

			// POST /orgs/:org/teams
			if (method("POST", request) && rest.join("/") === "teams") {
				const denied = manage("team:create");
				if (denied) return denied;
				const raw = await readJson(request);
				const body = decodeBody(CreateTeamRequest, raw);
				if (!body)
					return errorResponse("ValidationError", 400, {
						message: "name, icon, parentTeamId invalid",
					});
				try {
					const result = await createTeam(
						sql,
						String(org.id),
						{
							name: String(body.name),
							icon:
								body.icon === undefined
									? undefined
									: (body.icon as string | null),
							parentTeamId:
								body.parentTeamId === undefined
									? undefined
									: body.parentTeamId === null
										? null
										: String(body.parentTeamId),
						},
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// PATCH /orgs/:org/teams/:id
			if (
				method("PATCH", request) &&
				rest[0] === "teams" &&
				rest.length === 2
			) {
				const denied = manage("team:update", "organization:manage_members");
				if (denied) return denied;
				const raw = await readJson(request);
				const body = decodeBody(UpdateTeamRequest, raw);
				if (!body)
					return errorResponse("ValidationError", 400, {
						message: "name, icon, parentTeamId invalid",
					});
				try {
					const result = await updateTeam(
						sql,
						String(org.id),
						String(rest[1]),
						{
							name: body.name === undefined ? undefined : String(body.name),
							icon:
								body.icon === undefined
									? undefined
									: (body.icon as string | null),
							parentTeamId:
								body.parentTeamId === undefined
									? undefined
									: body.parentTeamId === null
										? null
										: String(body.parentTeamId),
						},
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// DELETE /orgs/:org/teams/:id (reparent children + member deletions in tx)
			if (
				method("DELETE", request) &&
				rest[0] === "teams" &&
				rest.length === 2
			) {
				const denied = manage("team:delete");
				if (denied) return denied;
				try {
					const result = await deleteTeam(
						sql,
						String(org.id),
						String(rest[1]),
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// /orgs/:org/teams/:id/members
			if (rest[0] === "teams" && rest.length === 3 && rest[2] === "members") {
				const teamId = String(rest[1]);
				const [team] =
					await sql`SELECT id, organization_id FROM team WHERE id = ${teamId} AND organization_id = ${org.id}`;
				if (!team) return errorResponse("NotFound", 404);
				if (method("GET", request)) {
					const rows = await sql`
						SELECT tm.*, t.organization_id AS team_org, u.name AS user_name
						FROM team_member tm
						JOIN team t ON t.id = tm.team_id
						JOIN "user" u ON u.id = tm.user_id
						WHERE tm.team_id = ${teamId} ORDER BY tm.id`;
					return json(
						{
							members: rows.map((row) => ({
								id: row.id,
								teamId: row.team_id,
								userId: row.user_id,
								createdAt: toIso(row.created_at),
								organizationId: row.team_org,
								name: row.user_name,
							})),
						},
						200,
					);
				}
				if (method("POST", request)) {
					const denied = manage("team:update", "organization:manage_members");
					if (denied) return denied;
					const raw = await readJson(request);
					const body = decodeBody(AddTeamMemberRequest, raw);
					if (!body)
						return errorResponse("ValidationError", 400, {
							message: "userId required",
						});
					try {
						const result = await addTeamMember(
							sql,
							String(org.id),
							teamId,
							String(body.userId),
							ctx.principalId,
							tracer,
						);
						return json(result, 200);
					} catch (error) {
						return identityError(error);
					}
				}
			}

			// DELETE /orgs/:org/teams/:id/members/:memberId
			if (
				method("DELETE", request) &&
				rest[0] === "teams" &&
				rest.length === 4 &&
				rest[2] === "members"
			) {
				const denied = manage("team:update", "organization:manage_members");
				if (denied) return denied;
				try {
					const result = await removeTeamMember(
						sql,
						String(org.id),
						String(rest[1]),
						String(rest[3]),
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// GET /orgs/:org/invitations (managers only)
			if (method("GET", request) && rest.join("/") === "invitations") {
				const denied = manage("invitation:read", "organization:manage_members");
				if (denied) return denied;
				const invitations = await sql`
					SELECT * FROM invitation WHERE organization_id = ${org.id} ORDER BY id`;
				return json(
					{
						invitations: invitations.map((row) => ({
							id: row.id,
							organizationId: row.organization_id,
							email: row.email,
							role: row.role,
							teamId: row.team_id,
							status: row.status,
							expiresAt: toIso(row.expires_at),
							createdAt: toIso(row.created_at),
							inviterId: row.inviter_id,
						})),
					},
					200,
				);
			}

			// POST /orgs/:org/invitations
			if (method("POST", request) && rest.join("/") === "invitations") {
				const denied = manage(
					"invitation:create",
					"organization:manage_members",
				);
				if (denied) return denied;
				const raw = await readJson(request);
				const body = decodeBody(CreateInvitationRequest, raw);
				if (!body)
					return errorResponse("ValidationError", 400, {
						message: "email and role required",
					});
				try {
					const result = await createInvitation(
						sql,
						String(org.id),
						{
							email: String(body.email),
							role: String(body.role),
							teamId:
								body.teamId === undefined || body.teamId === null
									? null
									: String(body.teamId),
						},
						ctx,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// POST /orgs/:org/invitations/:id/cancel
			if (
				method("POST", request) &&
				rest[0] === "invitations" &&
				rest.length === 3 &&
				rest[2] === "cancel"
			) {
				const denied = manage(
					"invitation:update",
					"organization:manage_members",
				);
				if (denied) return denied;
				try {
					const result = await cancelInvitation(
						sql,
						String(org.id),
						String(rest[1]),
						ctx.principalId,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// GET /orgs/:org/apikeys (D1: own keys only, scoped to org — the
			// owner must hold the org:member structural grant in THIS org;
			// agents see only their own key).
			if (method("GET", request) && rest.join("/") === "apikeys") {
				const keys = await sql`
					SELECT a.* FROM apikey a
					WHERE a.reference_id = ${ctx.userId}
					AND EXISTS (
						SELECT 1 FROM identity_grant g
						JOIN principal p ON p.id = g.principal_id
						WHERE g.org_id = ${org.id} AND g.capability = 'org:member'
						AND p.kind = 'human' AND p.user_id = ${ctx.userId}
					)
					${ctx.kind === "agent" ? sql`AND a.id = ${ctx.apikeyId ?? ""}` : sql``}
					ORDER BY a.id`;
				return json({ keys: keys.map(apiKeyPublicRow) }, 200);
			}

			// POST /orgs/:org/apikeys (human session only, §3)
			if (method("POST", request) && rest.join("/") === "apikeys") {
				if (ctx.kind !== "human") return errorResponse("Forbidden", 403);
				const denied = manage("apikey:create");
				if (denied) return denied;
				const raw = await readJson(request);
				const body = decodeBody(CreateApiKeyRequest, raw);
				if (!body)
					return errorResponse("ValidationError", 400, {
						message: "name and permissions required",
					});
				if (
					body.expiresAt !== undefined &&
					body.expiresAt !== null &&
					typeof body.expiresAt !== "string"
				)
					return errorResponse("ValidationError", 400, {
						message: "expiresAt must be a date string",
					});
				try {
					const result = await createApiKey(
						sql,
						String(org.id),
						{
							name: String(body.name),
							permissions: body.permissions as Record<string, string[]>,
							expiresAt:
								body.expiresAt === undefined || body.expiresAt === null
									? null
									: String(body.expiresAt),
						},
						ctx,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}

			// DELETE /orgs/:org/apikeys/:id (own key only; revokes grants now)
			if (
				method("DELETE", request) &&
				rest[0] === "apikeys" &&
				rest.length === 2
			) {
				const denied = manage("apikey:delete");
				if (denied) return denied;
				try {
					const result = await deleteApiKey(
						sql,
						String(org.id),
						String(rest[1]),
						ctx,
						tracer,
					);
					return json(result, 200);
				} catch (error) {
					return identityError(error);
				}
			}
		}

		// POST /api/identity/invitations/:id/accept (atomic consume)
		if (
			method("POST", request) &&
			segments[0] === "invitations" &&
			segments.length === 3 &&
			segments[2] === "accept"
		) {
			try {
				const result = await acceptInvitation(
					sql,
					String(segments[1]),
					ctx,
					tracer,
				);
				return json(result, 200);
			} catch (error) {
				return identityError(error);
			}
		}

		// PATCH /api/identity/orgs/:org (slug change instance-admin-only)
		if (
			method("PATCH", request) &&
			segments[0] === "orgs" &&
			segments.length === 2
		) {
			const orgArg = decodeURIComponent(segments[1] ?? "");
			if (!validId(orgArg)) return errorResponse("NotFound", 404);
			const [org] = await sql<
				OrgRow[]
			>`SELECT * FROM organization WHERE id = ${orgArg} OR slug = ${orgArg}`;
			if (!org) return errorResponse("NotFound", 404);
			const caps = await effectiveCapabilities(
				sql,
				principalContext(ctx),
				String(org.id),
				tracer,
			);
			if (caps.size === 0) return errorResponse("NotFound", 404);
			const denied = manageCapability(caps, "organization:update");
			if (denied) return denied;
			const raw = await readJson(request);
			const body = decodeBody(UpdateOrganizationRequest, raw);
			if (!body)
				return errorResponse("ValidationError", 400, {
					message: "name/description/slug invalid",
				});
			const nameOk = body.name === undefined || validName(body.name);
			const descOk =
				body.description === undefined ||
				body.description === null ||
				typeof body.description === "string";
			const slugOk = body.slug === undefined || validSlug(body.slug);
			if (
				!nameOk ||
				!descOk ||
				!slugOk ||
				(body.name === undefined &&
					body.description === undefined &&
					body.slug === undefined)
			)
				return errorResponse("ValidationError", 400, {
					message: "at least one of name, description, slug required",
				});
			if (body.slug !== undefined && String(body.slug) !== org.slug) {
				const [user] =
					await sql`SELECT role FROM "user" WHERE id = ${ctx.userId}`;
				if (user?.role !== "admin") return errorResponse("Forbidden", 403);
			}
			try {
				const result = await updateOrganization(
					sql,
					String(org.id),
					{
						name: body.name === undefined ? undefined : String(body.name),
						description:
							body.description === undefined
								? undefined
								: body.description === null
									? null
									: String(body.description),
						slug: body.slug === undefined ? undefined : String(body.slug),
					},
					ctx.principalId,
					tracer,
				);
				return json(result, 200);
			} catch (error) {
				return identityError(error);
			}
		}

		// D9: known path with an unsupported method is 405 + Allow;
		// unknown paths stay 404 (fail closed).
		if (pathKnown(segments))
			return new Response(null, {
				status: 405,
				headers: { ...NO_STORE, ...allowHeader(segments) },
			});
		return new Response(null, { status: 404 });
	}
}

function apiKeyPublicRow(row: Record<string, unknown>) {
	let permissions: Record<string, string[]> | null = null;
	if (typeof row.permissions === "string" && row.permissions.length > 0) {
		try {
			const parsed: unknown = JSON.parse(row.permissions);
			if (parsed && typeof parsed === "object")
				permissions = parsed as Record<string, string[]>;
		} catch {
			permissions = null;
		}
	}
	return {
		id: String(row.id),
		configId: String(row.config_id),
		name: row.name === null || row.name === undefined ? null : String(row.name),
		start:
			row.start === null || row.start === undefined ? null : String(row.start),
		referenceId: String(row.reference_id),
		prefix:
			row.prefix === null || row.prefix === undefined
				? null
				: String(row.prefix),
		refillInterval:
			row.refill_interval === null || row.refill_interval === undefined
				? null
				: Number(row.refill_interval),
		refillAmount:
			row.refill_amount === null || row.refill_amount === undefined
				? null
				: Number(row.refill_amount),
		lastRefillAt:
			row.last_refill_at === null || row.last_refill_at === undefined
				? null
				: toIso(row.last_refill_at as Date | string),
		enabled:
			row.enabled === null || row.enabled === undefined
				? null
				: Boolean(row.enabled),
		rateLimitEnabled:
			row.rate_limit_enabled === null || row.rate_limit_enabled === undefined
				? null
				: Boolean(row.rate_limit_enabled),
		rateLimitTimeWindow:
			row.rate_limit_time_window === null ||
			row.rate_limit_time_window === undefined
				? null
				: Number(row.rate_limit_time_window),
		rateLimitMax:
			row.rate_limit_max === null || row.rate_limit_max === undefined
				? null
				: Number(row.rate_limit_max),
		requestCount:
			row.request_count === null || row.request_count === undefined
				? null
				: Number(row.request_count),
		remaining:
			row.remaining === null || row.remaining === undefined
				? null
				: Number(row.remaining),
		lastRequest:
			row.last_request === null || row.last_request === undefined
				? null
				: toIso(row.last_request as Date | string),
		expiresAt:
			row.expires_at === null || row.expires_at === undefined
				? null
				: toIso(row.expires_at as Date | string),
		createdAt: toIso(row.created_at as Date | string),
		updatedAt: toIso(row.updated_at as Date | string),
		permissions,
		metadata:
			row.metadata === null || row.metadata === undefined
				? null
				: String(row.metadata),
	};
}

function method(expected: string, request: Request): boolean {
	return request.method === expected;
}

function sessionTokenFromCookie(
	headers: Record<string, string>,
): string | null {
	const header = headers.cookie;
	if (!header) return null;
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		if (/session/i.test(part.slice(0, eq))) return part.slice(eq + 1).trim();
	}
	return null;
}

function identityError(error: unknown): Response {
	if (typeof error === "object" && error !== null && "_tag" in error) {
		const tag = String((error as { _tag: unknown })._tag);
		if (tag === "NotFound") return errorResponse("NotFound", 404);
		if (tag === "Forbidden") return errorResponse("Forbidden", 403);
		if (tag === "Unauthenticated") return errorResponse("Unauthenticated", 401);
		if (tag === "Conflict")
			return errorResponse("Conflict", 409, {
				code: String((error as { code?: unknown }).code ?? "Duplicate"),
			});
	}
	return errorResponse("Unavailable", 503);
}
