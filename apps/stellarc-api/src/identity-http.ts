import type { Sql } from "postgres";
import { humanPrincipalId } from "../../../packages/domain/src/identity/auth";
import { removeMember } from "../../../packages/domain/src/identity/mutations";
import { orgRouter } from "../../../packages/domain/src/identity/org-router";
import { resolveRequestContext, sessionTokenValue } from "./identity-context";

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

// --- handler -------------------------------------------------------------------

export function identityHandler(sql: Sql, _auth: AuthLike) {
	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const path = url.pathname;
		if (!path.startsWith("/api/identity/"))
			return new Response(null, { status: 404 });

		const headers = Object.fromEntries(request.headers.entries());
		const resolution = await resolveRequestContext(sql, headers);
		if (!resolution.ok) {
			// Ambiguous simultaneous credentials are rejected like unauthenticated
			// (§3) — never 500.
			return errorResponse("Unauthenticated", 401);
		}
		const ctx = resolution.context;

		const segments = path
			.slice("/api/identity/".length)
			.split("/")
			.filter(Boolean);

		// POST /api/identity/active-org
		if (method("POST", request) && segments.join("/") === "active-org") {
			const body = await readJson(request);
			if (!validId(body.organizationId))
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
			const body = await readJson(request);
			if (!validName(body.name) || typeof body.slug !== "string" || !body.slug)
				return errorResponse("ValidationError", 400, {
					message: "name and slug required",
				});
			// Instance admin only (§3): user.role === 'admin' at the instance level.
			const [user] =
				await sql`SELECT role FROM "user" WHERE id = ${ctx.userId}`;
			if (user?.role !== "admin") return errorResponse("Forbidden", 403);
			const { createOrganization } = await import(
				"../../../packages/domain/src/identity/mutations"
			);
			try {
				const result = await createOrganization(sql, ctx.userId, {
					name: String(body.name),
					slug: String(body.slug),
					description:
						typeof body.description === "string" ? body.description : undefined,
				});
				return json(result, 200);
			} catch (error) {
				return identityError(error);
			}
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
			// Resolve org + membership first; foreign org = same 404 as absent.
			const [org] = await sql<
				OrgRow[]
			>`SELECT * FROM organization WHERE id = ${orgArg} OR slug = ${orgArg}`;
			if (!org) return errorResponse("NotFound", 404);
			const [membership] = await sql`
				SELECT role FROM organization_member WHERE organization_id = ${org.id} AND user_id = ${ctx.userId}`;
			if (!membership) return errorResponse("NotFound", 404);
			const rest = segments.slice(2);

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

			// DELETE /orgs/:org/members/:id
			if (
				method("DELETE", request) &&
				rest[0] === "members" &&
				rest.length === 2
			) {
				const memberId = String(rest[1]);
				// Only owners/admins may remove members (manage_members capability).
				if (!["owner", "admin"].includes(String(membership.role)))
					return errorResponse("Forbidden", 403);
				try {
					const result = await removeMember(
						sql,
						org.id,
						memberId,
						ctx.principalId,
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

			// GET /orgs/:org/teams
			if (method("GET", request) && rest.join("/") === "teams") {
				const teams = await sql<TeamRow[]>`
					SELECT * FROM team WHERE organization_id = ${org.id} ORDER BY id`;
				return json({ teams: teams.map(teamPublic) }, 200);
			}

			// GET /orgs/:org/invitations (managers only)
			if (method("GET", request) && rest.join("/") === "invitations") {
				if (!["owner", "admin"].includes(String(membership.role)))
					return errorResponse("Forbidden", 403);
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

			// GET /orgs/:org/apikeys (own keys only)
			if (method("GET", request) && rest.join("/") === "apikeys") {
				const keys = await sql`
					SELECT * FROM apikey WHERE reference_id = ${ctx.userId} ORDER BY id`;
				return json({ keys: keys.map(apiKeyPublicRow) }, 200);
			}
		}

		// Unsupported path under /api/identity — 404 (fail closed).
		return new Response(null, { status: 404 });
	};
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
