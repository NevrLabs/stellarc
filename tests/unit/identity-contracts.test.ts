import { Context, Schema } from "effect";
import { expect, test } from "vitest";
import * as authSchemas from "../../packages/contracts/src/identity/auth-schemas";
import {
	IDENTITY_SCHEMA_VERSION,
	IdentityEventPayloadSchemas,
} from "../../packages/contracts/src/identity/events";
import {
	ApiKeyPublic,
	ConflictCode,
	CreateApiKeyRequest,
	CreateOrganizationRequest,
	ID,
	IdentityApiGroup,
	IdentityError,
	OrganizationPublic,
	UserPublic,
} from "../../packages/contracts/src/identity/http";
import * as rows from "../../packages/contracts/src/identity/tables";
import * as domain from "../../packages/domain/src/identity";

const decode = (schema: Schema.Schema.Any) => (input: unknown) =>
	Schema.decodeUnknownSync(schema as Schema.Schema<unknown, unknown, never>)(
		input,
		{ onExcessProperty: "error" },
	);

const T = "2026-01-01T00:00:00Z";

// --- U1 row-schema samples (snake_case, §2 types) --------------------------------------
const rowSamples: Record<string, Record<string, unknown>> = {
	UserRow: {
		id: "u1",
		name: "n",
		email: "u@x.test",
		email_verified: true,
		image: null,
		locale: null,
		created_at: T,
		updated_at: T,
		is_anonymous: null,
		role: null,
		banned: null,
		ban_reason: null,
		ban_expires: null,
	},
	AccountRow: {
		id: "a1",
		account_id: "acct",
		provider_id: "email",
		user_id: "u1",
		access_token: null,
		refresh_token: null,
		id_token: null,
		access_token_expires_at: null,
		refresh_token_expires_at: null,
		scope: null,
		password: null,
		created_at: T,
		updated_at: T,
	},
	OrganizationRow: {
		id: "o1",
		name: "Org",
		slug: "org",
		logo: null,
		metadata: null,
		description: null,
		repos_enabled: true,
		tables_enabled: true,
		work_enabled: true,
		default_resource_privilege: "manage",
		ai_enabled: true,
		ai_default_token_limit: 1024,
		ai_default_character_limit: 4000,
		ai_provider_base_url: null,
		ai_provider_model: null,
		ai_provider_api_key: null,
		created_at: T,
	},
	OrganizationMemberRow: {
		id: "m1",
		organization_id: "o1",
		user_id: "u1",
		role: "member",
		ai_token_limit: null,
		ai_character_limit: null,
		joined_at: T,
	},
	OrganizationRoleRow: {
		id: "r1",
		organization_id: "o1",
		role: "admin",
		permission: "{}",
		created_at: T,
		updated_at: T,
	},
	TeamRow: {
		id: "t1",
		name: "Team",
		organization_id: "o1",
		source: "kaneo",
		icon: null,
		parent_team_id: null,
		created_at: T,
		updated_at: null,
	},
	TeamMemberRow: {
		id: "tm1",
		team_id: "t1",
		user_id: "u1",
		created_at: null,
	},
	InvitationRow: {
		id: "i1",
		organization_id: "o1",
		email: "i@x.test",
		role: null,
		team_id: null,
		status: "pending",
		expires_at: T,
		created_at: T,
		inviter_id: "u1",
	},
	ApiKeyRow: {
		id: "k1",
		config_id: "default",
		name: null,
		start: null,
		reference_id: "u1",
		prefix: null,
		key: "secret",
		user_id: null,
		refill_interval: null,
		refill_amount: null,
		last_refill_at: null,
		enabled: true,
		rate_limit_enabled: true,
		rate_limit_time_window: 86400000,
		rate_limit_max: 10,
		request_count: 0,
		remaining: null,
		last_request: null,
		expires_at: null,
		created_at: T,
		updated_at: T,
		permissions: null,
		metadata: null,
	},
	UserAvatarRow: {
		id: "av1",
		user_id: "u1",
		mime_type: "image/png",
		size: 123,
		data: new Uint8Array([1, 2, 3]),
		created_at: T,
		updated_at: T,
	},
	SessionRow: {
		id: "s1",
		expires_at: T,
		token: "tok",
		created_at: T,
		updated_at: T,
		ip_address: null,
		user_agent: null,
		user_id: "u1",
		active_organization_id: null,
		active_team_id: null,
		impersonated_by: null,
	},
	VerificationRow: {
		id: "v1",
		identifier: "u@x.test",
		value: "1234",
		expires_at: T,
		created_at: T,
		updated_at: T,
	},
	PrincipalRow: {
		id: "p1",
		kind: "human",
		user_id: "u1",
		apikey_id: null,
	},
	IdentityGrantRow: {
		org_id: "o1",
		principal_id: "p1",
		capability: "manage",
	},
	IdentityImportRow: {
		source_id: "src",
		table_name: "user",
		source_pk: "u1",
		digest: "d",
	},
};

