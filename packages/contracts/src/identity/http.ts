import { Schema, SchemaGetter } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { statement } from "../legacy/permissions";

// --- §3 validation primitives -----------------------------------------------------------
// Nonempty opaque ID ≤ 128. Reused for path params and request ID fields.
export const ID = Schema.NonEmptyString.pipe(
	Schema.check(Schema.isMaxLength(128)),
);
// Bounded display name ≤ 256.
export const Name = Schema.NonEmptyString.pipe(
	Schema.check(Schema.isMaxLength(256)),
);
// Validated email (permissive but real-shape).
export const Email = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
);
// ISO-8601 UTC date string (date or datetime).
export const DateString = Schema.String.pipe(
	Schema.check(
		Schema.isPattern(
			/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
		),
	),
);
// Permission = Record(nonempty resource, Array(nonempty action)), constrained to the
// legacy/permissions vocabulary: keys are exactly the `statement` resources (optional —
// all-optional fields keep {} a valid empty ceiling for ApiKeyPublic), values are
// per-resource action Literal unions derived from `statement` (no runtime better-auth
// calls). The runtime filter re-checks the vocabulary so unknown resources are rejected
// even by decoders configured to strip excess keys.
const PermissionFields = Object.fromEntries(
	Object.entries(statement).map(([resource, actions]) => [
		resource,
		Schema.optional(Schema.Array(Schema.Literals(actions))),
	]),
) as unknown as {
	[K in keyof typeof statement]: Schema.optional<
		Schema.Schema<ReadonlyArray<(typeof statement)[K][number]>>
	>;
};
export const Permission = Schema.Struct(PermissionFields).pipe(
	Schema.check(
		Schema.makeFilter(
			(permission) => {
				for (const resource of Object.keys(permission))
					if (!(resource in statement)) return false;
				return true;
			},
			{ identifier: "Permission" },
		),
	),
);

// --- Public rows (§3 allowlists; snake_case → camelCase, secret fields omitted) ---------
export const UserPublic = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	email: Schema.String,
	emailVerified: Schema.Boolean,
	image: Schema.NullOr(Schema.String),
	locale: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
	updatedAt: Schema.String,
	isAnonymous: Schema.NullOr(Schema.Boolean),
});
export type UserPublic = Schema.Schema.Type<typeof UserPublic>;

export const OrganizationPublic = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	slug: Schema.String,
	logo: Schema.NullOr(Schema.String),
	metadata: Schema.NullOr(Schema.String),
	description: Schema.NullOr(Schema.String),
	reposEnabled: Schema.Boolean,
	tablesEnabled: Schema.Boolean,
	workEnabled: Schema.Boolean,
	defaultResourcePrivilege: Schema.String,
	aiEnabled: Schema.Boolean,
	aiDefaultTokenLimit: Schema.Int,
	aiDefaultCharacterLimit: Schema.Int,
	aiProviderBaseUrl: Schema.NullOr(Schema.String),
	aiProviderModel: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
});
export type OrganizationPublic = Schema.Schema.Type<typeof OrganizationPublic>;

export const ApiKeyPublic = Schema.Struct({
	id: Schema.String,
	configId: Schema.String,
	name: Schema.NullOr(Schema.String),
	start: Schema.NullOr(Schema.String),
	referenceId: Schema.String,
	prefix: Schema.NullOr(Schema.String),
	refillInterval: Schema.NullOr(Schema.Int),
	refillAmount: Schema.NullOr(Schema.Int),
	lastRefillAt: Schema.NullOr(Schema.String),
	enabled: Schema.NullOr(Schema.Boolean),
	rateLimitEnabled: Schema.NullOr(Schema.Boolean),
	rateLimitTimeWindow: Schema.NullOr(Schema.Int),
	rateLimitMax: Schema.NullOr(Schema.Int),
	requestCount: Schema.NullOr(Schema.Int),
	remaining: Schema.NullOr(Schema.Int),
	lastRequest: Schema.NullOr(Schema.String),
	expiresAt: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
	updatedAt: Schema.String,
	permissions: Schema.NullOr(Permission),
	metadata: Schema.NullOr(Schema.String),
});
export type ApiKeyPublic = Schema.Schema.Type<typeof ApiKeyPublic>;

export const MemberPublic = Schema.Struct({
	id: Schema.String,
	organizationId: Schema.String,
	userId: Schema.String,
	role: Schema.String,
	aiTokenLimit: Schema.NullOr(Schema.Int),
	aiCharacterLimit: Schema.NullOr(Schema.Int),
	joinedAt: Schema.String,
	user: Schema.Struct({
		id: Schema.String,
		name: Schema.String,
		email: Schema.String,
		image: Schema.NullOr(Schema.String),
	}),
	principalId: Schema.String,
});
export type MemberPublic = Schema.Schema.Type<typeof MemberPublic>;

