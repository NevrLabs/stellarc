import { Context, type Effect } from "effect";
import type { IdentityEvent } from "../../../contracts/src/identity/events";
import type {
	ApiKeyPublic,
	AvatarPublic,
	IdentityError,
	InvitationPublic,
	MemberPublic,
	OrganizationPublic,
	PrincipalPublic,
	RolePublic,
	TeamMemberPublic,
	TeamPublic,
	UserPublic,
} from "../../../contracts/src/identity/http";

// Identity service interfaces (Tags only — no Layer, no SQL). Signatures reference
// the contract Schemas; implementations are T1 (#15) app work.

export class IdentityStore extends Context.Tag("stellarc/IdentityStore")<
	IdentityStore,
	{
		readonly userById: (id: string) => Effect.Effect<UserPublic, IdentityError>;
		readonly organizationById: (
			id: string,
		) => Effect.Effect<OrganizationPublic, IdentityError>;
		readonly listOrganizations: () => Effect.Effect<
			ReadonlyArray<OrganizationPublic>,
			IdentityError
		>;
		readonly listMembers: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<MemberPublic>, IdentityError>;
		readonly listRoles: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<RolePublic>, IdentityError>;
		readonly listTeams: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<TeamPublic>, IdentityError>;
		readonly listTeamMembers: (
			teamId: string,
		) => Effect.Effect<ReadonlyArray<TeamMemberPublic>, IdentityError>;
		readonly listInvitations: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<InvitationPublic>, IdentityError>;
		readonly listApiKeys: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<ApiKeyPublic>, IdentityError>;
		readonly avatarByUserId: (
			userId: string,
		) => Effect.Effect<AvatarPublic, IdentityError>;
	}
>() {}

export class OrgRouter extends Context.Tag("stellarc/OrgRouter")<
	OrgRouter,
	{
		readonly resolve: (
			orgId: string,
		) => Effect.Effect<
			{ readonly schema: "public"; readonly orgId: string },
			IdentityError
		>;
	}
>() {}

export class PrincipalResolver extends Context.Tag(
	"stellarc/PrincipalResolver",
)<
	PrincipalResolver,
	{
		readonly resolve: (
			actor: unknown,
		) => Effect.Effect<PrincipalPublic, IdentityError>;
	}
>() {}

export class IdentityEvents extends Context.Tag("stellarc/IdentityEvents")<
	IdentityEvents,
	{
		readonly append: (
			event: IdentityEvent,
		) => Effect.Effect<void, IdentityError>;
	}
>() {}