test("U1 each of the 15 row Schemas round-trips a valid row and rejects missing/excess keys", () => {
	const entries = Object.entries(rowSamples);
	expect(entries).toHaveLength(15);
	for (const [name, sample] of entries) {
		const schema = (rows as unknown as Record<string, Schema.Schema.Any>)[name];
		expect(schema, name).toBeDefined();
		// valid row decodes
		expect(decode(schema)(sample), name).toEqual(sample);
		// excess key rejected
		expect(() => decode(schema)({ ...sample, bogus: 1 }), name).toThrow();
		// missing (first, required) column rejected
		const { [Object.keys(sample)[0]]: _drop, ...rest } = sample;
		expect(() => decode(schema)(rest), name).toThrow();
	}
});

// --- U2 event samples -------------------------------------------------------------------
const userPublic = {
	id: "u1",
	name: "n",
	email: "u@x.test",
	emailVerified: true,
	image: null,
	locale: null,
	createdAt: T,
	updatedAt: T,
	isAnonymous: null,
};
const orgPublic = {
	id: "o1",
	name: "Org",
	slug: "org",
	logo: null,
	metadata: null,
	description: null,
	reposEnabled: true,
	tablesEnabled: true,
	workEnabled: true,
	defaultResourcePrivilege: "manage",
	aiEnabled: true,
	aiDefaultTokenLimit: 1024,
	aiDefaultCharacterLimit: 4000,
	aiProviderBaseUrl: null,
	aiProviderModel: null,
	createdAt: T,
};
const apiKeyPublic = {
	id: "k1",
	configId: "default",
	name: null,
	start: null,
	referenceId: "u1",
	prefix: null,
	refillInterval: null,
	refillAmount: null,
	lastRefillAt: null,
	enabled: true,
	rateLimitEnabled: true,
	rateLimitTimeWindow: 86400000,
	rateLimitMax: 10,
	requestCount: 0,
	remaining: null,
	lastRequest: null,
	expiresAt: null,
	createdAt: T,
	updatedAt: T,
	permissions: null,
	metadata: null,
};
const memberPublic = {
	id: "m1",
	organizationId: "o1",
	userId: "u1",
	role: "member",
	aiTokenLimit: null,
	aiCharacterLimit: null,
	joinedAt: T,
	user: { id: "u1", name: "n", email: "u@x.test", image: null },
	principalId: "p1",
};
const teamMemberPublic = {
	id: "tm1",
	teamId: "t1",
	userId: "u1",
	createdAt: null,
	organizationId: "o1",
};
const principalPublic = { id: "p1", kind: "human" as const, userId: "u1" };
const rolePublic = {
	id: "r1",
	organizationId: "o1",
	role: "admin",
	permission: { board: ["read"] },
	createdAt: T,
	updatedAt: T,
};
const teamPublic = {
	id: "t1",
	name: "Team",
	organizationId: "o1",
	source: "kaneo",
	icon: null,
	parentTeamId: null,
	createdAt: T,
	updatedAt: null,
};
const invitationPublic = {
	id: "i1",
	organizationId: "o1",
	email: "i@x.test",
	role: null,
	teamId: null,
	status: "pending",
	expiresAt: T,
	createdAt: T,
	inviterId: "u1",
};