export const TeamMemberPublic = Schema.Struct({
	id: Schema.String,
	teamId: Schema.String,
	userId: Schema.String,
	createdAt: Schema.NullOr(Schema.String),
	organizationId: Schema.String,
});
export type TeamMemberPublic = Schema.Schema.Type<typeof TeamMemberPublic>;

export const PrincipalPublic = Schema.Struct({
	id: Schema.String,
	kind: Schema.Literals(["human", "agent"]),
	userId: Schema.String,
});
export type PrincipalPublic = Schema.Schema.Type<typeof PrincipalPublic>;

export const RolePublic = Schema.Struct({
	id: Schema.String,
	organizationId: Schema.String,
	role: Schema.String,
	permission: Permission,
	createdAt: Schema.String,
	updatedAt: Schema.String,
});
export type RolePublic = Schema.Schema.Type<typeof RolePublic>;

export const TeamPublic = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	organizationId: Schema.String,
	source: Schema.String,
	icon: Schema.NullOr(Schema.String),
	parentTeamId: Schema.NullOr(Schema.String),
	createdAt: Schema.String,
	updatedAt: Schema.NullOr(Schema.String),
});
export type TeamPublic = Schema.Schema.Type<typeof TeamPublic>;

export const InvitationPublic = Schema.Struct({
	id: Schema.String,
	organizationId: Schema.String,
	email: Schema.String,
	role: Schema.NullOr(Schema.String),
	teamId: Schema.NullOr(Schema.String),
	status: Schema.String,
	expiresAt: Schema.String,
	createdAt: Schema.String,
	inviterId: Schema.String,
});
export type InvitationPublic = Schema.Schema.Type<typeof InvitationPublic>;

// Avatar metadata (never carries the `data` bytes).
export const AvatarPublic = Schema.Struct({
	id: Schema.String,
	userId: Schema.String,
	mimeType: Schema.String,
	size: Schema.Int,
	createdAt: Schema.String,
	updatedAt: Schema.String,
});
export type AvatarPublic = Schema.Schema.Type<typeof AvatarPublic>;

// --- Error union (7 tags, 5 Conflict codes) --------------------------------------------
export const ConflictCode = Schema.Literals([
	"Duplicate",
	"LastOwner",
	"RoleInUse",
	"TeamCycle",
	"AlreadyAccepted",
]);
export const IdentityError = Schema.Union([
	Schema.Struct({
		_tag: Schema.Literal("ValidationError"),
		message: Schema.String,
	}),
	Schema.Struct({ _tag: Schema.Literal("Unauthenticated") }),
	Schema.Struct({ _tag: Schema.Literal("Forbidden") }),
	Schema.Struct({ _tag: Schema.Literal("NotFound") }),
	Schema.Struct({
		_tag: Schema.Literal("Conflict"),
		code: ConflictCode,
	}),
	Schema.Struct({
		_tag: Schema.Literal("RateLimited"),
		retryAfterSeconds: Schema.Number,
	}),
	Schema.Struct({ _tag: Schema.Literal("Unavailable") }),
]);
export type IdentityError = Schema.Schema.Type<typeof IdentityError>;

// --- Mutation envelope ------------------------------------------------------------------
export const Mutation = <A>(data: Schema.Schema<A>) =>
	Schema.Struct({ data, txid: Schema.Number });
export const DeletedId = Schema.Struct({ id: Schema.String });

// Avatar bytes are JSON array-encoded on the wire (v3 Uint8ArrayFromArray
// semantics). v4's Schema.Uint8Array is FromSelf + base64 JSON, so the array
// codec is expressed explicitly as a decodeTo transformation.
const Bytes = Schema.Array(Schema.Number).pipe(
	Schema.decodeTo(Schema.Uint8Array, {
		decode: SchemaGetter.transform((ns) => Uint8Array.from(ns)),
		encode: SchemaGetter.transform((u8) => Array.from(u8)),
	}),
);

// --- Request schemas --------------------------------------------------------------------
const Empty = Schema.Struct({});
const PathOrg = Schema.Struct({ org: ID });
const PathOrgId = Schema.Struct({ org: ID, id: ID });
const PathTeamMember = Schema.Struct({ org: ID, id: ID, memberId: ID });

