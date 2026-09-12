import { Schema } from "effect";

// Snake_case row schemas — keys exactly as the SQL columns (§2). Every column is a
// required key; a nullable SQL column accepts `null` (never absent). Decode with
// `onExcessProperty: "error"` to reject excess keys.

const T = Schema.String; // text
const B = Schema.Boolean; // boolean
const I = Schema.Int; // integer
const TS = Schema.String; // timestamp without time zone (ISO-8601 string)
const BY = Schema.Uint8ArrayFromSelf; // bytea
const N = Schema.NullOr; // nullable column

export const UserRow = Schema.Struct({
	id: T,
	name: T,
	email: T,
	email_verified: B,
	image: N(T),
	locale: N(T),
	created_at: TS,
	updated_at: TS,
	is_anonymous: N(B),
	role: N(T),
	banned: N(B),
	ban_reason: N(T),
	ban_expires: N(TS),
});
export type UserRow = Schema.Schema.Type<typeof UserRow>;

export const AccountRow = Schema.Struct({
	id: T,
	account_id: T,
	provider_id: T,
	user_id: T,
	access_token: N(T),
	refresh_token: N(T),
	id_token: N(T),
	access_token_expires_at: N(TS),
	refresh_token_expires_at: N(TS),
	scope: N(T),
	password: N(T),
	created_at: TS,
	updated_at: TS,
});
export type AccountRow = Schema.Schema.Type<typeof AccountRow>;

export const OrganizationRow = Schema.Struct({
	id: T,
	name: T,
	slug: T,
	logo: N(T),
	metadata: N(T),
	description: N(T),
	repos_enabled: B,
	tables_enabled: B,
	work_enabled: B,
	default_resource_privilege: T,
	ai_enabled: B,
	ai_default_token_limit: I,
	ai_default_character_limit: I,
	ai_provider_base_url: N(T),
	ai_provider_model: N(T),
	ai_provider_api_key: N(T),
	created_at: TS,
});
export type OrganizationRow = Schema.Schema.Type<typeof OrganizationRow>;

export const OrganizationMemberRow = Schema.Struct({
	id: T,
	organization_id: T,
	user_id: T,
	role: T,
	ai_token_limit: N(I),
	ai_character_limit: N(I),
	joined_at: TS,
});
export type OrganizationMemberRow = Schema.Schema.Type<
	typeof OrganizationMemberRow
>;

export const OrganizationRoleRow = Schema.Struct({
	id: T,
	organization_id: T,
	role: T,
	permission: T,
	created_at: TS,
	updated_at: TS,
});
export type OrganizationRoleRow = Schema.Schema.Type<
	typeof OrganizationRoleRow
>;

export const TeamRow = Schema.Struct({
	id: T,
	name: T,
	organization_id: T,
	source: T,
	icon: N(T),
	parent_team_id: N(T),
	created_at: TS,
	updated_at: N(TS),
});
export type TeamRow = Schema.Schema.Type<typeof TeamRow>;

export const TeamMemberRow = Schema.Struct({
	id: T,
	team_id: T,
	user_id: T,
	created_at: N(TS),
});
export type TeamMemberRow = Schema.Schema.Type<typeof TeamMemberRow>;

export const InvitationRow = Schema.Struct({
	id: T,
	organization_id: T,
	email: T,
	role: N(T),
	team_id: N(T),
	status: T,
	expires_at: TS,
	created_at: TS,
	inviter_id: T,
});
export type InvitationRow = Schema.Schema.Type<typeof InvitationRow>;

export const ApiKeyRow = Schema.Struct({
	id: T,
	config_id: T,
	name: N(T),
	start: N(T),
	reference_id: T,
	prefix: N(T),
	key: T,
	user_id: N(T),
	refill_interval: N(I),
	refill_amount: N(I),
	last_refill_at: N(TS),
	enabled: N(B),
	rate_limit_enabled: N(B),
	rate_limit_time_window: N(I),
	rate_limit_max: N(I),
	request_count: N(I),
	remaining: N(I),
	last_request: N(TS),
	expires_at: N(TS),
	created_at: TS,
	updated_at: TS,
	permissions: N(T),
	metadata: N(T),
});
export type ApiKeyRow = Schema.Schema.Type<typeof ApiKeyRow>;

export const UserAvatarRow = Schema.Struct({
	id: T,
	user_id: T,
	mime_type: T,
	size: I,
	data: BY,
	created_at: TS,
	updated_at: TS,
});
export type UserAvatarRow = Schema.Schema.Type<typeof UserAvatarRow>;

export const SessionRow = Schema.Struct({
	id: T,
	expires_at: TS,
	token: T,
	created_at: TS,
	updated_at: TS,
	ip_address: N(T),
	user_agent: N(T),
	user_id: T,
	active_organization_id: N(T),
	active_team_id: N(T),
	impersonated_by: N(T),
});
export type SessionRow = Schema.Schema.Type<typeof SessionRow>;

export const VerificationRow = Schema.Struct({
	id: T,
	identifier: T,
	value: T,
	expires_at: TS,
	created_at: TS,
	updated_at: TS,
});
export type VerificationRow = Schema.Schema.Type<typeof VerificationRow>;

export const PrincipalRow = Schema.Struct({
	id: T,
	kind: T,
	user_id: T,
	apikey_id: N(T),
});
export type PrincipalRow = Schema.Schema.Type<typeof PrincipalRow>;

export const IdentityGrantRow = Schema.Struct({
	org_id: T,
	principal_id: T,
	capability: T,
});
export type IdentityGrantRow = Schema.Schema.Type<typeof IdentityGrantRow>;

export const IdentityImportRow = Schema.Struct({
	source_id: T,
	table_name: T,
	source_pk: T,
	digest: T,
});
export type IdentityImportRow = Schema.Schema.Type<typeof IdentityImportRow>;