const eventSamples: Record<keyof typeof IdentityEventPayloadSchemas, unknown> =
	{
		"identity:organization-upserted": { id: "o1", row: orgPublic },
		"identity:member-upserted": { id: "m1", row: memberPublic },
		"identity:role-upserted": { id: "r1", row: rolePublic },
		"identity:team-upserted": { id: "t1", row: teamPublic },
		"identity:team-member-upserted": { id: "tm1", row: teamMemberPublic },
		"identity:invitation-upserted": { id: "i1", row: invitationPublic },
		"identity:apikey-upserted": { id: "k1", row: apiKeyPublic },
		"identity:principal-upserted": { id: "p1", row: principalPublic },
		"identity:user-upserted": { id: "u1", row: userPublic },
		"identity:member-deleted": { id: "m1" },
		"identity:role-deleted": { id: "r1" },
		"identity:team-deleted": { id: "t1" },
		"identity:team-member-deleted": { id: "tm1" },
		"identity:apikey-deleted": { id: "k1" },
		"identity:grant-upserted": { principalId: "p1", capability: "manage" },
		"identity:grant-deleted": { principalId: "p1", capability: "manage" },
		"identity:avatar-upserted": { userId: "u1", avatarId: "av1", updatedAt: T },
	};

test("U2 all 17 event payload Schemas decode canonical samples; version 1; no secret/byte fields", () => {
	expect(IDENTITY_SCHEMA_VERSION).toBe(1);
	expect(Object.keys(eventSamples)).toHaveLength(17);
	for (const [type, sample] of Object.entries(eventSamples)) {
		const schema =
			IdentityEventPayloadSchemas[
				type as keyof typeof IdentityEventPayloadSchemas
			];
		expect(decode(schema)(sample), type).toEqual(sample);
	}
	// secret/byte fields never in events
	const apikey = decode(
		IdentityEventPayloadSchemas["identity:apikey-upserted"],
	)(eventSamples["identity:apikey-upserted"]) as {
		row: Record<string, unknown>;
	};
	expect(Object.keys(apikey.row)).not.toContain("key");
	expect(Object.keys(apikey.row)).not.toContain("userId");
	expect(JSON.stringify(eventSamples["identity:avatar-upserted"])).not.toMatch(
		/data|byte/i,
	);
});