export const ActiveOrgRequest = Schema.Struct({ organizationId: ID });
export const CreateOrganizationRequest = Schema.Struct({
	name: Name,
	slug: Schema.NonEmptyString,
	description: Schema.optional(Schema.String),
});
export const UpdateOrganizationRequest = Schema.Struct({
	name: Schema.optional(Schema.String),
	description: Schema.optional(Schema.NullOr(Schema.String)),
	slug: Schema.optional(Schema.NonEmptyString),
});
export const UpdateMemberRequest = Schema.Struct({ role: Schema.String });
export const CreateRoleRequest = Schema.Struct({
	role: Schema.String,
	permission: Permission,
});
export const UpdateRoleRequest = Schema.Struct({ permission: Permission });
export const CreateTeamRequest = Schema.Struct({
	name: Name,
	icon: Schema.optional(Schema.NullOr(Schema.String)),
	parentTeamId: Schema.optional(Schema.NullOr(ID)),
});
export const UpdateTeamRequest = Schema.Struct({
	name: Schema.optional(Schema.String),
	icon: Schema.optional(Schema.NullOr(Schema.String)),
	parentTeamId: Schema.optional(Schema.NullOr(ID)),
});
export const AddTeamMemberRequest = Schema.Struct({ userId: ID });
export const CreateInvitationRequest = Schema.Struct({
	email: Email,
	role: Schema.String,
	teamId: Schema.optional(ID),
});
export const CreateApiKeyRequest = Schema.Struct({
	name: Schema.String,
	permissions: Permission,
	expiresAt: Schema.optional(DateString),
});

// --- Endpoints (26, no handlers) --------------------------------------------------------
const ActiveOrg = HttpApiEndpoint.post(
	"active-org",
	"/api/identity/active-org",
	{
		payload: ActiveOrgRequest,
		success: Schema.Struct({ organization: OrganizationPublic }),
		error: IdentityError,
	},
);

const ListOrganizations = HttpApiEndpoint.get(
	"list-organizations",
	"/api/identity/organizations",
	{
		success: Schema.Struct({ organizations: Schema.Array(OrganizationPublic) }),
		error: IdentityError,
	},
);

const CreateOrganization = HttpApiEndpoint.post(
	"create-organization",
	"/api/identity/organizations",
	{
		payload: CreateOrganizationRequest,
		success: Mutation(OrganizationPublic),
		error: IdentityError,
	},
);

const UpdateOrganization = HttpApiEndpoint.patch(
	"update-organization",
	"/api/identity/orgs/:org",
	{
		params: PathOrg,
		payload: UpdateOrganizationRequest,
		success: Mutation(OrganizationPublic),
		error: IdentityError,
	},
);

const ListMembers = HttpApiEndpoint.get(
	"list-members",
	"/api/identity/orgs/:org/members",
	{
		params: PathOrg,
		success: Schema.Struct({ members: Schema.Array(MemberPublic) }),
		error: IdentityError,
	},
);

const UpdateMember = HttpApiEndpoint.patch(
	"update-member",
	"/api/identity/orgs/:org/members/:id",
	{
		params: PathOrgId,
		payload: UpdateMemberRequest,
		success: Mutation(MemberPublic),
		error: IdentityError,
	},
);

const DeleteMember = HttpApiEndpoint.delete(
	"delete-member",
	"/api/identity/orgs/:org/members/:id",
	{ params: PathOrgId, success: Mutation(DeletedId), error: IdentityError },
);

const ListRoles = HttpApiEndpoint.get(
	"list-roles",
	"/api/identity/orgs/:org/roles",
	{
		params: PathOrg,
		success: Schema.Struct({ roles: Schema.Array(RolePublic) }),
		error: IdentityError,
	},
);

const CreateRole = HttpApiEndpoint.post(
	"create-role",
	"/api/identity/orgs/:org/roles",
	{
		params: PathOrg,
		payload: CreateRoleRequest,
		success: Mutation(RolePublic),
		error: IdentityError,
	},
);

const UpdateRole = HttpApiEndpoint.patch(
	"update-role",
	"/api/identity/orgs/:org/roles/:id",
	{
		params: PathOrgId,
		payload: UpdateRoleRequest,
		success: Mutation(RolePublic),
		error: IdentityError,
	},
);

const DeleteRole = HttpApiEndpoint.delete(
	"delete-role",
	"/api/identity/orgs/:org/roles/:id",
	{ params: PathOrgId, success: Mutation(DeletedId), error: IdentityError },
);

const ListTeams = HttpApiEndpoint.get(
	"list-teams",
	"/api/identity/orgs/:org/teams",
	{
		params: PathOrg,
		success: Schema.Struct({ teams: Schema.Array(TeamPublic) }),
		error: IdentityError,
	},
);

const CreateTeam = HttpApiEndpoint.post(
	"create-team",
	"/api/identity/orgs/:org/teams",
	{
		params: PathOrg,
		payload: CreateTeamRequest,
		success: Mutation(TeamPublic),
		error: IdentityError,
	},
);