test("U3 contract surface: 26 endpoints, 7 error tags, 5 Conflict codes, 4 domain Tags", () => {
	const endpoints = Object.entries(IdentityApiGroup.endpoints);
	expect(endpoints).toHaveLength(26);

	const expected: Record<string, { method: string; path: string }> = {
		"active-org": { method: "POST", path: "/api/identity/active-org" },
		"list-organizations": {
			method: "GET",
			path: "/api/identity/organizations",
		},
		"create-organization": {
			method: "POST",
			path: "/api/identity/organizations",
		},
		"update-organization": { method: "PATCH", path: "/api/identity/orgs/:org" },
		"list-members": { method: "GET", path: "/api/identity/orgs/:org/members" },
		"update-member": {
			method: "PATCH",
			path: "/api/identity/orgs/:org/members/:id",
		},
		"delete-member": {
			method: "DELETE",
			path: "/api/identity/orgs/:org/members/:id",
		},
		"list-roles": { method: "GET", path: "/api/identity/orgs/:org/roles" },
		"create-role": { method: "POST", path: "/api/identity/orgs/:org/roles" },
		"update-role": {
			method: "PATCH",
			path: "/api/identity/orgs/:org/roles/:id",
		},
		"delete-role": {
			method: "DELETE",
			path: "/api/identity/orgs/:org/roles/:id",
		},
		"list-teams": { method: "GET", path: "/api/identity/orgs/:org/teams" },
		"create-team": { method: "POST", path: "/api/identity/orgs/:org/teams" },
		"update-team": {
			method: "PATCH",
			path: "/api/identity/orgs/:org/teams/:id",
		},
		"delete-team": {
			method: "DELETE",
			path: "/api/identity/orgs/:org/teams/:id",
		},
		"list-team-members": {
			method: "GET",
			path: "/api/identity/orgs/:org/teams/:id/members",
		},
		"add-team-member": {
			method: "POST",
			path: "/api/identity/orgs/:org/teams/:id/members",
		},
		"delete-team-member": {
			method: "DELETE",
			path: "/api/identity/orgs/:org/teams/:id/members/:memberId",
		},
		"list-invitations": {
			method: "GET",
			path: "/api/identity/orgs/:org/invitations",
		},
		"create-invitation": {
			method: "POST",
			path: "/api/identity/orgs/:org/invitations",
		},
		"cancel-invitation": {
			method: "POST",
			path: "/api/identity/orgs/:org/invitations/:id/cancel",
		},
		"accept-invitation": {
			method: "POST",
			path: "/api/identity/invitations/:id/accept",
		},
		"list-apikeys": { method: "GET", path: "/api/identity/orgs/:org/apikeys" },
		"create-apikey": {
			method: "POST",
			path: "/api/identity/orgs/:org/apikeys",
		},
		"delete-apikey": {
			method: "DELETE",
			path: "/api/identity/orgs/:org/apikeys/:id",
		},
		"user-avatar": { method: "GET", path: "/api/identity/users/:id/avatar" },
	};

	for (const [name, endpoint] of endpoints) {
		const e = expected[name];
		expect(e, name).toBeDefined();
		expect(endpoint.method, name).toBe(e.method);
		expect(endpoint.path, name).toBe(e.path);
	}

	// IdentityError: exactly 7 tags
	expect(IdentityError.members).toHaveLength(7);
	// Conflict code literal: exactly 5 codes
	expect(ConflictCode.literals).toHaveLength(5);

	// domain file exports exactly 4 Tags and no Layer symbols
	expect(Object.keys(domain).sort()).toEqual([
		"IdentityEvents",
		"IdentityStore",
		"OrgRouter",
		"PrincipalResolver",
	]);
	for (const key of Object.keys(domain)) expect(key).not.toMatch(/Live|Layer/);
	expect(Context.isTag(domain.IdentityStore)).toBe(true);
	expect(Context.isTag(domain.OrgRouter)).toBe(true);
	expect(Context.isTag(domain.PrincipalResolver)).toBe(true);
	expect(Context.isTag(domain.IdentityEvents)).toBe(true);
});

test("U4 request validation primitives accept valid samples and reject invalid ones", () => {
	// sign-in: valid email accepted, non-email rejected, excess key rejected
	const signIn = decode(authSchemas.SignInEmailRequest);
	expect(signIn({ email: "a@b.co", password: "x" })).toEqual({
		email: "a@b.co",
		password: "x",
	});
	expect(() => signIn({ email: "not-an-email", password: "x" })).toThrow();
	expect(() =>
		signIn({ email: "a@b.co", password: "x", extra: true }),
	).toThrow();

	// create-organization: name ≤ 256; excess keys rejected
	const createOrg = decode(CreateOrganizationRequest);
	expect(createOrg({ name: "Acme", slug: "acme" })).toEqual({
		name: "Acme",
		slug: "acme",
	});
	expect(() => createOrg({ name: "x".repeat(257), slug: "acme" })).toThrow();
	expect(() => createOrg({ name: "Acme", slug: "acme", extra: 1 })).toThrow();

	// create-apikey: valid Permission accepted; excess keys rejected
	const createKey = decode(CreateApiKeyRequest);
	expect(createKey({ name: "k", permissions: { board: ["read"] } })).toEqual({
		name: "k",
		permissions: { board: ["read"] },
	});
	expect(() =>
		createKey({ name: "k", permissions: { board: ["read"] }, extra: 1 }),
	).toThrow();

	// ID primitive: ≤128 accepted, >128 rejected
	expect(decode(ID)("x".repeat(128))).toBe("x".repeat(128));
	expect(() => decode(ID)("x".repeat(129))).toThrow();

	// public rows accept their canonical shapes (spot check on the ones U4 exercises)
	expect(decode(UserPublic)(userPublic)).toEqual(userPublic);
	expect(decode(OrganizationPublic)(orgPublic)).toEqual(orgPublic);
	expect(decode(ApiKeyPublic)(apiKeyPublic)).toEqual(apiKeyPublic);
});