const UpdateTeam = HttpApiEndpoint.patch(
	"update-team",
	"/api/identity/orgs/:org/teams/:id",
	{
		params: PathOrgId,
		payload: UpdateTeamRequest,
		success: Mutation(TeamPublic),
		error: IdentityError,
	},
);

const DeleteTeam = HttpApiEndpoint.delete(
	"delete-team",
	"/api/identity/orgs/:org/teams/:id",
	{ params: PathOrgId, success: Mutation(DeletedId), error: IdentityError },
);

const ListTeamMembers = HttpApiEndpoint.get(
	"list-team-members",
	"/api/identity/orgs/:org/teams/:id/members",
	{
		params: PathOrgId,
		success: Schema.Struct({ members: Schema.Array(TeamMemberPublic) }),
		error: IdentityError,
	},
);

const AddTeamMember = HttpApiEndpoint.post(
	"add-team-member",
	"/api/identity/orgs/:org/teams/:id/members",
	{
		params: PathOrgId,
		payload: AddTeamMemberRequest,
		success: Mutation(TeamMemberPublic),
		error: IdentityError,
	},
);

const DeleteTeamMember = HttpApiEndpoint.delete(
	"delete-team-member",
	"/api/identity/orgs/:org/teams/:id/members/:memberId",
	{
		params: PathTeamMember,
		success: Mutation(DeletedId),
		error: IdentityError,
	},
);

const ListInvitations = HttpApiEndpoint.get(
	"list-invitations",
	"/api/identity/orgs/:org/invitations",
	{
		params: PathOrg,
		success: Schema.Struct({ invitations: Schema.Array(InvitationPublic) }),
		error: IdentityError,
	},
);

const CreateInvitation = HttpApiEndpoint.post(
	"create-invitation",
	"/api/identity/orgs/:org/invitations",
	{
		params: PathOrg,
		payload: CreateInvitationRequest,
		success: Mutation(InvitationPublic),
		error: IdentityError,
	},
);

const CancelInvitation = HttpApiEndpoint.post(
	"cancel-invitation",
	"/api/identity/orgs/:org/invitations/:id/cancel",
	{
		params: PathOrgId,
		payload: Empty,
		success: Mutation(InvitationPublic),
		error: IdentityError,
	},
);

const AcceptInvitation = HttpApiEndpoint.post(
	"accept-invitation",
	"/api/identity/invitations/:id/accept",
	{
		params: Schema.Struct({ id: ID }),
		payload: Empty,
		success: Mutation(MemberPublic),
		error: IdentityError,
	},
);

const ListApiKeys = HttpApiEndpoint.get(
	"list-apikeys",
	"/api/identity/orgs/:org/apikeys",
	{
		params: PathOrg,
		success: Schema.Struct({ keys: Schema.Array(ApiKeyPublic) }),
		error: IdentityError,
	},
);

const CreateApiKey = HttpApiEndpoint.post(
	"create-apikey",
	"/api/identity/orgs/:org/apikeys",
	{
		params: PathOrg,
		payload: CreateApiKeyRequest,
		success: Mutation(
			Schema.Struct({ key: ApiKeyPublic, secret: Schema.String }),
		),
		error: IdentityError,
	},
);

const DeleteApiKey = HttpApiEndpoint.delete(
	"delete-apikey",
	"/api/identity/orgs/:org/apikeys/:id",
	{ params: PathOrgId, success: Mutation(DeletedId), error: IdentityError },
);

const UserAvatar = HttpApiEndpoint.get(
	"user-avatar",
	"/api/identity/users/:id/avatar",
	{ params: Schema.Struct({ id: ID }), success: Bytes, error: IdentityError },
);

export class IdentityApiGroup extends HttpApiGroup.make("identity")
	.add(ActiveOrg)
	.add(ListOrganizations)
	.add(CreateOrganization)
	.add(UpdateOrganization)
	.add(ListMembers)
	.add(UpdateMember)
	.add(DeleteMember)
	.add(ListRoles)
	.add(CreateRole)
	.add(UpdateRole)
	.add(DeleteRole)
	.add(ListTeams)
	.add(CreateTeam)
	.add(UpdateTeam)
	.add(DeleteTeam)
	.add(ListTeamMembers)
	.add(AddTeamMember)
	.add(DeleteTeamMember)
	.add(ListInvitations)
	.add(CreateInvitation)
	.add(CancelInvitation)
	.add(AcceptInvitation)
	.add(ListApiKeys)
	.add(CreateApiKey)
	.add(DeleteApiKey)
	.add(UserAvatar) {}
